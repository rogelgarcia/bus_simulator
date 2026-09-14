"""AI568 wall-only material controls; raw linear lobes are distinct from display scores."""
import json
import sys
from pathlib import Path
import numpy as np
import OpenImageIO as oiio
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'lighting_configurations/postprocess'))
from color_pipeline import ExrPasses, read_pass, three_aces, srgb_encode, srgb_decode, write_png, save_json, Y


def png(file):
    image = oiio.ImageInput.open(str(file))
    if not image:
        raise RuntimeError('Cannot read ' + str(file))
    try:
        return image.read_image(format=oiio.FLOAT)[:, :, :3]
    finally:
        image.close()


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
capture, control, reference = (Path(request[key]) for key in ['capture', 'control', 'reference'])
regions = json.loads((control / 'measurements.json').read_text())
controls = json.loads((control / 'request.json').read_text())
renders = json.loads((reference / 'renders.json').read_text())
sun_renders = json.loads((reference / 'contributions.json').read_text())
rows, sheets = [], []
(root / 'images').mkdir()
for pose in request['poses']:
    name = pose['id']
    metadata = json.loads((capture / name / 'metadata.json').read_text())
    shape = (metadata['height'], metadata['width'], 4)
    game = {key: np.flipud(np.fromfile(capture / name / (key + '.rgba32f'), dtype='<f4').reshape(shape))[:, :, :3]
            for key in metadata['passes']}
    target = next(item for item in renders if item['pose'] == name)
    exposure = 2 ** target['exposureEv']
    if abs(exposure - metadata['exposure']) > 1e-8:
        raise RuntimeError('Exposure mismatch')
    exr = ExrPasses(target['file'], name)
    diffuse_color = exr.read('Diffuse Color')
    diffuse = (exr.read('Diffuse Direct') + exr.read('Diffuse Indirect')) * diffuse_color
    glossy_direct = exr.read('Glossy Direct') * exr.read('Glossy Color')
    glossy_indirect = exr.read('Glossy Indirect') * exr.read('Glossy Color')
    glossy = glossy_direct + glossy_indirect
    sun = next(item for item in sun_renders if item['pose'] == name)
    sun_diffuse = read_pass(sun['file'], 'Diffuse Direct', layer=name) * diffuse_color
    cycles = {'combined': exr.read(), 'noisy_combined': exr.read('Noisy Image'), 'diffuse': diffuse, 'specular': glossy,
              'specular_direct': glossy_direct, 'specular_indirect': glossy_indirect,
              'albedo': diffuse_color, 'sun_diffuse': sun_diffuse,
              'non_sun_diffuse': diffuse - sun_diffuse, 'emission': exr.read('Emission')}
    game['specular'] = game['combined'] - game['diffuse']
    game['specular_no_material_ao'] = game['combined_no_material_ao'] - game['diffuse_no_material_ao']
    if any(value.shape != shape[:2] + (3,) or not np.isfinite(value).all() for value in [*game.values(), *cycles.values()]):
        raise RuntimeError('Nonfinite or mismatched raw images')
    for region in next(item['regions'] for item in regions['poses'] if item['pose'] == name):
        if not region['region'].endswith('_facade'):
            continue
        stem = name + '_' + region['region']
        mask = png(control / 'masks' / (stem + '.png'))[:, :, 0] > .5
        if int(mask.sum()) != region['pixels']:
            raise RuntimeError('Frozen wall mask changed')
        checks = {
            'restorationMaxLinearDifference': float(np.abs(game['combined'] - game['combined_restored'])[mask].max()),
            'gameDiffuseClosureMaxDifference': float(np.abs(game['diffuse_no_material_ao'] - game['direct_no_material_ao'] - game['indirect_no_material_ao'])[mask].max()),
            'cyclesMeanClosureRelativeError': float(np.abs(cycles['combined'] - diffuse - glossy - cycles['emission'])[mask].mean() / cycles['combined'][mask].mean()),
            'cyclesNoisyClosureMeanAbsoluteRelativeError': float(np.abs(cycles['noisy_combined'] - diffuse - glossy - cycles['emission'])[mask].mean() / cycles['noisy_combined'][mask].mean()),
            'cyclesDenoisingMeanYChangePercent': float(100 * ((cycles['combined'][mask] @ Y).mean() / (cycles['noisy_combined'][mask] @ Y).mean() - 1)),
            'cyclesMeanEmission': float(cycles['emission'][mask].mean())}
        if checks['restorationMaxLinearDifference'] > 1e-5 or checks['gameDiffuseClosureMaxDifference'] > 1e-4 or checks['cyclesMeanEmission'] > 1e-6:
            raise RuntimeError(f'{stem}: failed restoration/diffuse closure/non-emissive wall check: {checks}')
        if checks['cyclesNoisyClosureMeanAbsoluteRelativeError'] > 1e-5:
            raise RuntimeError(f'{stem}: Cycles color-weighted lobes do not reconstruct its noisy beauty')
        # Denoised Combined and noisy raw lobes need not reconstruct pixel-for-pixel.
        row = {'pose': name, 'region': region['region'], 'material': region['material'], 'checks': checks, 'masks': []}
        for distance in [0, 3, 6]:
            selected = inset(mask, distance) if distance else mask
            if selected.sum() < 100:
                continue
            gy = {key: float((value[selected] @ Y).mean()) for key, value in game.items()}
            cy = {key: float((value[selected] @ Y).mean()) for key, value in cycles.items()}
            pairs = {'beauty': ('combined', 'combined'), 'beautyNoAo': ('combined_no_material_ao', 'combined'),
                     'beautyNoAoVsNoisy': ('combined_no_material_ao', 'noisy_combined'),
                     'diffuseNoAo': ('diffuse_no_material_ao', 'diffuse'), 'specularNoAo': ('specular_no_material_ao', 'specular'),
                     'albedoDiagnostic': ('albedo', 'albedo'), 'sunDiffuse': ('direct_no_material_ao', 'sun_diffuse'),
                     'skyAndBounceDiffuse': ('indirect_no_material_ao', 'non_sun_diffuse')}
            ratios = {key: gy[g] / cy[c] if cy[c] > 1e-6 else None for key, (g, c) in pairs.items()}
            good = selected & (game['albedo'].min(axis=2) > .01) & (diffuse_color.min(axis=2) > .01)
            demod = None
            if good.sum() >= 100:
                a = (game['indirect_no_material_ao'][good] / game['albedo'][good]) @ Y
                b = (cycles['non_sun_diffuse'][good] / diffuse_color[good]) @ Y
                demod = float(a.mean() / b.mean())
            display_game = three_aces(game['combined_no_material_ao'][selected], exposure)
            display_cycles = three_aces(cycles['combined'][selected], exposure)
            row['masks'].append({'additionalInsetPixels': distance, 'pixels': int(selected.sum()),
                'meanSceneLinearY': {'game': gy, 'cycles': cy}, 'gameToCyclesRatio': ratios,
                'colorNormalizedSkyBounceRatioDiagnostic': demod, 'colorNormalizationPixels': int(good.sum()),
                'textureAoDiffuseLossPercent': 100 * (1 - gy['diffuse'] / gy['diffuse_no_material_ao']),
                'cyclesIndirectSpecularSharePercent': 100 * cy['specular_indirect'] / cy['specular'],
                'displayNoAoBiasPercent': float(100 * ((srgb_decode(display_game) @ Y).mean() / (srgb_decode(display_cycles) @ Y).mean() - 1))})
        rows.append(row)
        rect = controls['regions']['facades'][name][region['region']]
        x0, y0, x1, y1 = [int(v * size) for v, size in zip(rect, [shape[1], shape[0], shape[1], shape[0]])]
        for key, g, c in [('ao_off', 'combined_no_material_ao', 'combined'), ('diffuse', 'diffuse_no_material_ao', 'diffuse'), ('albedo', 'albedo', 'albedo')]:
            panels = []
            for source, value, label in [('game', game[g], 'Game · texture AO off' if key == 'ao_off' else 'Game · ' + key),
                                         ('cycles', cycles[c], 'Cycles · no texture AO' if key == 'ao_off' else 'Cycles · ' + key)]:
                display = srgb_encode(np.maximum(value, 0)) if key == 'albedo' else three_aces(np.maximum(value, 0), exposure)
                display[~mask] = .22
                file = root / 'images' / (stem + '_' + key + '_' + source + '.png')
                write_png(file, display[y0:y1, x0:x1])
                panels.append({'file': str(file), 'label': label + ' | wall only'})
            width = max(480, x1 - x0)
            sheets.append({'file': str(root / (stem + '_' + key + '.png')), 'panels': panels,
                           'width': width * 2, 'height': round((y1 - y0) * width / (x1 - x0)) + 48})
        print(json.dumps({'pose': name, 'region': region['region'], 'ratios': row['masks'][0]['gameToCyclesRatio'], 'checks': checks}), flush=True)

