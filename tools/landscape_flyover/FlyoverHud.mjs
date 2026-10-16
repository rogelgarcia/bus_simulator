// Page-side heads-up display of the landscape flyover: height above ground or water, altitude, speed, the feature caption and a minimap.
// @ts-check
// installFlyoverHud is serialized into the viewer page by Playwright (page.evaluate), so it must stay self-contained: no imports and no
// references to this module's scope. It composes each frame on a 2D canvas over a copy of the WebGL canvas taken in the same task as the
// render (the drawing buffer is not preserved), and returns the frame as a JPEG data URL.

/**
 * @typedef {{title:string, caption:string}} HudFeature
 * @typedef {{dataUrl:string, window:{minX:number,maxX:number,minZ:number,maxZ:number}, track:readonly (readonly [number, number])[]}} HudMinimap
 * @typedef {{quality:number, fovDegrees:number, durationSeconds:number, features:readonly HudFeature[], minimap:HudMinimap}} HudConfig
 * @typedef {{time:number, position:readonly number[], headingDegrees:number, heightAboveSurface:number, overWater:boolean, altitude:number,
 *   ground:number|null, speed:number, trackIndex:number, caption:{index:number, alpha:number}|null}} HudState
 */

/** @param {HudConfig} config */
export async function installFlyoverHud(config) {
    const output = document.createElement('canvas'), context = /** @type {CanvasRenderingContext2D} */ (output.getContext('2d'));
    const minimap = new Image();
    minimap.src = config.minimap.dataUrl;
    await minimap.decode();
    const font = (/** @type {number} */ weight, /** @type {number} */ size) => `${weight} ${size}px "Segoe UI", "Helvetica Neue", Arial, sans-serif`;
    const clock = (/** @type {number} */ seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
    const panel = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ w, /** @type {number} */ h, /** @type {number} */ r) => {
        context.fillStyle = 'rgba(12, 18, 24, 0.58)';
        context.beginPath(); context.roundRect(x, y, w, h, r); context.fill();
    };
    /** @param {string} text @param {number} width */
    const wrap = (text, width) => {
        const lines = [];
        let line = '';
        for (const word of text.split(/\s+/)) {
            const next = line ? `${line} ${word}` : word;
            if (line && context.measureText(next).width > width) { lines.push(line); line = word; } else line = next;
        }
        if (line) lines.push(line);
        return lines;
    };

    // telemetry panel: the height first, everything else secondary
    const drawTelemetry = (/** @type {HudState} */ state, /** @type {number} */ s) => {
        const x = 40 * s, y = 40 * s, w = 440 * s, h = 178 * s;
        panel(x, y, w, h, 14 * s);
        context.fillStyle = '#9fb3c2'; context.font = font(600, 16 * s); context.letterSpacing = `${1.2 * s}px`;
        context.fillText(state.overWater ? 'HEIGHT ABOVE WATER' : 'HEIGHT ABOVE GROUND', x + 24 * s, y + 38 * s);
        context.letterSpacing = '0px';
        const value = state.heightAboveSurface.toFixed(1);
        context.fillStyle = '#ffffff'; context.font = font(700, 60 * s);
        context.fillText(value, x + 22 * s, y + 102 * s);
        const valueWidth = context.measureText(value).width;
        context.fillStyle = '#cfdbe4'; context.font = font(500, 26 * s);
        context.fillText('m', x + 32 * s + valueWidth, y + 102 * s);
        const ground = state.ground === null ? 'open sea' : state.ground < 0 ? `seabed ${state.ground.toFixed(1)} m` : `ground ${state.ground.toFixed(1)} m`;
        context.fillStyle = '#cfdbe4'; context.font = font(500, 18 * s);
        context.fillText(`Altitude ${state.altitude.toFixed(1)} m ASL  ·  ${ground}`, x + 24 * s, y + 138 * s);
        context.fillStyle = '#8ea3b3'; context.font = font(500, 16 * s);
        context.fillText(`${state.speed.toFixed(0)} m/s  ·  heading ${String(Math.round(state.headingDegrees) % 360).padStart(3, '0')}°  ·  ${clock(state.time)} / ${clock(config.durationSeconds)}`, x + 24 * s, y + 164 * s);
    };

    // minimap: base raster, the planned track (flown part bright), the camera with its horizontal field of view
    const drawMinimap = (/** @type {HudState} */ state, /** @type {number} */ s, /** @type {number} */ width, /** @type {number} */ aspect) => {
        const size = 300 * s, x = width - 40 * s - size, y = 40 * s, map = config.minimap.window, scale = size / (map.maxX - map.minX);
        const toMap = (/** @type {number} */ wx, /** @type {number} */ wz) => [x + (wx - map.minX) * scale, y + (map.maxZ - wz) * scale];
        context.save();
        context.beginPath(); context.roundRect(x, y, size, size, 14 * s); context.clip();
        context.drawImage(minimap, x, y, size, size);
        const track = config.minimap.track;
        context.lineJoin = 'round'; context.lineCap = 'round';
        context.strokeStyle = 'rgba(255, 255, 255, 0.45)'; context.lineWidth = 2 * s;
        context.beginPath(); track.forEach(([wx, wz], index) => { const [px, py] = toMap(wx, wz); if (index) context.lineTo(px, py); else context.moveTo(px, py); }); context.stroke();
        context.strokeStyle = '#ffd166'; context.lineWidth = 3 * s;
        context.beginPath(); track.slice(0, state.trackIndex + 1).forEach(([wx, wz], index) => { const [px, py] = toMap(wx, wz); if (index) context.lineTo(px, py); else context.moveTo(px, py); });
        const [cx, cy] = toMap(state.position[0], state.position[2]);
        context.lineTo(cx, cy); context.stroke();
        const heading = state.headingDegrees * Math.PI / 180, halfFov = Math.atan(Math.tan(config.fovDegrees * Math.PI / 360) * aspect), reach = 46 * s;
        context.fillStyle = 'rgba(255, 255, 255, 0.28)';
        context.beginPath(); context.moveTo(cx, cy);
        context.lineTo(cx + Math.sin(heading - halfFov) * reach, cy - Math.cos(heading - halfFov) * reach);
        context.lineTo(cx + Math.sin(heading + halfFov) * reach, cy - Math.cos(heading + halfFov) * reach);
        context.closePath(); context.fill();
        context.fillStyle = '#ffffff'; context.strokeStyle = '#1b1f24'; context.lineWidth = 2 * s;
        context.beginPath(); context.arc(cx, cy, 5.5 * s, 0, Math.PI * 2); context.fill(); context.stroke();
        context.restore();
        context.strokeStyle = 'rgba(255, 255, 255, 0.3)'; context.lineWidth = 1 * s;
        context.beginPath(); context.roundRect(x, y, size, size, 14 * s); context.stroke();
        context.fillStyle = 'rgba(12, 18, 24, 0.62)';
        context.beginPath(); context.roundRect(x + size - 34 * s, y + 8 * s, 26 * s, 26 * s, 6 * s); context.fill();
        context.fillStyle = '#ffffff'; context.font = font(700, 15 * s); context.textAlign = 'center';
        context.fillText('N', x + size - 21 * s, y + 27 * s); context.textAlign = 'left';
        const bar = 1000 * scale;
        context.fillStyle = 'rgba(12, 18, 24, 0.62)';
        context.beginPath(); context.roundRect(x + 8 * s, y + size - 32 * s, bar + 52 * s, 24 * s, 6 * s); context.fill();
        context.fillStyle = '#ffffff'; context.fillRect(x + 16 * s, y + size - 21 * s, bar, 3 * s);
        context.font = font(600, 13 * s); context.fillText('1 km', x + 22 * s + bar, y + size - 15 * s);
    };

    // feature caption: numbered title and description, rising slightly as it fades in
    const drawCaption = (/** @type {HudState} */ state, /** @type {number} */ s, /** @type {number} */ height) => {
        if (!state.caption || state.caption.alpha <= 0) return;
        const feature = config.features[state.caption.index], alpha = state.caption.alpha, maxWidth = 860 * s;
        context.save();
        context.globalAlpha = alpha;
        context.font = font(500, 21 * s);
        const lines = wrap(feature.caption, maxWidth).slice(0, 3);
        context.font = font(700, 40 * s);
        const titleWidth = context.measureText(feature.title).width;
        context.font = font(500, 21 * s);
        const textWidth = Math.max(titleWidth, ...lines.map(line => context.measureText(line).width));
        const w = textWidth + 56 * s, h = (108 + lines.length * 30) * s, x = 40 * s, y = height - 40 * s - h + (1 - alpha) * 14 * s;
        panel(x, y, w, h, 14 * s);
        context.fillStyle = '#ffd166'; context.font = font(700, 16 * s); context.letterSpacing = `${1.5 * s}px`;
        context.fillText(`${String(state.caption.index + 1).padStart(2, '0')} / ${String(config.features.length).padStart(2, '0')}`, x + 28 * s, y + 36 * s);
        context.letterSpacing = '0px';
        context.fillStyle = '#ffffff'; context.font = font(700, 40 * s);
        context.fillText(feature.title, x + 26 * s, y + 82 * s);
        context.fillStyle = '#dfe7ee'; context.font = font(500, 21 * s);
        lines.forEach((line, index) => context.fillText(line, x + 28 * s, y + (118 + index * 30) * s));
        context.restore();
    };

    const capture = (/** @type {boolean} */ hud, /** @type {HudState|null} */ state, /** @type {string} */ type) => {
        const gl = /** @type {HTMLCanvasElement} */ (document.getElementById('game-canvas'));
        output.width = gl.width; output.height = gl.height;
        context.drawImage(gl, 0, 0);
        if (hud && state) {
            const s = gl.height / 1080;
            drawTelemetry(state, s);
            drawMinimap(state, s, gl.width, gl.width / gl.height);
            drawCaption(state, s, gl.height);
        }
        return output.toDataURL(type, config.quality);
    };
    /** @type {any} */ (window).__flyoverHud = Object.freeze({
        compose: (/** @type {HudState} */ state) => capture(true, state, 'image/jpeg'),
        raw: () => capture(false, null, 'image/png')
    });
}
