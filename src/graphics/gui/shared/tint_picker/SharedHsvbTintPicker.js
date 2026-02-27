// src/graphics/gui/shared/tint_picker/SharedHsvbTintPicker.js
// Shared HSVB tint picker with hue wheel + SV triangle.

import {
    WALL_BASE_TINT_BRIGHTNESS_MAX,
    WALL_BASE_TINT_BRIGHTNESS_MIN,
    composeTintHexFromState,
    rgb01FromHsv,
    sanitizeWallBaseTintState
} from '../../../../app/buildings/WallBaseTintModel.js';

const EPS = 1e-9;

function clamp(value, min, max, fallback = min) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function hexCss(value) {
    const hex = Number.isFinite(value) ? ((Number(value) >>> 0) & 0xffffff) : 0xffffff;
    return `#${hex.toString(16).padStart(6, '0')}`;
}

function toBarycentric(point, a, b, c) {
    const v0x = b.x - a.x;
    const v0y = b.y - a.y;
    const v1x = c.x - a.x;
    const v1y = c.y - a.y;
    const v2x = point.x - a.x;
    const v2y = point.y - a.y;
    const d00 = v0x * v0x + v0y * v0y;
    const d01 = v0x * v1x + v0y * v1y;
    const d11 = v1x * v1x + v1y * v1y;
    const d20 = v2x * v0x + v2y * v0y;
    const d21 = v2x * v1x + v2y * v1y;
    const denom = d00 * d11 - d01 * d01;
    if (Math.abs(denom) <= EPS) return { wa: 1, wb: 0, wc: 0 };
    const v = (d11 * d20 - d01 * d21) / denom;
    const w = (d00 * d21 - d01 * d20) / denom;
    const u = 1 - v - w;
    return { wa: u, wb: v, wc: w };
}

function clampBarycentric({ wa = 0, wb = 0, wc = 0 } = {}) {
    let a = Math.max(0, wa);
    let b = Math.max(0, wb);
    let c = Math.max(0, wc);
    const sum = a + b + c;
    if (sum <= EPS) return { wa: 1, wb: 0, wc: 0 };
    a /= sum;
    b /= sum;
    c /= sum;
    return { wa: a, wb: b, wc: c };
}

function isPointInTriangle(point, a, b, c) {
    const bary = toBarycentric(point, a, b, c);
    return bary.wa >= -1e-6 && bary.wb >= -1e-6 && bary.wc >= -1e-6;
}

function createSliderRow({ label, min, max, step, digits, onInput }) {
    const row = document.createElement('div');
    row.className = 'ui-shared-tint-picker-slider';

    const labelEl = document.createElement('div');
    labelEl.className = 'ui-shared-tint-picker-slider-label';
    labelEl.textContent = label;

    const controls = document.createElement('div');
    controls.className = 'ui-shared-tint-picker-slider-controls';

    const range = document.createElement('input');
    range.type = 'range';
    range.className = 'ui-shared-tint-picker-range';
    range.min = String(min);
    range.max = String(max);
    range.step = String(step);

    const number = document.createElement('input');
    number.type = 'number';
    number.className = 'ui-shared-tint-picker-number';
    number.min = String(min);
    number.max = String(max);
    number.step = String(step);

    const format = (v) => (digits <= 0 ? String(Math.round(v)) : v.toFixed(digits));
    const setValue = (raw) => {
        const safe = clamp(raw, min, max, min);
        range.value = String(safe);
        number.value = format(safe);
    };

    const emit = (raw) => {
        const safe = clamp(raw, min, max, min);
        setValue(safe);
        onInput?.(safe);
    };

    range.addEventListener('input', () => emit(Number(range.value)));
    number.addEventListener('input', () => emit(Number(number.value)));

    controls.appendChild(range);
    controls.appendChild(number);
    row.appendChild(labelEl);
    row.appendChild(controls);

    return {
        row,
        range,
        number,
        setValue,
        setDisabled: (disabled) => {
            const off = !!disabled;
            range.disabled = off;
            number.disabled = off;
        }
    };
}

