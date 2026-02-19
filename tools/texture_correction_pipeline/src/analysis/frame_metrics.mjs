// Deterministic render-frame metrics extracted from a browser canvas.
export async function collectCanvasFrameMetrics(page, {
    canvasSelector = '#harness-canvas'
} = {}) {
    return page.evaluate(({ canvasSelector }) => {
        function clamp(v, lo, hi, fallback = lo) {
            const n = Number(v);
            if (!Number.isFinite(n)) return fallback;
            if (n < lo) return lo;
            if (n > hi) return hi;
            return n;
        }

        function round4(v) {
            const n = Number(v);
            if (!Number.isFinite(n)) return 0;
            return Math.round(n * 10000) / 10000;
        }

        function srgbToLinear(v) {
            const c = clamp(v, 0, 1, 0);
            if (c <= 0.04045) return c / 12.92;
            return ((c + 0.055) / 1.055) ** 2.4;
        }

        function linearRgbToXyz(r, g, b) {
            return {
                x: (r * 0.4124564) + (g * 0.3575761) + (b * 0.1804375),
                y: (r * 0.2126729) + (g * 0.7151522) + (b * 0.0721750),
                z: (r * 0.0193339) + (g * 0.1191920) + (b * 0.9503041)
            };
        }

        function xyzToLab(x, y, z) {
            const xr = x / 0.95047;
            const yr = y / 1.0;
            const zr = z / 1.08883;
            const f = (t) => (t > 0.008856 ? Math.cbrt(t) : ((7.787 * t) + (16 / 116)));
            const fx = f(xr);
            const fy = f(yr);
            const fz = f(zr);
            return [
                (116 * fy) - 16,
                500 * (fx - fy),
                200 * (fy - fz)
            ];
        }

        const canvas = document.querySelector(canvasSelector);
        if (!(canvas instanceof HTMLCanvasElement)) {
            return {
                width: 0,
                height: 0,
                meanLuminance: 0,
                rmsContrast: 0,
                localContrast: 0,
                gradientEnergy: 0,
                laplacianVariance: 0,
                clippingBlackPct: 0,
                clippingWhitePct: 0,
                avgLab: [50, 0, 0]
            };
        }

        const width = Math.max(1, Math.floor(canvas.width));
        const height = Math.max(1, Math.floor(canvas.height));
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
            return {
                width,
                height,
                meanLuminance: 0,
                rmsContrast: 0,
                localContrast: 0,
                gradientEnergy: 0,
                laplacianVariance: 0,
                clippingBlackPct: 0,
                clippingWhitePct: 0,
                avgLab: [50, 0, 0]
            };
        }

        const image = ctx.getImageData(0, 0, width, height);
        const data = image.data;
        const luminance = new Array(width * height);

        let lumSum = 0;
        let lumSq = 0;
        let clipBlack = 0;
        let clipWhite = 0;
        let xyzSumX = 0;
        let xyzSumY = 0;
        let xyzSumZ = 0;

        for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
            const r = data[i] / 255;
            const g = data[i + 1] / 255;
            const b = data[i + 2] / 255;
            const rl = srgbToLinear(r);
            const gl = srgbToLinear(g);
            const bl = srgbToLinear(b);
            const y = (0.2126 * rl) + (0.7152 * gl) + (0.0722 * bl);
            luminance[p] = y;
            lumSum += y;
            lumSq += y * y;
            if (y <= 0.02) clipBlack += 1;
            if (y >= 0.98) clipWhite += 1;

            const xyz = linearRgbToXyz(rl, gl, bl);
            xyzSumX += xyz.x;
            xyzSumY += xyz.y;
            xyzSumZ += xyz.z;
        }

        const n = width * height;
        const meanLum = lumSum / n;
        const variance = Math.max(0, (lumSq / n) - (meanLum * meanLum));
        const rmsContrast = Math.sqrt(variance);

        let gradSum = 0;
        let localContrastSum = 0;
        let lapSum = 0;
        let lapSq = 0;
        let interiorCount = 0;
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = y * width + x;
                const center = luminance[idx];
                const gx = luminance[idx + 1] - luminance[idx - 1];
                const gy = luminance[idx + width] - luminance[idx - width];
                const grad = Math.sqrt((gx * gx) + (gy * gy));
                gradSum += grad;

                const localMean = (luminance[idx - width] + luminance[idx + width] + luminance[idx - 1] + luminance[idx + 1]) * 0.25;
                localContrastSum += Math.abs(center - localMean);

                const lap = luminance[idx - width] + luminance[idx + width] + luminance[idx - 1] + luminance[idx + 1] - (4 * center);
                lapSum += lap;
                lapSq += lap * lap;
                interiorCount += 1;
            }
        }

        const localContrast = interiorCount > 0 ? (localContrastSum / interiorCount) : 0;
        const gradientEnergy = interiorCount > 0 ? (gradSum / interiorCount) : 0;
        const lapMean = interiorCount > 0 ? (lapSum / interiorCount) : 0;
        const lapVar = interiorCount > 0 ? Math.max(0, (lapSq / interiorCount) - (lapMean * lapMean)) : 0;

        const avgX = xyzSumX / Math.max(1, n);
        const avgY = xyzSumY / Math.max(1, n);
        const avgZ = xyzSumZ / Math.max(1, n);
        const avgLab = xyzToLab(avgX, avgY, avgZ);

        return {
            width,
            height,
            meanLuminance: round4(meanLum),
            rmsContrast: round4(rmsContrast),
            localContrast: round4(localContrast),
            gradientEnergy: round4(gradientEnergy),
            laplacianVariance: round4(lapVar),
            clippingBlackPct: round4(clipBlack / n),
            clippingWhitePct: round4(clipWhite / n),
            avgLab: [
                round4(avgLab[0]),
                round4(avgLab[1]),
                round4(avgLab[2])
            ]
        };
    }, { canvasSelector });
}

