"""Composes the AI 599 D5 ecosystem scaling runs (landscape_ecosystem_scaling.pwtest.js reports) into one same-condition table and one plot of the scaling curves.

Usage:
  python tools/landscape_review/ecosystem_scaling.py --output <scaling.md> --plot <scaling.png> off=<run dir> x1=<run dir> x2=<run dir> x4=<run dir>

Each run directory holds the suite's report.json. The table lists, per run and pose, the resident tiles and instances, the ecosystem draws and
triangles, the share bytes, the frame, CPU and GPU times, the total draw calls and triangles and the peak upload; the plot draws instances,
draws, triangles, GPU time and share bytes against the run label (the baseline run without the ecosystem is the first point). Pillow only.
"""
import argparse
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

MiB = 1024 * 1024
BACKGROUND = (250, 250, 247)
INK = (40, 44, 48)
GRID = (205, 208, 212)
SERIES = [(31, 119, 180), (214, 96, 39), (44, 160, 44), (148, 103, 189), (140, 86, 75), (227, 119, 194)]


def font(size):
    for name in ('segoeui.ttf', 'arial.ttf'):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def number(value, digits=2):
    return '—' if value is None else f"{value:,.{digits}f}"


def stat(entry, key):
    value = entry.get(key)
    return value if isinstance(value, dict) else None


def gpu(entry):
    value = entry.get('gpuMs')
    return value if isinstance(value, dict) and value.get('status') == 'measured' else None


def table(runs):
    lines = ['| Run | Stop | Tiles | Instances | Drawn | Eco draws | Eco triangles | Share CPU / GPU MiB | Frame median / p95 ms | CPU frame median ms | GPU median / p95 ms | Draw calls | Triangles | Peak upload MiB/frame |',
             '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
    for label, report in runs:
        for stop in report['stops'] + ([dict(report['travel'], id=f"travel {report['travel']['from']}→{report['travel']['to']}")] if report.get('travel') else []):
            eco = stop['state'].get('ecosystem')
            frame, cpu, g = stat(stop, 'frameMs'), stat(stop, 'cpuFrameMs'), gpu(stop)
            draws, tris = stat(stop, 'drawCalls'), stat(stop, 'triangles')
            share = eco.get('share') if eco else None
            lines.append(f"| {label} | {stop['id']} | {eco['resident'] if eco else 0} | {eco['residentInstances'] if eco else 0:,} | {eco['drawnInstances'] if eco else 0:,} | {eco['draws'] if eco else 0} | {eco['triangles'] if eco else 0:,} | "
                         f"{number(share['cpuBytes'] / MiB) + ' / ' + number(share['gpuBytes'] / MiB) if share else '—'} | {number(frame and frame['median'])} / {number(frame and frame['p95'])} | {number(cpu and cpu['median'])} | "
                         f"{number(g and g['median']) + ' / ' + number(g and g['p95']) if g else 'not measured'} | {number(draws and draws['median'], 0)} | {number(tris and tris['median'], 0)} | {number(stop.get('peakUploadedBytesPerFrame', 0) / MiB)} |")
    return '\n'.join(lines) + '\n'


def plot(runs, output):
    metrics = [('Resident instances', lambda eco, stop: eco['residentInstances'] if eco else 0),
               ('Ecosystem draws', lambda eco, stop: eco['draws'] if eco else 0),
               ('Ecosystem triangles (thousands)', lambda eco, stop: (eco['triangles'] if eco else 0) / 1000),
               ('GPU median ms', lambda eco, stop: (gpu(stop) or {}).get('median')),
               ('CPU frame median ms', lambda eco, stop: (stat(stop, 'cpuFrameMs') or {}).get('median')),
               ('Share GPU MiB', lambda eco, stop: eco['share']['gpuBytes'] / MiB if eco and eco.get('share') else 0)]
    panel, margin, columns = 300, 44, 3
    rows = (len(metrics) + columns - 1) // columns
    image = Image.new('RGB', (margin * (columns + 1) + panel * columns, margin * (rows + 1) + panel * rows + 30), BACKGROUND)
    draw = ImageDraw.Draw(image)
    f, title_font = font(12), font(15)
    draw.text((margin, 10), 'Ecosystem scaling: ' + ', '.join(label for label, _ in runs), fill=INK, font=title_font)
    stops = [stop['id'] for stop in runs[0][1]['stops']]
    for index, (name, value_of) in enumerate(metrics):
        x0 = margin + (index % columns) * (panel + margin)
        y0 = margin + 30 + (index // columns) * (panel + margin)
        box = (x0, y0 + 20, x0 + panel, y0 + panel)
        draw.rectangle(box, outline=GRID)
        draw.text((x0, y0), name, fill=INK, font=f)
        series = {}
        for label, report in runs:
            for stop in report['stops']:
                series.setdefault(stop['id'], []).append(value_of(stop['state'].get('ecosystem'), stop))
        maximum = max([v for values in series.values() for v in values if v is not None] + [1e-9])
        width, height = panel, panel - 20
        for k, stop_id in enumerate(stops):
            values = series.get(stop_id, [])
            points = [(x0 + width * (i + 0.5) / len(runs), y0 + panel - height * (v / maximum)) for i, v in enumerate(values) if v is not None]
            if len(points) >= 2:
                draw.line(points, fill=SERIES[k % len(SERIES)], width=2)
            for point in points:
                draw.ellipse([point[0] - 3, point[1] - 3, point[0] + 3, point[1] + 3], fill=SERIES[k % len(SERIES)])
            draw.text((x0 + 6, y0 + 26 + 14 * k), stop_id, fill=SERIES[k % len(SERIES)], font=f)
        for i, (label, _) in enumerate(runs):
            draw.text((x0 + width * (i + 0.5) / len(runs) - 8, y0 + panel + 4), label, fill=INK, font=f)
        draw.text((x0 + panel - 90, y0 + 22), f"max {maximum:,.1f}", fill=INK, font=f)
    image.save(output)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--output', required=True)
    parser.add_argument('--plot', default=None)
    parser.add_argument('runs', nargs='+', help='label=<run directory holding report.json>')
    arguments = parser.parse_args()
    runs = []
    for entry in arguments.runs:
        label, directory = entry.split('=', 1)
        with open(os.path.join(directory, 'report.json'), encoding='utf-8') as handle:
            runs.append((label, json.load(handle)))
    header = f"Runs: {', '.join(f'{label} ({report['ecosystem']['revision'] if report.get('ecosystem') else 'off'})' for label, report in runs)}; {runs[0][1]['hardware']['cpuModel']}, {runs[0][1].get('metadata', {}).get('renderer', {}).get('renderer', 'GPU unknown')}; 1920 × 1080; 30 warm-up and 120 sampled frames per stop.\n\n"
    with open(arguments.output, 'w', encoding='utf-8') as handle:
        handle.write('# Ecosystem scaling\n\n' + header + table(runs))
    if arguments.plot:
        plot(runs, arguments.plot)
    print(arguments.output)
    return 0


if __name__ == '__main__':
    sys.exit(main())