limitations = [
    'AO bypass is diagnostic only. Cycles computes geometric occlusion but has no exported texture AO.',
    'Cycles diffuse/glossy Direct+Indirect are multiplied by their Color pass exactly once. Combined is denoised; lobe reconstruction is not expected to match per pixel.',
    'Cycles Direct includes sky. Named-sun diffuse comes from the saved sun-only Direct pass; full diffuse minus that term includes sky and all bounces.',
    'Game combined minus diffuse includes specular and emission; sampled Cycles walls are validated non-emissive.',
    'Cycles Diffuse Color contains BSDF diffuse weighting; game albedo is diffuseColor. Their ratio and color-normalized diffuse ratio are diagnostics, not an exact base-color/irradiance proof.',
    'Frozen masks come from Cycles material IDs. Window edges are excluded; an independent game ID intersection remains a separate improvement.',
    'Mean ratios on small near-black contributions can be unstable. This is not whole-scene parity or a timed performance benchmark.']
save_json(root / 'analysis.json', {'schemaVersion': 1, 'rows': rows, 'limitations': limitations})
save_json(root / 'sheets.json', sheets)
lines = ['# AI568 material equivalence step 1', '',
         'Scene-linear game/Cycles ratios on frozen opaque wall pixels, texture AO bypassed. A ratio of 1 means equal regional mean radiance for that term.', '',
         '| Pose / wall | Pixels | Beauty | Diffuse | Specular | Albedo diagnostic | Sky + bounce diffuse | Color-normalized sky + bounce diagnostic |',
         '|---|---:|---:|---:|---:|---:|---:|---:|']
for row in rows:
    sample = row['masks'][0]
    ratios = sample['gameToCyclesRatio']
    values = [ratios[key] for key in ['beautyNoAo', 'diffuseNoAo', 'specularNoAo', 'albedoDiagnostic', 'skyAndBounceDiffuse']]
    values.append(sample['colorNormalizedSkyBounceRatioDiagnostic'])
    lines.append(f"| {row['pose']} / {row['region']} | {sample['pixels']} | " + ' | '.join('n/a' if value is None else f'{value:.4f}' for value in values) + ' |')
lines += ['', 'All extra-inset measurements, term means, closure/restoration checks and display-space values are retained in `analysis.json`.', '']
lines += ['- ' + item for item in limitations]
lines += ['', 'Pass reconstruction follows the [Blender render-pass contract](https://docs.blender.org/manual/en/4.5/render/layers/passes.html#combining).']
(root / 'analysis.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
