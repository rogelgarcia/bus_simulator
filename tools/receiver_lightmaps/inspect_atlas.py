"""Produces atlas diagnostics and measures float16 precision from immutable bake artifacts."""
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

artifact = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
output.mkdir(parents=True, exist_ok=True)
atlas = json.loads((artifact / 'atlas.json').read_text())
receipt = json.loads((artifact / 'receipt.json').read_text())
metrics = {}
size = atlas['profile']['pageSize']
for channel in ['direct_receiver', 'indirect_irradiance']:
    squared_error = squared_signal = maximum_error = 0.0
    values = 0
    for entry in receipt['outputs']:
        if entry['channel'] != channel:
            continue
        pixels = np.fromfile(artifact / entry['file'], '<f4').reshape(entry['height'], entry['width'], 4)
        rgb = pixels[:, :, :3]
        quantized = rgb.astype('<f2').astype('<f4')
        error = np.abs(rgb - quantized).astype(np.float64)
        squared_error += float(np.square(error).sum()); squared_signal += float(np.square(rgb.astype(np.float64)).sum())
        maximum_error = max(maximum_error, float(error.max())); values += rgb.size
        if entry['mip'] == 0:
            display = np.clip(rgb / (1 + rgb), 0, 1) ** (1 / 2.2)
            image = Image.fromarray((display[::-1] * 255).astype('uint8'))
            image.save(output / f'{channel}.page{entry["page"]}.png')
    metrics[channel] = {'rgbComponents': values, 'relativeRmse': (squared_error / max(squared_signal, 1e-30)) ** .5,
                        'absoluteRmse': (squared_error / values) ** .5, 'maximumAbsoluteError': maximum_error}
for page in range(atlas['pageCount']):
    islands = Image.new('RGB', (size, size), '#18051f')
    draw = ImageDraw.Draw(islands)
    for index, chart in enumerate(atlas['charts']):
        if chart['page'] != page: continue
        color = tuple(int(((index + 1) * seed) % 1 * 180 + 60) for seed in [.618, .382, .236])
        x, y, width, height = chart['x'], size - chart['y'] - chart['height'], chart['width'], chart['height']
        p = atlas['profile']['padding']
        draw.rectangle((x, y, x + width - 1, y + height - 1), outline='#ff3e3e', width=1)
        draw.rectangle((x + p, y + p, x + width - p - 1, y + height - p - 1), fill=color)
        if width > 40 and height > 40: draw.text((x + p + 2, y + p + 2), str(index), fill='black')
    islands.save(output / f'islands-padding-occupancy.page{page}.png')
(output / 'precision.json').write_text(json.dumps(metrics, indent=2))
(output / 'receiver-provenance.json').write_text(json.dumps([
    {key: chart[key] for key in ['id', 'mappingId', 'instanceId', 'objectId', 'chunkId', 'page', 'x', 'y', 'width', 'height']}
    for chart in atlas['charts']], indent=2))
print(json.dumps(metrics))
