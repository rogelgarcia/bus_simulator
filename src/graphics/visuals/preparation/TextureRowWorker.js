// Decodes a single source and transfers only one requested RGBA strip at a time.
// @ts-check
let active = null;
self.onmessage = async ({ data }) => {
    const { type, generation, request } = data;
    try {
        if (type === 'close') {
            if (active?.generation === generation) { active.controller.abort(); active.bitmap?.close(); active = null; }
            return;
        }
        if (type === 'open') {
            active?.controller.abort(); active?.bitmap?.close();
            const state = active = { generation, controller: new AbortController(), bitmap: null, canvas: null, context: null };
            let blob = data.blob;
            if (!blob) {
                const response = await fetch(data.url, { signal: state.controller.signal });
                if (!response.ok) throw new Error(`Texture decode request failed: ${response.status}`);
                blob = await response.blob();
            }
            const bitmap = await createImageBitmap(blob, { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
            if (active !== state) { bitmap.close(); return; }
            state.bitmap = bitmap;
            self.postMessage({ request }); return;
        }
        const state = active;
        if (!state || state.generation !== generation || !state.bitmap) throw new Error('Stale texture strip request');
        const width = state.bitmap.width, { y, rows, flipY, premultiplyAlpha } = data;
        if (!state.canvas || state.canvas.height !== rows) {
            state.canvas = new OffscreenCanvas(width, rows);
            state.context = state.canvas.getContext('2d', { willReadFrequently: true });
        }
        const context = state.context;
        context.globalCompositeOperation = 'copy';
        context.setTransform(1, 0, 0, flipY ? -1 : 1, 0, flipY ? rows : 0);
        context.drawImage(state.bitmap, 0, y, width, rows, 0, 0, width, rows);
        const pixels = context.getImageData(0, 0, width, rows).data;
        if (premultiplyAlpha) for (let i = 0; i < pixels.length; i += 4) {
            const alpha = pixels[i + 3] / 255;
            pixels[i] = Math.round(pixels[i] * alpha); pixels[i + 1] = Math.round(pixels[i + 1] * alpha); pixels[i + 2] = Math.round(pixels[i + 2] * alpha);
        }
        self.postMessage({ request, pixels }, [pixels.buffer]);
    } catch (error) {
        if (request) self.postMessage({ request, error: String(error) });
    }
};
