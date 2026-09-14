"""Fixed-display bake progress sheets and eroded regional image measurements."""
import sys, json, shutil, time
from pathlib import Path
import numpy as np
import OpenImageIO as oiio
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'lighting_configurations/postprocess'))
from color_pipeline import read_pass, srgb_decode, write_png, save_json, Y

root = Path(sys.argv[1])
r = json.loads((root / 'request.json').read_text())
scene = json.loads(Path(json.loads((Path(r['reference']) / 'scene.json').read_text())['manifest']).read_text())
material_ids = {name: int(value) for value, name in scene['build']['materialMasks'].items()}
audit = {item['id']: item for item in scene['materialAudit']}
(root / 'images').mkdir()
(root / 'masks').mkdir()
(root / 'crops').mkdir()
sheets = []
roles = [source['role'] for source in r['sources']]
has_previous = 'previous' in roles

def pixels(file):
    image = oiio.ImageInput.open(str(file))
    if not image:
        raise RuntimeError('Cannot decode ' + str(file))
    try:
        value = image.read_image(format=oiio.FLOAT)[:, :, :3]
    finally:
        image.close()
    if not np.isfinite(value).all():
        raise RuntimeError('Nonfinite image')
    return value

def erode(mask, distance):
    result = mask.copy()
    for axis in [0, 1]:
        for shift in range(1, distance + 1):
            result &= np.roll(mask, shift, axis) & np.roll(mask, -shift, axis)
    result[:distance] = False
    result[-distance:] = False
    result[:, :distance] = False
    result[:, -distance:] = False
    return result

def resized(a, width, height):
    source = oiio.ImageBuf(np.ascontiguousarray(a))
    target = oiio.ImageBuf(oiio.ImageSpec(width, height, 3, oiio.FLOAT))
    if not oiio.ImageBufAlgo.resize(target, source):
        raise RuntimeError(target.geterror())
    return target.get_pixels(oiio.FLOAT)

def sheet(file, images, labels, width=960, height=540):
    canvas = np.full((height + 48, width * len(images), 3), [.045, .065, .085], dtype=np.float32)
    for index, image in enumerate(images):
        canvas[48:, index * width:(index + 1) * width] = resized(image, width, height)
    write_png(file, canvas)
    sheets.append({'file': str(file), 'width': width * len(images), 'height': height + 48, 'labels': labels})

def measurement(a, reference, mask):
    x, y = srgb_decode(a[mask]), srgb_decode(reference[mask])
    lx, ly = x @ Y, y @ Y
    return {'meanDisplayLinearY': float(lx.mean()), 'referenceMeanDisplayLinearY': float(ly.mean()),
            'meanLuminanceBiasPercent': float(100 * (lx.mean() / max(ly.mean(), 1e-9) - 1)),
            'srgbMae': float(np.abs(a[mask] - reference[mask]).mean()),
            'displayLinearRmse': float(np.sqrt(np.mean((x - y) ** 2))),
            'displayLinearAbsoluteErrorP95': float(np.percentile(np.abs(lx - ly), 95))}