export class SharedHsvbTintPicker {
    constructor({ initialState = null, onChange = null, sizePx = 176 } = {}) {
        this._state = sanitizeWallBaseTintState(initialState ?? {});
        this._onChange = typeof onChange === 'function' ? onChange : null;
        this._sizePx = clamp(sizePx, 140, 320, 176);
        this._disabled = false;
        this._dragPointerId = null;
        this._dragMode = null;

        this.element = document.createElement('div');
        this.element.className = 'ui-shared-tint-picker';

        const top = document.createElement('div');
        top.className = 'ui-shared-tint-picker-top';

        this._canvas = document.createElement('canvas');
        this._canvas.className = 'ui-shared-tint-picker-canvas';
        this._canvas.width = Math.round(this._sizePx);
        this._canvas.height = Math.round(this._sizePx);
        this._canvas.style.width = `${Math.round(this._sizePx)}px`;
        this._canvas.style.height = `${Math.round(this._sizePx)}px`;
        this._ctx = this._canvas.getContext('2d');

        this._preview = document.createElement('div');
        this._preview.className = 'ui-shared-tint-picker-preview';

        this._swatch = document.createElement('div');
        this._swatch.className = 'ui-shared-tint-picker-swatch';

        this._hex = document.createElement('div');
        this._hex.className = 'ui-shared-tint-picker-hex';

        this._readout = document.createElement('div');
        this._readout.className = 'ui-shared-tint-picker-readout';

        this._preview.appendChild(this._swatch);
        this._preview.appendChild(this._hex);
        this._preview.appendChild(this._readout);

        top.appendChild(this._canvas);
        top.appendChild(this._preview);
        this.element.appendChild(top);

        this._brightnessRow = createSliderRow({
            label: 'Brightness',
            min: WALL_BASE_TINT_BRIGHTNESS_MIN,
            max: WALL_BASE_TINT_BRIGHTNESS_MAX,
            step: 0.01,
            digits: 2,
            onInput: (next) => {
                this._state = sanitizeWallBaseTintState({ ...this._state, brightness: next });
                this._syncUi();
                this._emitChange();
            }
        });
        this.element.appendChild(this._brightnessRow.row);

        this._intensityRow = createSliderRow({
            label: 'Intensity',
            min: 0,
            max: 1,
            step: 0.01,
            digits: 2,
            onInput: (next) => {
                this._state = sanitizeWallBaseTintState({ ...this._state, intensity: next });
                this._syncUi();
                this._emitChange();
            }
        });
        this.element.appendChild(this._intensityRow.row);

        this._onPointerDown = (e) => this._handlePointerDown(e);
        this._onPointerMove = (e) => this._handlePointerMove(e);
        this._onPointerUp = (e) => this._handlePointerUp(e);
        this._onPointerCancel = (e) => this._handlePointerUp(e);

        this._canvas.addEventListener('pointerdown', this._onPointerDown);
        this._canvas.addEventListener('pointermove', this._onPointerMove);
        this._canvas.addEventListener('pointerup', this._onPointerUp);
        this._canvas.addEventListener('pointercancel', this._onPointerCancel);

        this._syncUi();
    }

    getState() {
        return sanitizeWallBaseTintState(this._state);
    }

    setState(nextState) {
        this._state = sanitizeWallBaseTintState(nextState ?? {});
        this._syncUi();
    }

    setDisabled(disabled) {
        this._disabled = !!disabled;
        this.element.classList.toggle('is-disabled', this._disabled);
        this._canvas.classList.toggle('is-disabled', this._disabled);
        this._brightnessRow.setDisabled(this._disabled);
        this._intensityRow.setDisabled(this._disabled);
    }

    dispose() {
        this._canvas.removeEventListener('pointerdown', this._onPointerDown);
        this._canvas.removeEventListener('pointermove', this._onPointerMove);
        this._canvas.removeEventListener('pointerup', this._onPointerUp);
        this._canvas.removeEventListener('pointercancel', this._onPointerCancel);
    }

    _emitChange() {
        this._onChange?.(this.getState());
    }

    _syncUi() {
        this._brightnessRow.setValue(this._state.brightness);
        this._intensityRow.setValue(this._state.intensity);
        const tintHex = composeTintHexFromState(this._state);
        this._swatch.style.background = hexCss(tintHex);
        this._hex.textContent = hexCss(tintHex).toUpperCase();
        this._readout.textContent = [
            `H ${Math.round(this._state.hueDeg)}`,
            `S ${Math.round(this._state.saturation * 100)}%`,
            `V ${Math.round(this._state.value * 100)}%`
        ].join(' · ');
        this._drawCanvas();
    }

