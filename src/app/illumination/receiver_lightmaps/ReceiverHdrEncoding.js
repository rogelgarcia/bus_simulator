// Shared-exponent RGB retains dim indirect light without a page-wide exposure or clipping scale.
// @ts-check
export function encodeReceiverRgb9e5(rgba) {
    if (!(rgba instanceof Float32Array) || rgba.length % 4) throw new Error('HDR receiver input must be float32 RGBA.');
    const bytes = new Uint8Array(rgba.length), view = new DataView(bytes.buffer);
    for (let i=0;i<rgba.length;i+=4) {
        const r=rgba[i], g=rgba[i+1], b=rgba[i+2], maximum=Math.max(r,g,b);
        if (![r,g,b].every(v=>Number.isFinite(v)&&v>=0&&v<=65408)) throw new Error('Receiver irradiance exceeds RGB9E5 range at pixel '+i/4);
        let exponent = Math.max(-16,Math.floor(Math.log2(maximum)))+16;
        let unit = 2**(exponent-24);
        if (Math.round(maximum/unit)===512) { exponent++; unit*=2; }
        const packed = (Math.round(r/unit) | Math.round(g/unit)<<9 | Math.round(b/unit)<<18 | exponent<<27) >>> 0;
        view.setUint32(i,packed,true);
    }
    return bytes;
}