results = []
for pose in r['poses']:
    started = time.monotonic()
    name, target = pose['id'], pose['target']
    versions = [record['baked']['status']['profileId'].split('.')[-1] for record in pose['records']]
    labels = [f'{role.capitalize()} game bake ({version})' for role, version in zip(roles, versions)] + ['Cycles reference']
    paths = [Path(source['root']) / record['image'] for source, record in zip(r['sources'], pose['records'])] + [Path(target['image'])]
    images = [pixels(file) for file in paths]
    if any(image.shape != images[0].shape for image in images):
        raise RuntimeError(name + ': unequal image sizes')
    for role, file in zip(roles + ['cycles'], paths):
        shutil.copy2(file, root / 'images' / (name + '_' + role + '.png'))
    sheet(root / (name + '.png'), images, [name + ' | ' + label for label in labels])
    indices = read_pass(target['file'], 'Material Index', channels=['X'], layer=name)[:, :, 0]
    h, w = indices.shape
    masks = {}
    for region, rect in r['regions']['facades'][name].items():
        x0, y0, x1, y1 = [int(value * size) for value, size in zip(rect, [w, h, w, h])]
        selection = indices[y0:y1, x0:x1]
        values, counts = np.unique(selection[selection > 0], return_counts=True)
        if not len(values):
            raise RuntimeError(name + ': empty facade selection')
        value = values[np.argmax(counts)]
        identity = scene['build']['materialMasks'][str(int(value))]
        material = audit[identity]
        if material['scope'] != 'city' or material.get('interiorProxy') or material.get('metalness', 0) > .2 or material.get('opacity', 1) < 1:
            raise RuntimeError(name + ': facade rectangle selected a nonopaque surface: ' + identity)
        area = np.zeros((h, w), bool)
        area[y0:y1, x0:x1] = True
        masks[region] = (erode((indices == value) & area, r['regions']['erosionPixels']), identity)
    for region, identity in r['regions']['road'].items():
        for state, rect in r['regions']['roadAreas'][name].items():
            x0, y0, x1, y1 = [int(value * size) for value, size in zip(rect, [w, h, w, h])]
            area = np.zeros((h, w), bool)
            area[y0:y1, x0:x1] = True
            masks[region + '_' + state] = (erode((indices == material_ids[identity]) & area, r['regions']['erosionPixels']), identity)
    rows = []
    for region, (mask, identity) in masks.items():
        if mask.sum() < r['regions']['minimumPixels']:
            continue
        write_png(root / 'masks' / (name + '_' + region + '.png'), np.repeat(mask[:, :, None], 3, axis=2))
        overlay = images[-1].copy()
        overlay[mask] = .55 * overlay[mask] + .45 * np.array([.9, .38, .12])
        write_png(root / 'masks' / (name + '_' + region + '_overlay.png'), overlay)
        measured = {role: measurement(image, images[-1], mask) for role, image in zip(roles, images[:-1])}
        material = audit[identity]
        # Old authenticated exports predate the explicit comparison contract.
        # Preserve them, but never interpret omitted material inputs as missing light.
        omitted = list(material.get('untranslatedProceduralHooks', []))
        if material.get('removedLighting', {}).get('aoMap'): omitted.append('texture AO')
        contract = material.get('comparisonContract', {'kind':'source-texture-reference',
            'productionMaterialInputsEquivalent':not omitted, 'omitted':omitted})
        row = {'region': region, 'material': identity, 'pixels': int(mask.sum()),
               'materialComparison':contract, 'isolatedIlluminationError':False, **measured}
        if has_previous:
            row['maeReductionPercent'] = 100 * (1 - measured['current']['srgbMae'] / max(measured['previous']['srgbMae'], 1e-9))
        rows.append(row)
        if region in r['regions']['facades'][name]:
            x0, y0, x1, y1 = [int(value * size) for value, size in zip(r['regions']['facades'][name][region], [w, h, w, h])]
            cw, ch = x1 - x0, y1 - y0
            sheet(root / 'crops' / (name + '_' + region + '.png'), [image[y0:y1, x0:x1] for image in images], labels, 700, round(700 * ch / cw))
    whole = np.ones((h, w), bool)
    results.append({'pose': name, 'regions': rows, 'wholeFrameContextOnly': {role: measurement(image, images[-1], whole) for role, image in zip(roles, images[:-1])},
                    'seconds': time.monotonic() - started})
    print(json.dumps({'pose': name, 'regions': len(rows), 'seconds': results[-1]['seconds']}), flush=True)

report = {'schemaVersion': 2, 'poses': results, 'roles': roles,
          'metric': 'Fixed-display PNG analysis: sRGB MAE, linearized-display RMSE and mean luminance bias. Not scene-linear irradiance or a 99% parity certification.',
          'limits': ['Source identities and any between-capture differences are retained in request.json.',
                     'Regional brightness bias is an appearance difference, not isolated lighting error. Per-region materialComparison records omitted procedural variation and texture AO; use material-parity-capture phase=source to isolate source-material response.',
                     'Reference bus/glass materials, procedural interiors, AO and shadow reconstruction differ. Whole-frame scores include these approximations.',
                     'Road samples under the bus also include dynamic sky/bounce occlusion differences; they do not isolate static bake brightness.',
                     'Regional masks come from Cycles material IDs, eroded to remove boundaries. Sunlit/shadow rectangles are manually selected local samples on the reference.',
                     'Missing regions have fewer than 100 interior pixels; they are not counted as zero error.',
                     'Existing Cycles target has 128 samples; noise/convergence is not a certified 1% reference budget.']}
save_json(root / 'measurements.json', report)
save_json(root / 'sheets.json', sheets)
lines = ['# Five-pose bake comparison', '', 'Columns: ' + ', '.join(roles) + ' game bake, fixed Cycles reference. Actual bake versions appear on each sheet.', '',
         '1920 x 1080 source images; ACESFilmic; grading and sun bloom off; fixed exposure and 55-degree sunlight.', '', report['metric'], '',
         '| Pose | Region | Pixels | ' + ('Previous brightness bias | ' if has_previous else '') + 'Current brightness bias | ' + ('RGB MAE reduction |' if has_previous else 'sRGB MAE |'),
         '|---|---|---:|' + ('---:|' if has_previous else '') + '---:|---:|']
for pose in results:
    for row in pose['regions']:
        prior = f"{row['previous']['meanLuminanceBiasPercent']:+.1f}% | " if has_previous else ''
        error = f"{row['maeReductionPercent']:+.1f}%" if has_previous else f"{row['current']['srgbMae']:.4f}"
        lines.append(f"| {pose['pose']} | {row['region']} | {row['pixels']} | {prior}{row['current']['meanLuminanceBiasPercent']:+.1f}% | {error} |")
lines += ['', 'Negative brightness bias means the game is darker than Cycles. sRGB MAE is on a 0-1 scale.' + (' Positive MAE reduction means closer agreement.' if has_previous else ''), '']
lines += ['- ' + limit for limit in report['limits']]
(root / 'comparison.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
