"""Periodicity check of a sea capture: the normalized autocorrelation of the sea's luminance along image rows.

A spectral ocean is a sum of periodic patches; this check measures whether the rendered sea repeats across the frame. It takes a capture
(PNG), a sea region (left, top, right, bottom in pixels), high-passes every row of the region's luminance (its moving average over
--detrend pixels removed, so smooth shading gradients do not count as correlation), averages the normalized autocorrelation over the
rows, and reports the strongest correlation beyond a minimum lag (a repeating wave pattern shows a peak comparable to the zero-lag value;
a non-repeating sea decays and stays below the threshold). It writes a JSON receipt and exits non-zero when the peak exceeds the threshold.

Usage: python tools/landscape_review/periodicity.py --image capture.png --region left,top,right,bottom [--min-lag 64] [--detrend 96] [--threshold 0.5] [--output receipt.json]
"""
import argparse
import json
import sys

import numpy as np
from PIL import Image


def high_pass(rows, window):
    """Each row minus its moving average over `window` pixels (edge-padded), so only the wave-scale texture remains."""
    if window < 2:
        return rows - rows.mean(axis=1, keepdims=True)
    pad = window // 2
    padded = np.pad(rows, ((0, 0), (pad, pad)), mode='edge')
    cumulative = np.cumsum(np.concatenate([np.zeros((rows.shape[0], 1)), padded], axis=1), axis=1)
    average = (cumulative[:, window:] - cumulative[:, :-window]) / window
    return rows - average[:, :rows.shape[1]]


def row_autocorrelation(rows, window):
    """Mean normalized autocorrelation over rows (each row high-passed and normalized by its variance)."""
    rows = high_pass(rows, window)
    width = rows.shape[1]
    size = 1
    while size < 2 * width:
        size *= 2
    spectrum = np.fft.rfft(rows, n=size, axis=1)
    correlation = np.fft.irfft(spectrum * np.conj(spectrum), n=size, axis=1)[:, :width]
    variance = correlation[:, :1]
    valid = variance[:, 0] > 1e-9
    if not valid.any():
        raise SystemExit('the region has no variation')
    normalized = correlation[valid] / variance[valid]
    counts = width - np.arange(width)
    return normalized.mean(axis=0) * width / counts


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--image', required=True)
    parser.add_argument('--region', required=True, help='left,top,right,bottom pixels of the sea region')
    parser.add_argument('--min-lag', type=int, default=64, help='smallest lag (pixels) considered a repeat')
    parser.add_argument('--detrend', type=int, default=96, help='moving-average window (pixels) removed from every row before correlating')
    parser.add_argument('--threshold', type=float, default=0.5, help='correlation above which the sea counts as repeating')
    parser.add_argument('--output', help='JSON receipt path')
    args = parser.parse_args()
    left, top, right, bottom = (int(value) for value in args.region.split(','))
    image = np.asarray(Image.open(args.image).convert('RGB'), dtype=np.float64)
    region = image[top:bottom, left:right]
    luminance = 0.2126 * region[..., 0] + 0.7152 * region[..., 1] + 0.0722 * region[..., 2]
    correlation = row_autocorrelation(luminance, args.detrend)
    max_lag = len(correlation) // 2
    lags = np.arange(args.min_lag, max_lag)
    window = correlation[args.min_lag:max_lag]
    peak_index = int(np.argmax(window))
    peak = float(window[peak_index])
    receipt = {
        'image': args.image, 'region': [left, top, right, bottom], 'minLag': args.min_lag, 'detrend': args.detrend, 'maxLag': int(max_lag), 'threshold': args.threshold,
        'peakCorrelation': peak, 'peakLag': int(lags[peak_index]), 'meanBeyondMinLag': float(window.mean()),
        'correlationAtLags': {str(int(lag)): float(correlation[lag]) for lag in [1, 2, 4, 8, 16, 32, 64, 128, 256, 512] if lag < len(correlation)},
        'repeating': peak > args.threshold
    }
    text = json.dumps(receipt, indent=2)
    if args.output:
        with open(args.output, 'w', encoding='utf-8') as handle:
            handle.write(text + '\n')
    print(text)
    sys.exit(1 if receipt['repeating'] else 0)


if __name__ == '__main__':
    main()
