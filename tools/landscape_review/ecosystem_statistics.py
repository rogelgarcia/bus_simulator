"""Plots the spatial statistics of an ecosystem bake receipt (AI 599): pair correlation g(r), nearest-neighbour direction rose and the density-vs-target bars per layer.

Usage:
  python tools/landscape_review/ecosystem_statistics.py --receipt tests/artifacts/screens/landscape/ai599/d2/ecosystem-bake.json --output tests/artifacts/screens/landscape/ai599/d5/statistics.png

Pillow and NumPy only (no matplotlib): fixed colours and layout, no timestamps, so the same receipt gives the same PNG.
"""
import argparse
import json
import math
import sys

from PIL import Image, ImageDraw, ImageFont

BACKGROUND = (250, 250, 247)
INK = (40, 44, 48)
GRID = (205, 208, 212)
SERIES = [(31, 119, 180), (214, 96, 39), (44, 160, 44), (148, 103, 189)]
PANEL = 360
MARGIN = 48


def font(size):
    for name in ('segoeui.ttf', 'arial.ttf'):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def axes(draw, box, title, f):
    x0, y0, x1, y1 = box
    draw.rectangle(box, outline=GRID)
    draw.text((x0, y0 - 24), title, fill=INK, font=f)


def plot_correlation(draw, box, layers, f):
    x0, y0, x1, y1 = box
    axes(draw, box, 'Pair correlation g(r) (1 = Poisson)', f)
    width, height = x1 - x0, y1 - y0
    maximum = max([max(layer['spatial']['pairCorrelation']['values'] + [1.0]) for layer in layers.values()] + [1.0])
    for k, (layer_id, layer) in enumerate(layers.items()):
        values = layer['spatial']['pairCorrelation']['values']
        bin_meters = layer['spatial']['pairCorrelation']['binMeters']
        points = []
        for i, value in enumerate(values):
            px = x0 + width * (i + 0.5) / len(values)
            py = y1 - height * min(value, maximum) / maximum
            points.append((px, py))
        draw.line(points, fill=SERIES[k % len(SERIES)], width=2)
        draw.text((x0 + 8, y0 + 8 + 16 * k), f"{layer_id}: bin {bin_meters} m, reach {bin_meters * len(values)} m", fill=SERIES[k % len(SERIES)], font=f)
    poisson = y1 - height / maximum
    draw.line([(x0, poisson), (x1, poisson)], fill=GRID, width=1)
    draw.text((x1 - 70, poisson - 16), 'g = 1', fill=INK, font=f)


def plot_rose(draw, box, layers, f):
    x0, y0, x1, y1 = box
    axes(draw, box, 'Nearest-neighbour directions (8 sectors)', f)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    radius = min(x1 - x0, y1 - y0) / 2 - 24
    draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], outline=GRID)
    for k, (layer_id, layer) in enumerate(layers.items()):
        sectors = layer['spatial']['anisotropy']['sectors']
        total = max(1, sum(sectors))
        expected = total / len(sectors)
        points = []
        for i, count in enumerate(sectors):
            angle = (i + 0.5) * 2 * math.pi / len(sectors)
            r = radius * min(2.0, count / expected) / 2
            points.append((cx + r * math.cos(angle), cy - r * math.sin(angle)))
        points.append(points[0])
        draw.line(points, fill=SERIES[k % len(SERIES)], width=2)
        chi = layer['spatial']['anisotropy']['chiSquare']
        verdict = 'isotropic' if layer['spatial']['anisotropy']['passes'] else 'anisotropic (linear habitat?)'
        draw.text((x0 + 8, y1 - 20 - 16 * (len(layers) - 1 - k)), f"{layer_id}: chi2 {chi:.2f} {verdict}", fill=SERIES[k % len(SERIES)], font=f)
    draw.ellipse([cx - radius / 2, cy - radius / 2, cx + radius / 2, cy + radius / 2], outline=GRID)


def plot_density(draw, box, layers, f):
    x0, y0, x1, y1 = box
    axes(draw, box, 'Instances per km2 of the best cover vs the declared target', f)
    rows = list(layers.items())
    slot = (y1 - y0) / max(1, len(rows))
    maximum = max([max(layer['target']['perSquareKilometer'] if layer.get('target') else 0, *(entry['perSquareKilometer'] for entry in layer['byCover'].values())) for _, layer in rows] + [1])
    for k, (layer_id, layer) in enumerate(rows):
        top = y0 + slot * k + 8
        best = max(layer['byCover'].items(), key=lambda item: item[1]['perSquareKilometer']) if layer['byCover'] else (None, {'perSquareKilometer': 0})
        achieved = best[1]['perSquareKilometer']
        target = layer['target']['perSquareKilometer'] if layer.get('target') else 0
        bar = x0 + 8 + (x1 - x0 - 16) * achieved / maximum
        draw.rectangle([x0 + 8, top, bar, top + slot * 0.35], fill=SERIES[k % len(SERIES)])
        if target:
            tx = x0 + 8 + (x1 - x0 - 16) * target / maximum
            draw.line([(tx, top - 4), (tx, top + slot * 0.4)], fill=INK, width=2)
        draw.text((x0 + 8, top + slot * 0.4), f"{layer_id}: {achieved:,.0f}/km2 on {best[0]}; target {target:,.0f}", fill=INK, font=f)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--receipt', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--title', default=None)
    arguments = parser.parse_args()
    with open(arguments.receipt, encoding='utf-8') as handle:
        receipt = json.load(handle)
    layers = {layer_id: layer for layer_id, layer in receipt['layers'].items() if layer.get('spatial') and layer['spatial'].get('nearest')}
    if not layers:
        print('no generated layer with statistics in the receipt', file=sys.stderr)
        return 1
    width = MARGIN * 4 + PANEL * 3
    image = Image.new('RGB', (width, PANEL + MARGIN * 2 + 24), BACKGROUND)
    draw = ImageDraw.Draw(image)
    f = font(13)
    title = arguments.title or f"Ecosystem statistics: {receipt['recipe']['id']} on {receipt['landscape']['id']} ({receipt['sidecar']['revision'] if receipt.get('sidecar') else 'unpublished'})"
    draw.text((MARGIN, 12), title, fill=INK, font=font(15))
    top = MARGIN + 24
    plot_correlation(draw, (MARGIN, top + 24, MARGIN + PANEL, top + PANEL), layers, f)
    plot_rose(draw, (MARGIN * 2 + PANEL, top + 24, MARGIN * 2 + PANEL * 2, top + PANEL), layers, f)
    plot_density(draw, (MARGIN * 3 + PANEL * 2, top + 24, MARGIN * 3 + PANEL * 3, top + PANEL), layers, f)
    image.save(arguments.output)
    print(arguments.output)
    return 0


if __name__ == '__main__':
    sys.exit(main())
