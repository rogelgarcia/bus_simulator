import { makeChoiceRow, makeEl, makeNumberSliderRow, makeToggleRow } from '../OptionsUiControls.js';

export function renderSunBloomTab() {
    this._ensureDraftSunBloom();
    const sunBloom = this._draftSunBloom;
    const emit = () => this._emitLiveChange();

    const sectionBloom = makeEl('div', 'options-section');
    sectionBloom.appendChild(makeEl('div', 'options-section-title', 'Sun Bloom'));

    const controls = {
        enabled: makeToggleRow({
            label: 'Enabled',
            value: !!sunBloom.enabled,
            onChange: (v) => { sunBloom.enabled = v; emit(); }
        }),
        mode: makeChoiceRow({
            label: 'Mode',
            value: String(sunBloom.mode ?? 'occlusion'),
            options: [
                { id: 'occlusion', label: 'Occlusion-aware' },
                { id: 'selective', label: 'Selective (no occlusion)' }
            ],
            onChange: (v) => { sunBloom.mode = v; emit(); }
        }),
        brightnessOnly: makeToggleRow({
            label: 'Brightness-only',
            value: sunBloom.brightnessOnly !== false,
            onChange: (v) => { sunBloom.brightnessOnly = v; emit(); }
        }),
        strength: makeNumberSliderRow({
            label: 'Strength',
            value: sunBloom.strength ?? 0.9,
            min: 0,
            max: 5,
            step: 0.01,
            digits: 2,
            onChange: (v) => { sunBloom.strength = v; emit(); }
        }),
        radius: makeNumberSliderRow({
            label: 'Radius',
            value: sunBloom.radius ?? 0.25,
            min: 0,
            max: 1,
            step: 0.01,
            digits: 2,
            onChange: (v) => { sunBloom.radius = v; emit(); }
        }),
        threshold: makeNumberSliderRow({
            label: 'Threshold (HDR)',
            value: sunBloom.threshold ?? 1.05,
            min: 0,
            max: 5,
            step: 0.01,
            digits: 2,
            onChange: (v) => { sunBloom.threshold = v; emit(); }
        }),
        discRadiusDeg: makeNumberSliderRow({
            label: 'Disc radius (°)',
            value: sunBloom.discRadiusDeg ?? 0.55,
            min: 0.05,
            max: 6,
            step: 0.01,
            digits: 2,
            onChange: (v) => { sunBloom.discRadiusDeg = v; emit(); }
        }),
        discIntensity: makeNumberSliderRow({
            label: 'Disc intensity',
            value: sunBloom.discIntensity ?? 25,
            min: 0,
            max: 200,
            step: 0.1,
            digits: 1,
            onChange: (v) => { sunBloom.discIntensity = v; emit(); }
        }),
        discFalloff: makeNumberSliderRow({
            label: 'Disc falloff',
            value: sunBloom.discFalloff ?? 2.2,
            min: 0.5,
            max: 10,
            step: 0.01,
            digits: 2,
            onChange: (v) => { sunBloom.discFalloff = v; emit(); }
        }),
        raysEnabled: makeToggleRow({
            label: 'Rays (starburst)',
            value: !!sunBloom.raysEnabled,
            onChange: (v) => { sunBloom.raysEnabled = v; emit(); }
        }),
        raysIntensity: makeNumberSliderRow({
            label: 'Rays intensity',
            value: sunBloom.raysIntensity ?? 0.85,
            min: 0,
            max: 6,
            step: 0.01,
            digits: 2,
            onChange: (v) => { sunBloom.raysIntensity = v; emit(); }
        }),
        raysSizePx: makeNumberSliderRow({
            label: 'Rays size (px)',
            value: sunBloom.raysSizePx ?? 950,
            min: 64,
            max: 2400,
            step: 1,
            digits: 0,
            onChange: (v) => { sunBloom.raysSizePx = v; emit(); }
        }),
        raysCount: makeNumberSliderRow({
            label: 'Ray count',
            value: sunBloom.raysCount ?? 48,
            min: 3,
            max: 256,
            step: 1,
            digits: 0,
            onChange: (v) => { sunBloom.raysCount = v; emit(); }
        }),
        raysLength: makeNumberSliderRow({
            label: 'Ray length',
            value: sunBloom.raysLength ?? 0.95,
            min: 0,
            max: 1.6,
            step: 0.01,
            digits: 2,
            onChange: (v) => { sunBloom.raysLength = v; emit(); }
        }),
        raysLengthJitter: makeNumberSliderRow({
            label: 'Length jitter',
            value: sunBloom.raysLengthJitter ?? 0.45,
            min: 0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => { sunBloom.raysLengthJitter = v; emit(); }
        }),
        raysBaseWidthDeg: makeNumberSliderRow({
            label: 'Base width (°)',
            value: sunBloom.raysBaseWidthDeg ?? 1.6,
            min: 0,
            max: 12,
            step: 0.01,
            digits: 2,
            onChange: (v) => { sunBloom.raysBaseWidthDeg = v; emit(); }
        }),
        raysTipWidthDeg: makeNumberSliderRow({
            label: 'Tip width (°)',
            value: sunBloom.raysTipWidthDeg ?? 0.28,
            min: 0,
            max: 12,
            step: 0.01,
            digits: 2,
            onChange: (v) => { sunBloom.raysTipWidthDeg = v; emit(); }
        }),
        raysSoftnessDeg: makeNumberSliderRow({
            label: 'Softness (°)',
            value: sunBloom.raysSoftnessDeg ?? 0.9,
            min: 0,
            max: 12,
            step: 0.01,
            digits: 2,
            onChange: (v) => { sunBloom.raysSoftnessDeg = v; emit(); }
        }),
        raysCoreGlow: makeNumberSliderRow({
            label: 'Core glow',
            value: sunBloom.raysCoreGlow ?? 0.35,
            min: 0,
            max: 2.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => { sunBloom.raysCoreGlow = v; emit(); }
        }),
        raysOuterGlow: makeNumberSliderRow({
            label: 'Outer glow',
            value: sunBloom.raysOuterGlow ?? 0.18,
            min: 0,
            max: 2.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => { sunBloom.raysOuterGlow = v; emit(); }
        }),
        raysRotationDeg: makeNumberSliderRow({
            label: 'Rays rotation (°)',
            value: sunBloom.raysRotationDeg ?? 0,
            min: -360,
            max: 360,
            step: 1,
            digits: 0,
            onChange: (v) => { sunBloom.raysRotationDeg = v; emit(); }
        })
    };

    sectionBloom.appendChild(controls.enabled.row);
    sectionBloom.appendChild(controls.mode.row);
    sectionBloom.appendChild(controls.brightnessOnly.row);
    sectionBloom.appendChild(controls.strength.row);
    sectionBloom.appendChild(controls.radius.row);
    sectionBloom.appendChild(controls.threshold.row);
    sectionBloom.appendChild(controls.discRadiusDeg.row);
    sectionBloom.appendChild(controls.discIntensity.row);
    sectionBloom.appendChild(controls.discFalloff.row);

    const sectionRays = makeEl('div', 'options-section');
    sectionRays.appendChild(makeEl('div', 'options-section-title', 'Sun Rays (Starburst)'));
    sectionRays.appendChild(controls.raysEnabled.row);
    sectionRays.appendChild(controls.raysIntensity.row);
    sectionRays.appendChild(controls.raysSizePx.row);
    sectionRays.appendChild(controls.raysCount.row);
    sectionRays.appendChild(controls.raysLength.row);
    sectionRays.appendChild(controls.raysLengthJitter.row);
    sectionRays.appendChild(controls.raysBaseWidthDeg.row);
    sectionRays.appendChild(controls.raysTipWidthDeg.row);
    sectionRays.appendChild(controls.raysSoftnessDeg.row);
    sectionRays.appendChild(controls.raysCoreGlow.row);
    sectionRays.appendChild(controls.raysOuterGlow.row);
    sectionRays.appendChild(controls.raysRotationDeg.row);

    const syncEnabled = (enabled) => {
        const off = !enabled;
        controls.mode.setDisabled(off);
        controls.brightnessOnly.toggle.disabled = off;
        for (const ctrl of [controls.strength, controls.radius, controls.threshold, controls.discRadiusDeg, controls.discIntensity, controls.discFalloff]) {
            ctrl.range.disabled = off;
            ctrl.number.disabled = off;
        }
        controls.raysEnabled.toggle.disabled = off;
        for (const ctrl of [
            controls.raysIntensity,
            controls.raysSizePx,
            controls.raysCount,
            controls.raysLength,
            controls.raysLengthJitter,
            controls.raysBaseWidthDeg,
            controls.raysTipWidthDeg,
            controls.raysSoftnessDeg,
            controls.raysCoreGlow,
            controls.raysOuterGlow,
            controls.raysRotationDeg
        ]) {
            ctrl.range.disabled = off || !controls.raysEnabled.toggle.checked;
            ctrl.number.disabled = off || !controls.raysEnabled.toggle.checked;
        }
    };
    syncEnabled(!!sunBloom.enabled);
    controls.enabled.toggle.addEventListener('change', () => syncEnabled(!!controls.enabled.toggle.checked));
    controls.raysEnabled.toggle.addEventListener('change', () => syncEnabled(!!controls.enabled.toggle.checked));

    const note = makeEl('div', 'options-note');
    note.textContent = 'Sun bloom uses a physical emitter mesh so buildings/trees can occlude the glow. Rays are a procedural starburst that follows the sun and respects scene depth.';

    this.body.appendChild(sectionBloom);
    this.body.appendChild(sectionRays);
    this.body.appendChild(note);
}