    _canvasPointFromEvent(e) {
        const rect = this._canvas.getBoundingClientRect();
        if (!(rect.width > 0) || !(rect.height > 0)) return { x: 0, y: 0 };
        const x = ((Number(e?.clientX) - rect.left) / rect.width) * this._sizePx;
        const y = ((Number(e?.clientY) - rect.top) / rect.height) * this._sizePx;
        return {
            x: clamp(x, 0, this._sizePx, 0),
            y: clamp(y, 0, this._sizePx, 0)
        };
    }

    _geometry() {
        const size = this._sizePx;
        const cx = size * 0.5;
        const cy = size * 0.5;
        const outerR = size * 0.49;
        const innerR = size * 0.39;
        const triR = innerR - size * 0.06;
        const hueRad = (this._state.hueDeg * Math.PI) / 180;
        const polar = (angle, radius) => ({
            x: cx + Math.cos(angle) * radius,
            y: cy + Math.sin(angle) * radius
        });
        const colorV = polar(hueRad, triR);
        const whiteV = polar(hueRad + (Math.PI * 2 / 3), triR);
        const blackV = polar(hueRad - (Math.PI * 2 / 3), triR);
        return { size, cx, cy, outerR, innerR, colorV, whiteV, blackV };
    }

    _resolveSvPoint(geo) {
        const value = clamp(this._state.value, 0, 1, 1);
        const saturation = clamp(this._state.saturation, 0, 1, 0);
        const wColor = saturation * value;
        const wWhite = value * (1 - saturation);
        const wBlack = 1 - value;
        return {
            x: geo.colorV.x * wColor + geo.whiteV.x * wWhite + geo.blackV.x * wBlack,
            y: geo.colorV.y * wColor + geo.whiteV.y * wWhite + geo.blackV.y * wBlack
        };
    }

    _setHueFromPoint(point, geo) {
        const angle = Math.atan2(point.y - geo.cy, point.x - geo.cx);
        const hueDeg = ((angle * 180 / Math.PI) + 360) % 360;
        this._state = sanitizeWallBaseTintState({ ...this._state, hueDeg });
        this._syncUi();
        this._emitChange();
    }

    _setSvFromPoint(point, geo) {
        const bary = clampBarycentric(toBarycentric(point, geo.colorV, geo.whiteV, geo.blackV));
        const value = clamp(bary.wa + bary.wb, 0, 1, 1);
        const saturation = value <= EPS ? 0 : clamp(bary.wa / value, 0, 1, 0);
        this._state = sanitizeWallBaseTintState({ ...this._state, saturation, value });
        this._syncUi();
        this._emitChange();
    }

    _resolveHitMode(point, geo) {
        const dx = point.x - geo.cx;
        const dy = point.y - geo.cy;
        const distance = Math.hypot(dx, dy);
        if (distance >= geo.innerR && distance <= geo.outerR) return 'ring';
        if (isPointInTriangle(point, geo.colorV, geo.whiteV, geo.blackV)) return 'triangle';
        return null;
    }

    _handlePointerDown(e) {
        if (this._disabled) return;
        const point = this._canvasPointFromEvent(e);
        const geo = this._geometry();
        const mode = this._resolveHitMode(point, geo);
        if (!mode) return;
        this._dragPointerId = e.pointerId;
        this._dragMode = mode;
        this._canvas.setPointerCapture?.(e.pointerId);
        if (mode === 'ring') this._setHueFromPoint(point, geo);
        else this._setSvFromPoint(point, geo);
        e.preventDefault?.();
    }

    _handlePointerMove(e) {
        if (this._disabled) return;
        if (this._dragPointerId === null || e.pointerId !== this._dragPointerId) return;
        const point = this._canvasPointFromEvent(e);
        const geo = this._geometry();
        if (this._dragMode === 'ring') this._setHueFromPoint(point, geo);
        else if (this._dragMode === 'triangle') this._setSvFromPoint(point, geo);
        e.preventDefault?.();
    }

    _handlePointerUp(e) {
        if (this._dragPointerId === null || e.pointerId !== this._dragPointerId) return;
        this._canvas.releasePointerCapture?.(e.pointerId);
        this._dragPointerId = null;
        this._dragMode = null;
    }

