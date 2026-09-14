"""Opaque reflection/AO factorial measurements on previously frozen material masks."""
import sys, json
from pathlib import Path
import numpy as np
import OpenImageIO as oiio
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'lighting_configurations/postprocess'))
from color_pipeline import srgb_decode, Y, save_json, write_png


def pixels(file):
    image = oiio.ImageInput.open(str(file))
    if not image:
        raise RuntimeError('Cannot decode ' + str(file))
    try:
        result = image.read_image(format=oiio.FLOAT)[:, :, :3]
    finally:
        image.close()
    if not np.isfinite(result).all():
        raise RuntimeError('Nonfinite image')
    return result


def measure(image, reference, mask):
    a, b = image[mask], reference[mask]
    linear_a, linear_b = srgb_decode(a), srgb_decode(b)
    ya, yb = linear_a @ Y, linear_b @ Y
    return {'meanLuminanceBiasPercent': float(100 * (ya.mean() / yb.mean() - 1)),
            'srgbMae': float(np.abs(a - b).mean()),
            'displayLinearRmse': float(np.sqrt(np.mean((linear_a - linear_b) ** 2))),
            'gameMeanRgb': a.mean(axis=0).tolist(), 'referenceMeanRgb': b.mean(axis=0).tolist()}


def inset(mask, distance):
    result = mask.copy()
    for axis in [0, 1]:
        source = result.copy()
        for shift in range(1, distance + 1):
            result &= np.roll(source, shift, axis) & np.roll(source, -shift, axis)
    result[:distance] = False
    result[-distance:] = False
    result[:, :distance] = False
    result[:, -distance:] = False
    return result


root = Path(sys.argv[1])
request = json.loads((root / 'request.json').read_text())
capture, control = Path(request['capture']), Path(request['control'])
report = request['report']
regions = json.loads((control / 'measurements.json').read_text())
rows = []
facade_sheets = []
(root / 'facades').mkdir()
control_request = json.loads((control / 'request.json').read_text())
for pose in report['poses']:
    name = pose['id']
    reference = pixels(control / 'images' / (name + '_cycles.png'))
    images = {variant['id']: pixels(capture / (name + '-' + variant['id'] + '.png')) for variant in report['variants']}
    for region in next(item['regions'] for item in regions['poses'] if item['pose'] == name):
        mask = pixels(control / 'masks' / (name + '_' + region['region'] + '.png'))[:, :, 0] > .5
        if int(mask.sum()) != region['pixels']:
            raise RuntimeError('Frozen mask count changed')
        if any(image.shape != reference.shape for image in images.values()):
            raise RuntimeError('Unequal image sizes')
        values = {variant: measure(image, reference, mask) for variant, image in images.items()}
        row = {'pose': name, 'region': region['region'], 'material': region['material'], 'pixels': region['pixels'], 'variants': values}
        if region['region'].endswith('_facade'):
            row['edgeSensitivity'] = []
            for distance in [3, 6]:
                core = inset(mask, distance)
                if core.sum() < 100:
                    continue
                row['edgeSensitivity'].append({'additionalInsetPixels': distance, 'pixels': int(core.sum()),
                    'variants': {variant: measure(image, reference, core) for variant, image in images.items()}})
            x0, y0, x1, y1 = [int(value * size) for value, size in zip(control_request['regions']['facades'][name][region['region']], [reference.shape[1], reference.shape[0], reference.shape[1], reference.shape[0]])]
            stem = name + '_' + region['region']
            panels = []
            for label, image in [('Current game', images['reflections']), ('Cycles', reference)]:
                masked = np.full_like(image, .22)
                masked[mask] = image[mask]
                suffix = 'game' if label == 'Current game' else 'cycles'
                file = root / 'facades' / (stem + '_' + suffix + '.png')
                write_png(file, masked[y0:y1, x0:x1])
                panels.append({'label': label + ' | wall pixels only', 'file': str(file)})
            overlay = images['reflections'].copy()
            overlay[mask] = .55 * overlay[mask] + .45 * np.array([.9, .38, .12])
            write_png(root / 'facades' / (stem + '_game_overlay.png'), overlay)
            facade_sheets.append({'file': str(root / 'facades' / (stem + '.png')), 'panels': panels,
                'width': (x1 - x0) * 2, 'height': y1 - y0 + 40, 'pixels': int(mask.sum())})
        rows.append(row)
        print(json.dumps({'pose': name, 'region': region['region'], 'biasPercent': {key: round(value['meanLuminanceBiasPercent'], 2) for key, value in values.items()}}), flush=True)

save_json(root / 'measurements.json', {'schemaVersion': 1, 'rows': rows, 'timings': report['summary'],
    'metric': 'sRGB error and linearized-display luminance bias on fixed eroded Cycles material masks; not scene-linear transport or whole-scene parity.',
    'limitations': 'Masks select Cycles wall material IDs within fixed regions and apply the same pixels to the aligned game capture; they are not an independent game material-ID pass. Additional 3/6 pixel insets test boundary sensitivity. AO-off is a diagnostic. Cycles lacks these texture AO maps. Environment specular is globally approximated in the game; local occlusion/reflections and BRDF normals differ.'})
save_json(root / 'facade_sheets.json', facade_sheets)
lines = ['# Material response comparison', '', request['policy'], '',
         '| Pose | Region | Variant | Brightness bias | sRGB MAE |', '|---|---|---|---:|---:|']
for row in rows:
    for variant, values in row['variants'].items():
        lines.append(f"| {row['pose']} | {row['region']} | {variant} | {values['meanLuminanceBiasPercent']:+.2f}% | {values['srgbMae']:.5f} |")
lines += ['', '## Wall selection and window-edge sensitivity', '',
          'Facade sheets replace every unmeasured pixel with gray, including windows and frames. Orange game overlays show the exact selected region. These are the existing Cycles material-ID masks applied to the aligned game image, not an independent game ID pass.', '',
          'Insets remove another 3 or 6 pixels around the already eroded mask. Regions with fewer than 100 surviving pixels are omitted. Removing edges also changes the sampled wall area; sensitivity is not solely a measure of glass contamination.', '',
          '| Pose | Region | Extra inset (px) | Wall pixels | Variant | Brightness bias |',
          '|---|---|---:|---:|---|---:|']
for row in rows:
    if 'edgeSensitivity' not in row:
        continue
    for core in [{'additionalInsetPixels': 0, 'pixels': row['pixels'], 'variants': row['variants']}] + row['edgeSensitivity']:
        for variant, values in core['variants'].items():
            lines.append(f"| {row['pose']} | {row['region']} | {core['additionalInsetPixels']} | {core['pixels']} | {variant} | {values['meanLuminanceBiasPercent']:+.2f}% |")
lines += ['', report['conditions'], '', '| Pose | Variant | GPU median | GPU p01 / p99 | CPU median | Calls | Tris | Tex / Geo / Programs |', '|---|---|---:|---:|---:|---:|---:|---|']
for row in report['summary']:
    lines.append(f"| {row['pose']} | {row['variant']} | {row['gpuMs']['median']:.3f} | {row['gpuMs']['p01']:.3f} / {row['gpuMs']['p99']:.3f} | {row['cpuMs']['median']:.3f} | {row['calls']['median']:.0f} | {row['triangles']['median']:.0f} | {row['textures']['median']:.0f} / {row['geometries']['median']:.0f} / {row['programs']['median']:.0f} |")
(root / 'comparison.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
