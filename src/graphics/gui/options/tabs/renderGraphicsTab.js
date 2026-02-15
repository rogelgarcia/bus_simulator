import { makeChoiceRow, makeEl, makeNumberSliderRow, makeSelectRow, makeToggleRow, makeValueRow } from '../OptionsUiControls.js';

export function renderGraphicsTab() {
    this._ensureDraftAntiAliasing();
    this._ensureDraftAmbientOcclusion();
    this._ensureDraftShadows();
    const aa = this._draftAntiAliasing;
    const ao = this._draftAmbientOcclusion;
    const shadows = this._draftShadows;
    const emit = () => this._emitLiveChange();

    const info = this._getAntiAliasingDebugInfo?.() ?? null;
    const msaaSupported = info?.msaaSupported !== undefined ? !!info.msaaSupported : true;
    const msaaMaxSamples = Number.isFinite(info?.msaaMaxSamples) ? Number(info.msaaMaxSamples) : 0;

    const sectionStatus = makeEl('div', 'options-section');
    sectionStatus.appendChild(makeEl('div', 'options-section-title', 'Status'));
    const status = {
        pipeline: makeValueRow({ label: 'Pipeline', value: '-' }),
        active: makeValueRow({ label: 'Active AA', value: '-' }),
        native: makeValueRow({ label: 'Native MSAA', value: '-' }),
        msaa: makeValueRow({ label: 'MSAA (pipeline)', value: '-' }),
        ao: makeValueRow({ label: 'AO', value: '-' })
    };
    sectionStatus.appendChild(status.pipeline.row);
    sectionStatus.appendChild(status.active.row);
    sectionStatus.appendChild(status.native.row);
    sectionStatus.appendChild(status.msaa.row);
    sectionStatus.appendChild(status.ao.row);

    this._aaDebugEls = {
        pipeline: status.pipeline.text,
        active: status.active.text,
        native: status.native.text,
        msaa: status.msaa.text
    };

    const updateAoStatus = () => {
        const mode = String(ao?.mode ?? 'off');
        const bits = [];
        bits.push(mode === 'off' ? 'Off' : mode.toUpperCase());
        const staticOn = String(ao?.staticAo?.mode ?? 'off') !== 'off';
        const contactOn = ao?.busContactShadow?.enabled === true;
        const gtaoDebugOn = mode === 'gtao' && ao?.gtao?.debugView === true;
        if (staticOn) bits.push('Static');
        if (contactOn) bits.push('Bus');
        if (gtaoDebugOn) bits.push('GTAO debug');
        status.ao.text.textContent = bits.join(' + ');
    };
    updateAoStatus();

    const sectionAa = makeEl('div', 'options-section');
    sectionAa.appendChild(makeEl('div', 'options-section-title', 'Anti-aliasing'));

    const mode = makeChoiceRow({
        label: 'Mode',
        value: aa.mode,
        options: [
            { id: 'off', label: 'Off' },
            { id: 'msaa', label: 'MSAA' },
            { id: 'taa', label: 'TAA' },
            { id: 'smaa', label: 'SMAA' },
            { id: 'fxaa', label: 'FXAA' }
        ],
        onChange: (v) => {
            aa.mode = v;
            emit();
            syncEnabled();
        }
    });

    const msaaSamples = makeChoiceRow({
        label: 'Samples',
        value: String(aa.msaa?.samples ?? 2),
        options: [
            { id: '2', label: '2×' },
            { id: '4', label: '4×' },
            { id: '8', label: '8×' }
        ],
        onChange: (v) => {
            aa.msaa.samples = Number(v);
            emit();
        }
    });

    const msaaNote = makeEl('div', 'options-note');
    msaaNote.textContent = !msaaSupported
        ? 'MSAA is not supported on this device/browser (WebGL2 required).'
        : `MSAA smooths geometry edges in the post-processing pipeline. Higher samples cost GPU time + VRAM. (max ${msaaMaxSamples || '?'})`;

    const TAA_PRESETS = {
        low: { historyStrength: 0.8, jitter: 0.75, sharpen: 0.1, clampStrength: 0.7 },
        medium: { historyStrength: 0.85, jitter: 0.9, sharpen: 0.12, clampStrength: 0.75 },
        high: { historyStrength: 0.9, jitter: 1.0, sharpen: 0.15, clampStrength: 0.8 },
        ultra: { historyStrength: 0.94, jitter: 1.0, sharpen: 0.2, clampStrength: 0.9 }
    };

    const taaPreset = makeSelectRow({
        label: 'TAA preset',
        value: String(aa.taa?.preset ?? 'high'),
        options: [
            { id: 'low', label: 'Low' },
            { id: 'medium', label: 'Medium' },
            { id: 'high', label: 'High' },
            { id: 'ultra', label: 'Ultra' },
            { id: 'custom', label: 'Custom' }
        ],
        onChange: (v) => {
            aa.taa.preset = v;
            const preset = TAA_PRESETS[v] ?? null;
            if (preset) {
                aa.taa.historyStrength = preset.historyStrength;
                aa.taa.jitter = preset.jitter;
                aa.taa.sharpen = preset.sharpen;
                aa.taa.clampStrength = preset.clampStrength;
                taaHistory.range.value = String(preset.historyStrength);
                taaHistory.number.value = String(preset.historyStrength.toFixed(2));
                taaJitter.range.value = String(preset.jitter);
                taaJitter.number.value = String(preset.jitter.toFixed(2));
                taaSharpen.range.value = String(preset.sharpen);
                taaSharpen.number.value = String(preset.sharpen.toFixed(2));
                taaClamp.range.value = String(preset.clampStrength);
                taaClamp.number.value = String(preset.clampStrength.toFixed(2));
            }
            emit();
        }
    });

    const taaHistory = makeNumberSliderRow({
        label: 'History strength',
        value: aa.taa?.historyStrength ?? 0.9,
        min: 0,
        max: 0.98,
        step: 0.01,
        digits: 2,
        onChange: (v) => {
            aa.taa.historyStrength = v;
            aa.taa.preset = 'custom';
            taaPreset.select.value = 'custom';
            emit();
        }
    });

    const taaJitter = makeNumberSliderRow({
        label: 'Jitter amount',
        value: aa.taa?.jitter ?? 1.0,
        min: 0,
        max: 1,
        step: 0.05,
        digits: 2,
        onChange: (v) => {
            aa.taa.jitter = v;
            aa.taa.preset = 'custom';
            taaPreset.select.value = 'custom';
            emit();
        }
    });

    const taaSharpen = makeNumberSliderRow({
        label: 'Sharpen',
        value: aa.taa?.sharpen ?? 0.15,
        min: 0,
        max: 1,
        step: 0.01,
        digits: 2,
        onChange: (v) => {
            aa.taa.sharpen = v;
            aa.taa.preset = 'custom';
            taaPreset.select.value = 'custom';
            emit();
        }
    });

    const taaClamp = makeNumberSliderRow({
        label: 'Ghosting clamp',
        value: aa.taa?.clampStrength ?? 0.8,
        min: 0,
        max: 1,
        step: 0.05,
        digits: 2,
        onChange: (v) => {
            aa.taa.clampStrength = v;
            aa.taa.preset = 'custom';
            taaPreset.select.value = 'custom';
            emit();
        }
    });

    const taaNote = makeEl('div', 'options-note');
    taaNote.textContent = 'TAA accumulates previous frames for smoother thin details. Higher history increases stability but can ghost on motion. Use clamp + lower history to reduce trails.';

    const SMAA_PRESETS = {
        low: { threshold: 0.15, maxSearchSteps: 8, maxSearchStepsDiag: 4, cornerRounding: 25 },
        medium: { threshold: 0.1, maxSearchSteps: 16, maxSearchStepsDiag: 8, cornerRounding: 25 },
        high: { threshold: 0.075, maxSearchSteps: 24, maxSearchStepsDiag: 12, cornerRounding: 25 },
        ultra: { threshold: 0.05, maxSearchSteps: 32, maxSearchStepsDiag: 16, cornerRounding: 25 }
    };

    const smaaPreset = makeSelectRow({
        label: 'SMAA preset',
        value: String(aa.smaa?.preset ?? 'medium'),
        options: [
            { id: 'low', label: 'Low' },
            { id: 'medium', label: 'Medium' },
            { id: 'high', label: 'High' },
            { id: 'ultra', label: 'Ultra' },
            { id: 'custom', label: 'Custom' }
        ],
        onChange: (v) => {
            aa.smaa.preset = v;
            const preset = SMAA_PRESETS[v] ?? null;
            if (preset) {
                aa.smaa.threshold = preset.threshold;
                aa.smaa.maxSearchSteps = preset.maxSearchSteps;
                aa.smaa.maxSearchStepsDiag = preset.maxSearchStepsDiag;
                aa.smaa.cornerRounding = preset.cornerRounding;
                smaaThreshold.range.value = String(preset.threshold);
                smaaThreshold.number.value = String(preset.threshold.toFixed(2));
                smaaSearch.range.value = String(preset.maxSearchSteps);
                smaaSearch.number.value = String(preset.maxSearchSteps);
                smaaSearchDiag.range.value = String(preset.maxSearchStepsDiag);
                smaaSearchDiag.number.value = String(preset.maxSearchStepsDiag);
                smaaCorner.range.value = String(preset.cornerRounding);
                smaaCorner.number.value = String(preset.cornerRounding);
            }
            emit();
        }
    });

    const smaaThreshold = makeNumberSliderRow({
        label: 'SMAA threshold',
        value: aa.smaa?.threshold ?? 0.1,
        min: 0.02,
        max: 0.2,
        step: 0.01,
        digits: 2,
        onChange: (v) => {
            aa.smaa.threshold = v;
            aa.smaa.preset = 'custom';
            smaaPreset.select.value = 'custom';
            emit();
        }
    });

    const smaaSearch = makeNumberSliderRow({
        label: 'SMAA search steps',
        value: aa.smaa?.maxSearchSteps ?? 16,
        min: 4,
        max: 32,
        step: 1,
        digits: 0,
        onChange: (v) => {
            aa.smaa.maxSearchSteps = Math.round(v);
            aa.smaa.preset = 'custom';
            smaaPreset.select.value = 'custom';
            emit();
        }
    });

    const smaaSearchDiag = makeNumberSliderRow({
        label: 'SMAA diag steps',
        value: aa.smaa?.maxSearchStepsDiag ?? 8,
        min: 0,
        max: 16,
        step: 1,
        digits: 0,
        onChange: (v) => {
            aa.smaa.maxSearchStepsDiag = Math.round(v);
            aa.smaa.preset = 'custom';
            smaaPreset.select.value = 'custom';
            emit();
        }
    });

    const smaaCorner = makeNumberSliderRow({
        label: 'SMAA corner rounding',
        value: aa.smaa?.cornerRounding ?? 25,
        min: 0,
        max: 100,
        step: 1,
        digits: 0,
        onChange: (v) => {
            aa.smaa.cornerRounding = Math.round(v);
            aa.smaa.preset = 'custom';
            smaaPreset.select.value = 'custom';
            emit();
        }
    });

    const FXAA_PRESETS = {
        sharp: { edgeThreshold: 0.28 },
        balanced: { edgeThreshold: 0.2 },
        soft: { edgeThreshold: 0.12 }
    };

    const fxaaPreset = makeSelectRow({
        label: 'FXAA preset',
        value: String(aa.fxaa?.preset ?? 'balanced'),
        options: [
            { id: 'sharp', label: 'Sharp' },
            { id: 'balanced', label: 'Balanced' },
            { id: 'soft', label: 'Soft' },
            { id: 'custom', label: 'Custom' }
        ],
        onChange: (v) => {
            aa.fxaa.preset = v;
            const preset = FXAA_PRESETS[v] ?? null;
            if (preset) {
                aa.fxaa.edgeThreshold = preset.edgeThreshold;
                fxaaThreshold.range.value = String(preset.edgeThreshold);
                fxaaThreshold.number.value = String(preset.edgeThreshold.toFixed(2));
            }
            emit();
        }
    });

    const fxaaThreshold = makeNumberSliderRow({
        label: 'FXAA edge threshold',
        value: aa.fxaa?.edgeThreshold ?? 0.2,
        min: 0.05,
        max: 0.35,
        step: 0.01,
        digits: 2,
        onChange: (v) => {
            aa.fxaa.edgeThreshold = v;
            aa.fxaa.preset = 'custom';
            fxaaPreset.select.value = 'custom';
            emit();
        }
    });

    const smaaNote = makeEl('div', 'options-note');
    smaaNote.textContent = 'SMAA is a high quality post-process AA. Lower threshold detects more edges (smoother, slightly blurrier).';

    const fxaaNote = makeEl('div', 'options-note');
    fxaaNote.textContent = 'FXAA is a fast post-process AA. Higher threshold keeps more detail but reduces smoothing.';

    const msaaSection = makeEl('div');
    msaaSection.appendChild(makeEl('div', 'options-section-title', 'MSAA'));
    msaaSection.appendChild(msaaSamples.row);
    msaaSection.appendChild(msaaNote);

    const taaSection = makeEl('div');
    taaSection.appendChild(makeEl('div', 'options-section-title', 'TAA'));
    taaSection.appendChild(taaPreset.row);
    taaSection.appendChild(taaHistory.row);
    taaSection.appendChild(taaJitter.row);
    taaSection.appendChild(taaSharpen.row);
    taaSection.appendChild(taaClamp.row);
    taaSection.appendChild(taaNote);

    const smaaSection = makeEl('div');
    smaaSection.appendChild(makeEl('div', 'options-section-title', 'SMAA'));
    smaaSection.appendChild(smaaPreset.row);
    smaaSection.appendChild(smaaThreshold.row);
    smaaSection.appendChild(smaaSearch.row);
    smaaSection.appendChild(smaaSearchDiag.row);
    smaaSection.appendChild(smaaCorner.row);
    smaaSection.appendChild(smaaNote);

    const fxaaSection = makeEl('div');
    fxaaSection.appendChild(makeEl('div', 'options-section-title', 'FXAA'));
    fxaaSection.appendChild(fxaaPreset.row);
    fxaaSection.appendChild(fxaaThreshold.row);
    fxaaSection.appendChild(fxaaNote);

    const syncEnabled = () => {
        const current = String(aa.mode ?? 'off');
        if (!msaaSupported && current === 'msaa') {
            aa.mode = 'off';
            mode.setValue('off');
            emit();
        }

        const msaaActive = current === 'msaa' && msaaSupported;
        const taaActive = current === 'taa';
        const smaaActive = current === 'smaa';
        const fxaaActive = current === 'fxaa';

        msaaSection.classList.toggle('hidden', !msaaActive);
        taaSection.classList.toggle('hidden', !taaActive);
        smaaSection.classList.toggle('hidden', !smaaActive);
        fxaaSection.classList.toggle('hidden', !fxaaActive);

        const max = msaaMaxSamples > 0 ? msaaMaxSamples : 8;
        const allow2 = msaaSupported && max >= 2;
        const allow4 = msaaSupported && max >= 4;
        const allow8 = msaaSupported && max >= 8;
        msaaSamples.setDisabled(!msaaActive);
        const btn2 = msaaSamples.getButton('2');
        const btn4 = msaaSamples.getButton('4');
        const btn8 = msaaSamples.getButton('8');
        if (btn2) btn2.disabled = !msaaActive || !allow2;
        if (btn4) btn4.disabled = !msaaActive || !allow4;
        if (btn8) btn8.disabled = !msaaActive || !allow8;
        if (msaaActive) {
            if (allow8 && aa.msaa.samples > 8) aa.msaa.samples = 8;
            else if (!allow8 && allow4 && aa.msaa.samples > 4) aa.msaa.samples = 4;
            else if (!allow4 && allow2 && aa.msaa.samples > 2) aa.msaa.samples = 2;
            if (!allow2) aa.msaa.samples = 0;
                msaaSamples.setValue(String(aa.msaa.samples));
        }

        taaPreset.select.disabled = !taaActive;
        for (const row of [taaHistory, taaJitter, taaSharpen, taaClamp]) {
            row.range.disabled = !taaActive;
            row.number.disabled = !taaActive;
        }

        smaaPreset.select.disabled = !smaaActive;
        fxaaPreset.select.disabled = !fxaaActive;

        for (const row of [smaaThreshold, smaaSearch, smaaSearchDiag, smaaCorner]) {
            row.range.disabled = !smaaActive;
            row.number.disabled = !smaaActive;
        }
        fxaaThreshold.range.disabled = !fxaaActive;
        fxaaThreshold.number.disabled = !fxaaActive;
    };

    const msaaBtn = mode.getButton('msaa');
    if (msaaBtn) msaaBtn.disabled = !msaaSupported;

    sectionAa.appendChild(mode.row);
    sectionAa.appendChild(msaaSection);
    sectionAa.appendChild(taaSection);
    sectionAa.appendChild(smaaSection);
    sectionAa.appendChild(fxaaSection);

    syncEnabled();

    const sectionShadows = makeEl('div', 'options-section');
    sectionShadows.appendChild(makeEl('div', 'options-section-title', 'Shadows'));

    const shadowQuality = makeChoiceRow({
        label: 'Shadow quality',
        value: String(shadows?.quality ?? 'medium'),
        options: [
            { id: 'off', label: 'Off' },
            { id: 'low', label: 'Low' },
            { id: 'medium', label: 'Medium' },
            { id: 'high', label: 'High' },
            { id: 'ultra', label: 'Ultra' }
        ],
        onChange: (v) => {
            shadows.quality = v;
            emit();
        }
    });

    const shadowNote = makeEl('div', 'options-note');
    shadowNote.textContent = 'Applied immediately. Higher presets increase GPU cost and VRAM usage.';

    sectionShadows.appendChild(shadowQuality.row);
    sectionShadows.appendChild(shadowNote);

    const sectionAo = makeEl('div', 'options-section');
    sectionAo.appendChild(makeEl('div', 'options-section-title', 'Ambient Occlusion'));

	        const aoMode = makeChoiceRow({
	            label: 'Mode',
	            value: String(ao?.mode ?? 'off'),
	            options: [
	                { id: 'off', label: 'Off' },
	                { id: 'ssao', label: 'SSAO' },
	                { id: 'gtao', label: 'GTAO' }
	            ],
	            onChange: (v) => {
	                ao.mode = v;
	                emit();
	                syncAoControls();
	                updateAoStatus();
	            }
	        });

	        const staticAoMode = makeChoiceRow({
	            label: 'Static AO',
	            value: String(ao?.staticAo?.mode ?? 'off') === 'off' ? 'off' : 'vertex',
	            options: [
	                { id: 'off', label: 'Off' },
	                { id: 'vertex', label: 'On' }
	            ],
	            onChange: (v) => {
	                if (!ao.staticAo || typeof ao.staticAo !== 'object') ao.staticAo = {};
	                ao.staticAo.mode = v === 'off' ? 'off' : 'vertex';
	                emit();
	                syncAoControls();
	                updateAoStatus();
	            }
	        });

    const staticAoIntensity = makeNumberSliderRow({
        label: 'Static AO intensity',
        value: ao?.staticAo?.intensity ?? 0.6,
        min: 0,
        max: 2,
        step: 0.01,
        digits: 2,
        onChange: (v) => { ao.staticAo.intensity = v; emit(); }
    });

    const staticAoQuality = makeChoiceRow({
        label: 'Static AO quality',
        value: String(ao?.staticAo?.quality ?? 'medium'),
        options: [
            { id: 'low', label: 'Low' },
            { id: 'medium', label: 'Medium' },
            { id: 'high', label: 'High' }
        ],
        onChange: (v) => { ao.staticAo.quality = v; emit(); }
    });

    const staticAoRadius = makeNumberSliderRow({
        label: 'Static AO radius (m)',
        value: ao?.staticAo?.radius ?? 4,
        min: 0.25,
        max: 16,
        step: 0.05,
        digits: 2,
        onChange: (v) => { ao.staticAo.radius = v; emit(); }
    });

    const staticAoWallHeight = makeNumberSliderRow({
        label: 'Static AO wall height (m)',
        value: ao?.staticAo?.wallHeight ?? 1.6,
        min: 0.25,
        max: 6,
        step: 0.05,
        digits: 2,
        onChange: (v) => { ao.staticAo.wallHeight = v; emit(); }
    });

    const staticAoDebugView = makeToggleRow({
        label: 'Static AO debug view',
        value: ao?.staticAo?.debugView === true,
        onChange: (v) => { ao.staticAo.debugView = v; emit(); }
    });

    const aoAlphaHandling = makeChoiceRow({
        label: 'Alpha handling',
        value: String(ao?.alpha?.handling ?? 'alpha_test'),
        options: [
            { id: 'alpha_test', label: 'Alpha test' },
            { id: 'exclude', label: 'Exclude' }
        ],
        onChange: (v) => {
            if (!ao.alpha || typeof ao.alpha !== 'object') ao.alpha = {};
            ao.alpha.handling = v;
            emit();
            syncAoControls();
        }
    });

	        const aoAlphaThreshold = makeNumberSliderRow({
	            label: 'Alpha threshold',
	            value: ao?.alpha?.threshold ?? 0.5,
        min: 0.01,
        max: 0.99,
        step: 0.01,
        digits: 2,
        onChange: (v) => {
            if (!ao.alpha || typeof ao.alpha !== 'object') ao.alpha = {};
            ao.alpha.threshold = v;
            emit();
	            }
	        });

	        const busContactShadowMode = makeChoiceRow({
	            label: 'Bus contact shadow',
	            value: ao?.busContactShadow?.enabled === true ? 'on' : 'off',
	            options: [
	                { id: 'off', label: 'Off' },
	                { id: 'on', label: 'On' }
	            ],
	            onChange: (v) => {
	                if (!ao.busContactShadow || typeof ao.busContactShadow !== 'object') ao.busContactShadow = {};
	                ao.busContactShadow.enabled = v === 'on';
	                emit();
	                syncAoControls();
	                updateAoStatus();
	            }
	        });

    const busContactShadowIntensity = makeNumberSliderRow({
        label: 'Bus contact shadow intensity',
        value: ao?.busContactShadow?.intensity ?? 0.4,
        min: 0,
        max: 2,
        step: 0.01,
        digits: 2,
        onChange: (v) => { ao.busContactShadow.intensity = v; emit(); }
    });

    const busContactShadowRadius = makeNumberSliderRow({
        label: 'Bus contact shadow radius (m)',
        value: ao?.busContactShadow?.radius ?? 0.9,
        min: 0.05,
        max: 4,
        step: 0.01,
        digits: 2,
        onChange: (v) => { ao.busContactShadow.radius = v; emit(); }
    });

    const busContactShadowSoftness = makeNumberSliderRow({
        label: 'Bus contact shadow softness',
        value: ao?.busContactShadow?.softness ?? 0.75,
        min: 0.02,
        max: 1,
        step: 0.01,
        digits: 2,
        onChange: (v) => { ao.busContactShadow.softness = v; emit(); }
    });

    const busContactShadowMaxDistance = makeNumberSliderRow({
        label: 'Bus contact shadow max distance (m)',
        value: ao?.busContactShadow?.maxDistance ?? 0.75,
        min: 0,
        max: 5,
        step: 0.01,
        digits: 2,
        onChange: (v) => { ao.busContactShadow.maxDistance = v; emit(); }
    });

    const ssaoIntensity = makeNumberSliderRow({
        label: 'SSAO intensity',
        value: ao?.ssao?.intensity ?? 0.35,
        min: 0,
        max: 2,
        step: 0.01,
        digits: 2,
        onChange: (v) => { ao.ssao.intensity = v; emit(); }
    });

    const ssaoRadius = makeNumberSliderRow({
        label: 'SSAO radius',
        value: ao?.ssao?.radius ?? 8,
        min: 0.1,
        max: 64,
        step: 0.1,
        digits: 1,
        onChange: (v) => { ao.ssao.radius = v; emit(); }
    });

    const ssaoQuality = makeChoiceRow({
        label: 'SSAO quality',
        value: String(ao?.ssao?.quality ?? 'medium'),
        options: [
            { id: 'low', label: 'Low' },
            { id: 'medium', label: 'Medium' },
            { id: 'high', label: 'High' }
        ],
        onChange: (v) => { ao.ssao.quality = v; emit(); }
    });

    const gtaoIntensity = makeNumberSliderRow({
        label: 'GTAO intensity',
        value: ao?.gtao?.intensity ?? 0.35,
        min: 0,
        max: 2,
        step: 0.01,
        digits: 2,
        onChange: (v) => { ao.gtao.intensity = v; emit(); }
    });

    const gtaoRadius = makeNumberSliderRow({
        label: 'GTAO radius',
        value: ao?.gtao?.radius ?? 0.25,
        min: 0.05,
        max: 8,
        step: 0.01,
        digits: 2,
        onChange: (v) => { ao.gtao.radius = v; emit(); }
    });

    const gtaoQuality = makeChoiceRow({
        label: 'GTAO quality',
        value: String(ao?.gtao?.quality ?? 'medium'),
        options: [
            { id: 'low', label: 'Low' },
            { id: 'medium', label: 'Medium' },
            { id: 'high', label: 'High' }
        ],
        onChange: (v) => { ao.gtao.quality = v; emit(); }
    });

    const gtaoDenoise = makeToggleRow({
        label: 'GTAO denoise (final render)',
        value: ao?.gtao?.denoise !== false,
        onChange: (v) => { ao.gtao.denoise = v; emit(); }
    });

    const gtaoDebugView = makeToggleRow({
        label: 'GTAO debug visualization',
        value: ao?.gtao?.debugView === true,
        onChange: (v) => {
            ao.gtao.debugView = v;
            emit();
            updateAoStatus();
        }
    });

    const gtaoUpdateMode = makeSelectRow({
        label: 'GTAO update',
        value: String(ao?.gtao?.updateMode ?? 'every_frame'),
        options: [
            { id: 'every_frame', label: 'Every frame' },
            { id: 'when_camera_moves', label: 'When camera moves' },
            { id: 'half_rate', label: 'Half rate (2 frames)' },
            { id: 'third_rate', label: 'Third rate (3 frames)' },
            { id: 'quarter_rate', label: 'Quarter rate (4 frames)' }
        ],
        onChange: (v) => {
            ao.gtao.updateMode = v;
            emit();
            syncAoControls();
        }
    });

    const gtaoMotionPos = makeNumberSliderRow({
        label: 'GTAO motion threshold: position (m)',
        value: ao?.gtao?.motionThreshold?.positionMeters ?? 0.02,
        min: 0,
        max: 0.25,
        step: 0.001,
        digits: 3,
        onChange: (v) => {
            if (!ao.gtao.motionThreshold || typeof ao.gtao.motionThreshold !== 'object') ao.gtao.motionThreshold = {};
            ao.gtao.motionThreshold.positionMeters = v;
            emit();
        }
    });

    const gtaoMotionRot = makeNumberSliderRow({
        label: 'GTAO motion threshold: rotation (deg)',
        value: ao?.gtao?.motionThreshold?.rotationDeg ?? 0.15,
        min: 0,
        max: 5,
        step: 0.01,
        digits: 2,
        onChange: (v) => {
            if (!ao.gtao.motionThreshold || typeof ao.gtao.motionThreshold !== 'object') ao.gtao.motionThreshold = {};
            ao.gtao.motionThreshold.rotationDeg = v;
            emit();
        }
    });

    const gtaoMotionFov = makeNumberSliderRow({
        label: 'GTAO motion threshold: FOV (deg)',
        value: ao?.gtao?.motionThreshold?.fovDeg ?? 0,
        min: 0,
        max: 10,
        step: 0.01,
        digits: 2,
        onChange: (v) => {
            if (!ao.gtao.motionThreshold || typeof ao.gtao.motionThreshold !== 'object') ao.gtao.motionThreshold = {};
            ao.gtao.motionThreshold.fovDeg = v;
            emit();
        }
    });

    const aoNote = makeEl('div', 'options-note');
    aoNote.textContent = 'Static AO is a baked, stable occlusion term for static world geometry. SSAO is cheaper; GTAO is cleaner; GTAO denoise affects final composition. GTAO debug visualization is inspection-only. Bus contact shadow is a cheap grounding cue for the vehicle.';

    sectionAo.appendChild(aoMode.row);
    const aoParamsStack = makeEl('div', 'options-overlap-stack');
    const ssaoGroup = makeEl('div', 'options-overlap-pane');
    ssaoGroup.appendChild(ssaoIntensity.row);
    ssaoGroup.appendChild(ssaoRadius.row);
    ssaoGroup.appendChild(ssaoQuality.row);

    const gtaoGroup = makeEl('div', 'options-overlap-pane');
    gtaoGroup.appendChild(gtaoIntensity.row);
    gtaoGroup.appendChild(gtaoRadius.row);
    gtaoGroup.appendChild(gtaoQuality.row);
    gtaoGroup.appendChild(gtaoDenoise.row);
    gtaoGroup.appendChild(gtaoDebugView.row);
    gtaoGroup.appendChild(gtaoUpdateMode.row);
    gtaoGroup.appendChild(gtaoMotionPos.row);
    gtaoGroup.appendChild(gtaoMotionRot.row);
    gtaoGroup.appendChild(gtaoMotionFov.row);

	        aoParamsStack.appendChild(ssaoGroup);
	        aoParamsStack.appendChild(gtaoGroup);
	        sectionAo.appendChild(aoParamsStack);
	        sectionAo.appendChild(aoAlphaHandling.row);
	        sectionAo.appendChild(aoAlphaThreshold.row);
	        sectionAo.appendChild(staticAoMode.row);
	        const staticAoGroup = makeEl('div', 'options-overlap-pane');
	        staticAoGroup.appendChild(staticAoIntensity.row);
	        staticAoGroup.appendChild(staticAoQuality.row);
	        staticAoGroup.appendChild(staticAoRadius.row);
	        staticAoGroup.appendChild(staticAoWallHeight.row);
	        staticAoGroup.appendChild(staticAoDebugView.row);
	        sectionAo.appendChild(staticAoGroup);

	        sectionAo.appendChild(busContactShadowMode.row);
	        const busContactShadowGroup = makeEl('div', 'options-overlap-pane');
	        busContactShadowGroup.appendChild(busContactShadowIntensity.row);
	        busContactShadowGroup.appendChild(busContactShadowRadius.row);
	        busContactShadowGroup.appendChild(busContactShadowSoftness.row);
	        busContactShadowGroup.appendChild(busContactShadowMaxDistance.row);
	        sectionAo.appendChild(busContactShadowGroup);
	        sectionAo.appendChild(aoNote);

	        const syncAoControls = () => {
	            const mode = String(ao?.mode ?? 'off');
	            const ssaoOn = mode === 'ssao';
	            const gtaoOn = mode === 'gtao';
	            const aoOn = ssaoOn || gtaoOn;
	            const alphaHandling = String(ao?.alpha?.handling ?? 'alpha_test');
	            const alphaTestOn = alphaHandling === 'alpha_test';

	            const staticMode = String(ao?.staticAo?.mode ?? 'off');
	            const staticOn = staticMode !== 'off';

	            staticAoMode.setValue(staticOn ? 'vertex' : 'off');
	            staticAoGroup.classList.toggle('hidden', !staticOn);
	            for (const ctrl of [staticAoIntensity, staticAoRadius, staticAoWallHeight]) {
	                ctrl.range.disabled = !staticOn;
	                ctrl.number.disabled = !staticOn;
	            }
	            staticAoQuality.setDisabled(!staticOn);
	            staticAoDebugView.toggle.disabled = !staticOn;

        aoParamsStack.classList.toggle('hidden', !aoOn);
        ssaoGroup.classList.toggle('hidden', !ssaoOn);
        gtaoGroup.classList.toggle('hidden', !gtaoOn);

        for (const ctrl of [ssaoIntensity, ssaoRadius]) {
            ctrl.range.disabled = !ssaoOn;
            ctrl.number.disabled = !ssaoOn;
        }
        ssaoQuality.setDisabled(!ssaoOn);

        for (const ctrl of [gtaoIntensity, gtaoRadius]) {
            ctrl.range.disabled = !gtaoOn;
            ctrl.number.disabled = !gtaoOn;
        }
        gtaoQuality.setDisabled(!gtaoOn);
        gtaoDenoise.toggle.disabled = !gtaoOn;
        gtaoDebugView.toggle.disabled = !gtaoOn;
        gtaoUpdateMode.select.disabled = !gtaoOn;

        const updateMode = String(ao?.gtao?.updateMode ?? 'every_frame');
        const motionOn = gtaoOn && updateMode === 'when_camera_moves';
        for (const ctrl of [gtaoMotionPos, gtaoMotionRot, gtaoMotionFov]) {
            ctrl.row.classList.toggle('hidden', !motionOn);
            ctrl.range.disabled = !motionOn;
            ctrl.number.disabled = !motionOn;
        }

        aoAlphaHandling.setDisabled(!aoOn);
        aoAlphaHandling.row.classList.toggle('hidden', !aoOn);

        aoAlphaThreshold.row.classList.toggle('hidden', !(aoOn && alphaTestOn));
	            aoAlphaThreshold.range.disabled = !aoOn || !alphaTestOn;
	            aoAlphaThreshold.number.disabled = !aoOn || !alphaTestOn;

	            const contactShadowOn = ao?.busContactShadow?.enabled === true;
	            busContactShadowMode.setValue(contactShadowOn ? 'on' : 'off');
	            busContactShadowGroup.classList.toggle('hidden', !contactShadowOn);
	            for (const ctrl of [busContactShadowIntensity, busContactShadowRadius, busContactShadowSoftness, busContactShadowMaxDistance]) {
	                ctrl.range.disabled = !contactShadowOn;
	                ctrl.number.disabled = !contactShadowOn;
	            }
	        };
	        syncAoControls();

	        this.body.appendChild(sectionStatus);
	        this.body.appendChild(sectionAa);
	        this.body.appendChild(sectionShadows);
	        this.body.appendChild(sectionAo);
	        this._refreshAntiAliasingDebug();
	    }