    _drawHueRing(ctx, geo) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(geo.cx, geo.cy, geo.outerR, 0, Math.PI * 2);
        ctx.arc(geo.cx, geo.cy, geo.innerR, 0, Math.PI * 2, true);
        ctx.closePath();

        if (typeof ctx.createConicGradient === 'function') {
            const gradient = ctx.createConicGradient(0, geo.cx, geo.cy);
            for (let i = 0; i <= 6; i++) {
                const hue = (i * 60) % 360;
                gradient.addColorStop(i / 6, `hsl(${hue} 100% 50%)`);
            }
            ctx.fillStyle = gradient;
            ctx.fill();
        } else {
            for (let i = 0; i < 360; i++) {
                const a0 = (i * Math.PI) / 180;
                const a1 = ((i + 1) * Math.PI) / 180;
                ctx.beginPath();
                ctx.moveTo(geo.cx + Math.cos(a0) * geo.innerR, geo.cy + Math.sin(a0) * geo.innerR);
                ctx.lineTo(geo.cx + Math.cos(a0) * geo.outerR, geo.cy + Math.sin(a0) * geo.outerR);
                ctx.lineTo(geo.cx + Math.cos(a1) * geo.outerR, geo.cy + Math.sin(a1) * geo.outerR);
                ctx.lineTo(geo.cx + Math.cos(a1) * geo.innerR, geo.cy + Math.sin(a1) * geo.innerR);
                ctx.closePath();
                ctx.fillStyle = `hsl(${i} 100% 50%)`;
                ctx.fill();
            }
        }
        ctx.restore();
    }

    _drawSvTriangle(ctx, geo) {
        const hueRgb = rgb01FromHsv({ hueDeg: this._state.hueDeg, saturation: 1, value: 1 });
        const hueColor = hexCss((Math.round(hueRgb.r * 255) << 16) | (Math.round(hueRgb.g * 255) << 8) | Math.round(hueRgb.b * 255));
        const midX = (geo.colorV.x + geo.whiteV.x) * 0.5;
        const midY = (geo.colorV.y + geo.whiteV.y) * 0.5;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(geo.colorV.x, geo.colorV.y);
        ctx.lineTo(geo.whiteV.x, geo.whiteV.y);
        ctx.lineTo(geo.blackV.x, geo.blackV.y);
        ctx.closePath();
        ctx.clip();

        const baseGradient = ctx.createLinearGradient(geo.whiteV.x, geo.whiteV.y, geo.colorV.x, geo.colorV.y);
        baseGradient.addColorStop(0, '#ffffff');
        baseGradient.addColorStop(1, hueColor);
        ctx.fillStyle = baseGradient;
        ctx.fillRect(0, 0, geo.size, geo.size);

        const blackGradient = ctx.createLinearGradient(geo.blackV.x, geo.blackV.y, midX, midY);
        blackGradient.addColorStop(0, 'rgba(0,0,0,1)');
        blackGradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = blackGradient;
        ctx.fillRect(0, 0, geo.size, geo.size);

        ctx.restore();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(geo.colorV.x, geo.colorV.y);
        ctx.lineTo(geo.whiteV.x, geo.whiteV.y);
        ctx.lineTo(geo.blackV.x, geo.blackV.y);
        ctx.closePath();
        ctx.stroke();
    }

    _drawMarkers(ctx, geo) {
        const hueRad = (this._state.hueDeg * Math.PI) / 180;
        const markerRadius = (geo.innerR + geo.outerR) * 0.5;
        const hueX = geo.cx + Math.cos(hueRad) * markerRadius;
        const hueY = geo.cy + Math.sin(hueRad) * markerRadius;

        ctx.beginPath();
        ctx.arc(hueX, hueY, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.stroke();

        const sv = this._resolveSvPoint(geo);
        ctx.beginPath();
        ctx.arc(sv.x, sv.y, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
    }

    _drawCanvas() {
        const ctx = this._ctx;
        if (!ctx) return;
        ctx.clearRect(0, 0, this._sizePx, this._sizePx);
        const geo = this._geometry();
        this._drawHueRing(ctx, geo);
        this._drawSvTriangle(ctx, geo);
        this._drawMarkers(ctx, geo);
    }
}
