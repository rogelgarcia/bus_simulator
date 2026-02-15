import { makeColorRow, makeEl, makeNumberSliderRow, makeToggleRow, makeValueRow } from '../OptionsUiControls.js';

export function renderAsphaltTab() {
    this._ensureDraftAsphaltNoise();

	        const d = this._draftAsphaltNoise;
	        const coarse = d.coarse ?? (d.coarse = {});
	        const fine = d.fine ?? (d.fine = {});
	        const markings = d.markings ?? (d.markings = {});
	        const color = d.color ?? (d.color = {});
	        const livedIn = d.livedIn ?? (d.livedIn = {});
	        const edgeDirt = livedIn.edgeDirt ?? (livedIn.edgeDirt = {});
	        const cracks = livedIn.cracks ?? (livedIn.cracks = {});
	        const patches = livedIn.patches ?? (livedIn.patches = {});
	        const tireWear = livedIn.tireWear ?? (livedIn.tireWear = {});
    const emit = () => this._emitLiveChange();

    const sectionCoarse = makeEl('div', 'options-section');
    sectionCoarse.appendChild(makeEl('div', 'options-section-title', 'Coarse'));

    const coarseControls = {
        albedo: makeToggleRow({
            label: 'Coarse affects albedo',
            value: coarse.albedo,
            onChange: (v) => { coarse.albedo = v; emit(); }
        }),
        roughness: makeToggleRow({
            label: 'Coarse affects roughness',
            value: coarse.roughness,
            onChange: (v) => { coarse.roughness = v; emit(); }
        }),
        scale: makeNumberSliderRow({
            label: 'Coarse scale',
            value: coarse.scale ?? 0.07,
            min: 0.001,
            max: 5,
            step: 0.001,
            digits: 3,
            onChange: (v) => { coarse.scale = v; emit(); }
        }),
        colorStrength: makeNumberSliderRow({
            label: 'Coarse color strength',
            value: coarse.colorStrength ?? 0.18,
            min: 0,
            max: 0.5,
            step: 0.01,
            digits: 2,
            onChange: (v) => { coarse.colorStrength = v; emit(); }
        }),
        dirtyStrength: makeNumberSliderRow({
            label: 'Coarse dirty strength',
            value: coarse.dirtyStrength ?? 0.18,
            min: 0,
            max: 1,
            step: 0.01,
            digits: 2,
            onChange: (v) => { coarse.dirtyStrength = v; emit(); }
        }),
        roughnessStrength: makeNumberSliderRow({
            label: 'Coarse roughness strength',
            value: coarse.roughnessStrength ?? 0.28,
            min: 0,
            max: 0.5,
            step: 0.01,
            digits: 2,
            onChange: (v) => { coarse.roughnessStrength = v; emit(); }
        })
    };

    sectionCoarse.appendChild(coarseControls.albedo.row);
    sectionCoarse.appendChild(coarseControls.roughness.row);
    sectionCoarse.appendChild(coarseControls.scale.row);
    sectionCoarse.appendChild(coarseControls.colorStrength.row);
    sectionCoarse.appendChild(coarseControls.dirtyStrength.row);
    sectionCoarse.appendChild(coarseControls.roughnessStrength.row);

    const sectionFine = makeEl('div', 'options-section');
    sectionFine.appendChild(makeEl('div', 'options-section-title', 'Fine'));

    const fineControls = {
        albedo: makeToggleRow({
            label: 'Fine affects albedo',
            value: fine.albedo,
            onChange: (v) => { fine.albedo = v; emit(); }
        }),
        roughness: makeToggleRow({
            label: 'Fine affects roughness',
            value: fine.roughness,
            onChange: (v) => { fine.roughness = v; emit(); }
        }),
        normal: makeToggleRow({
            label: 'Fine affects normal',
            value: fine.normal,
            onChange: (v) => { fine.normal = v; emit(); }
        }),
        scale: makeNumberSliderRow({
            label: 'Fine scale',
            value: fine.scale ?? 12.0,
            min: 0.1,
            max: 15,
            step: 0.1,
            digits: 1,
            onChange: (v) => { fine.scale = v; emit(); }
        }),
        colorStrength: makeNumberSliderRow({
            label: 'Fine color strength',
            value: fine.colorStrength ?? 0.06,
            min: 0,
            max: 0.5,
            step: 0.01,
            digits: 2,
            onChange: (v) => { fine.colorStrength = v; emit(); }
        }),
        dirtyStrength: makeNumberSliderRow({
            label: 'Fine dirty strength',
            value: fine.dirtyStrength ?? 0.0,
            min: 0,
            max: 1,
            step: 0.01,
            digits: 2,
            onChange: (v) => { fine.dirtyStrength = v; emit(); }
        }),
        roughnessStrength: makeNumberSliderRow({
            label: 'Fine roughness strength',
            value: fine.roughnessStrength ?? 0.16,
            min: 0,
            max: 0.5,
            step: 0.01,
            digits: 2,
            onChange: (v) => { fine.roughnessStrength = v; emit(); }
        }),
        normalStrength: makeNumberSliderRow({
            label: 'Fine normal strength',
            value: fine.normalStrength ?? 0.35,
            min: 0,
            max: 2,
            step: 0.01,
            digits: 2,
            onChange: (v) => { fine.normalStrength = v; emit(); }
        })
    };

    sectionFine.appendChild(fineControls.albedo.row);
    sectionFine.appendChild(fineControls.roughness.row);
    sectionFine.appendChild(fineControls.normal.row);
    sectionFine.appendChild(fineControls.scale.row);
    sectionFine.appendChild(fineControls.colorStrength.row);
	        sectionFine.appendChild(fineControls.dirtyStrength.row);
	        sectionFine.appendChild(fineControls.roughnessStrength.row);
	        sectionFine.appendChild(fineControls.normalStrength.row);

	        const sectionMarkings = makeEl('div', 'options-section');
	        sectionMarkings.appendChild(makeEl('div', 'options-section-title', 'Markings'));

	        const markingsControls = {
	            enabled: makeToggleRow({
	                label: 'Apply asphalt noise to markings',
	                value: markings.enabled,
	                onChange: (v) => { markings.enabled = v; emit(); }
	            }),
	            colorStrength: makeNumberSliderRow({
	                label: 'Markings noise color strength',
	                value: markings.colorStrength ?? 0.025,
	                min: 0,
	                max: 0.5,
	                step: 0.005,
	                digits: 3,
	                onChange: (v) => { markings.colorStrength = v; emit(); }
	            }),
	            roughnessStrength: makeNumberSliderRow({
	                label: 'Markings noise roughness strength',
	                value: markings.roughnessStrength ?? 0.09,
	                min: 0,
	                max: 0.5,
	                step: 0.005,
	                digits: 3,
	                onChange: (v) => { markings.roughnessStrength = v; emit(); }
	            }),
	            debug: makeToggleRow({
	                label: 'Debug: show markings noise',
	                value: markings.debug,
	                onChange: (v) => { markings.debug = v; emit(); }
	            })
	        };

	        const setMarkingsControlsEnabled = (enabled) => {
	            const off = !enabled;
	            markingsControls.colorStrength.range.disabled = off;
	            markingsControls.colorStrength.number.disabled = off;
	            markingsControls.roughnessStrength.range.disabled = off;
	            markingsControls.roughnessStrength.number.disabled = off;
	        };

	        setMarkingsControlsEnabled(!!markings.enabled);
	        markingsControls.enabled.toggle.addEventListener('change', () => setMarkingsControlsEnabled(!!markingsControls.enabled.toggle.checked));

	        sectionMarkings.appendChild(markingsControls.enabled.row);
	        sectionMarkings.appendChild(markingsControls.colorStrength.row);
	        sectionMarkings.appendChild(markingsControls.roughnessStrength.row);
	        sectionMarkings.appendChild(markingsControls.debug.row);

	        const sectionMarkingsCalibration = (() => {
	            const cfg = this._markingsCalibration;
	            if (!cfg) return null;

	            const state = cfg.state ?? (cfg.state = {});
	            let collapsed = state.collapsed !== undefined ? !!state.collapsed : true;

	            const section = makeEl('div', 'options-section');
	            const header = makeEl('div', 'options-section-header');
	            header.setAttribute('role', 'button');
	            header.tabIndex = 0;

	            const title = makeEl('div', 'options-section-title', 'Markings Calibration');
	            const collapseBtn = makeEl('button', 'options-btn options-btn-small options-icon-btn', collapsed ? '▸' : '▾');
	            collapseBtn.type = 'button';

	            const applyCollapsed = () => {
	                section.classList.toggle('is-collapsed', collapsed);
	                collapseBtn.textContent = collapsed ? '▸' : '▾';
	                collapseBtn.title = collapsed ? 'Expand' : 'Collapse';
	                collapseBtn.setAttribute('aria-label', collapsed ? 'Expand' : 'Collapse');
	            };

	            const toggleCollapsed = () => {
	                collapsed = !collapsed;
	                state.collapsed = collapsed;
	                applyCollapsed();
	            };

	            collapseBtn.addEventListener('click', () => toggleCollapsed());
	            header.addEventListener('click', (e) => {
	                const btn = e?.target?.closest?.('button');
	                if (btn && header.contains(btn)) return;
	                toggleCollapsed();
	            });
	            header.addEventListener('keydown', (e) => {
	                const key = e?.key ?? '';
	                if (key !== 'Enter' && key !== ' ') return;
	                e.preventDefault?.();
	                toggleCollapsed();
	            });

	            header.appendChild(title);
	            header.appendChild(collapseBtn);
	            section.appendChild(header);

	            const targetYellow = String(cfg.targetYellow ?? '-').toUpperCase();
	            const targetWhite = String(cfg.targetWhite ?? '-').toUpperCase();
	            const statusRow = makeValueRow({ label: 'Status', value: String(state.status ?? 'Ready') });
	            const targetYellowRow = makeValueRow({ label: 'Yellow target', value: targetYellow });
	            const targetWhiteRow = makeValueRow({ label: 'White target', value: targetWhite });
	            const measuredYellowRow = makeValueRow({ label: 'Yellow measured', value: String(state.yellow?.hex ?? '-').toUpperCase() });
	            const yellowSampleRow = makeValueRow({ label: 'Yellow sample', value: state.yellow?.sample ? `${state.yellow.sample.x},${state.yellow.sample.y} (avg ${state.yellow.sample.size}x${state.yellow.sample.size})` : '-' });
	            const measuredWhiteRow = makeValueRow({ label: 'White measured', value: String(state.white?.hex ?? '-').toUpperCase() });
	            const whiteSampleRow = makeValueRow({ label: 'White sample', value: state.white?.sample ? `${state.white.sample.x},${state.white.sample.y} (avg ${state.white.sample.size}x${state.white.sample.size})` : '-' });

	            const sampleRow = makeEl('div', 'options-row');
	            const sampleLabel = makeEl('div', 'options-row-label', 'Sample');
	            const sampleControl = makeEl('div', 'options-row-control');
	            const sampleBtn = makeEl('button', 'options-btn options-btn-primary', 'Sample Colors');
	            sampleBtn.type = 'button';
	            sampleControl.appendChild(sampleBtn);
	            sampleRow.appendChild(sampleLabel);
	            sampleRow.appendChild(sampleControl);

	            const setBusy = (busy) => {
	                const on = !!busy;
	                state.sampling = on;
	                sampleBtn.disabled = on;
	                sampleBtn.textContent = on ? 'Sampling…' : 'Sample Colors';
	            };

	            const setStatus = (text) => {
	                state.status = String(text ?? '');
	                statusRow.text.textContent = state.status;
	            };

	            const syncResults = () => {
	                measuredYellowRow.text.textContent = String(state.yellow?.hex ?? '-').toUpperCase();
	                yellowSampleRow.text.textContent = state.yellow?.sample
	                    ? `${state.yellow.sample.x},${state.yellow.sample.y} (avg ${state.yellow.sample.size}x${state.yellow.sample.size})`
	                    : '-';
	                measuredWhiteRow.text.textContent = String(state.white?.hex ?? '-').toUpperCase();
	                whiteSampleRow.text.textContent = state.white?.sample
	                    ? `${state.white.sample.x},${state.white.sample.y} (avg ${state.white.sample.size}x${state.white.sample.size})`
	                    : '-';
	            };

	            sampleBtn.addEventListener('click', async () => {
	                if (state.sampling) return;
	                setBusy(true);
	                setStatus('Sampling…');
	                try {
	                    const res = await Promise.resolve(cfg.onSample());
	                    if (!res || typeof res !== 'object') throw new Error('Sampling returned no result.');
	                    if (!res.yellow || !res.white) throw new Error('Missing measured colors.');
	                    state.yellow = res.yellow;
	                    state.white = res.white;
	                    setStatus('OK');
	                    syncResults();
	                } catch (err) {
	                    const msg = err instanceof Error ? err.message : String(err ?? 'Unknown error');
	                    console.error('[OptionsUI] Markings calibration sample failed', err);
	                    setStatus(`Error: ${msg}`);
	                } finally {
	                    setBusy(false);
	                }
	            });

	            const note = makeEl('div', 'options-note');
	            note.textContent = cfg.noteText || 'Samples on-screen sRGB at fixed points on the lane markings (uses current lighting + tone mapping).';

	            section.appendChild(statusRow.row);
	            section.appendChild(targetYellowRow.row);
	            section.appendChild(targetWhiteRow.row);
	            section.appendChild(measuredYellowRow.row);
	            section.appendChild(yellowSampleRow.row);
	            section.appendChild(measuredWhiteRow.row);
	            section.appendChild(whiteSampleRow.row);
	            section.appendChild(sampleRow);
	            section.appendChild(note);

	            applyCollapsed();
	            setBusy(!!state.sampling);
	            syncResults();
	            return section;
	        })();

	        const sectionColor = makeEl('div', 'options-section');
	        sectionColor.appendChild(makeEl('div', 'options-section-title', 'Color'));

    const colorControls = {
        value: makeNumberSliderRow({
            label: 'Asphalt value (bright/dark)',
            value: color.value ?? 0,
            min: -0.35,
            max: 0.35,
            step: 0.01,
            digits: 2,
            onChange: (v) => { color.value = v; emit(); }
        }),
        warmCool: makeNumberSliderRow({
            label: 'Warm/cool tint',
            value: color.warmCool ?? 0,
            min: -0.25,
            max: 0.25,
            step: 0.01,
            digits: 2,
            onChange: (v) => { color.warmCool = v; emit(); }
        }),
        saturation: makeNumberSliderRow({
            label: 'Saturation',
            value: color.saturation ?? 0,
            min: -0.5,
            max: 0.5,
            step: 0.01,
            digits: 2,
            onChange: (v) => { color.saturation = v; emit(); }
        })
    };

    sectionColor.appendChild(colorControls.value.row);
    sectionColor.appendChild(colorControls.warmCool.row);
    sectionColor.appendChild(colorControls.saturation.row);

    const sectionLivedIn = makeEl('div', 'options-section');
    sectionLivedIn.appendChild(makeEl('div', 'options-section-title', 'Lived-in'));

    const livedInControls = {
        edgeDirtEnabled: makeToggleRow({
            label: 'Edge dirt',
            value: edgeDirt.enabled,
            onChange: (v) => { edgeDirt.enabled = v; emit(); }
        }),
        edgeDirtStrength: makeNumberSliderRow({
            label: 'Edge dirt strength',
            value: edgeDirt.strength ?? 0.35,
            min: 0,
            max: 4,
            step: 0.01,
            digits: 2,
            onChange: (v) => { edgeDirt.strength = v; emit(); }
        }),
        edgeDirtWidth: makeNumberSliderRow({
            label: 'Edge dirt width (m)',
            value: edgeDirt.width ?? 0.65,
            min: 0,
            max: 2.5,
            step: 0.01,
            digits: 2,
            onChange: (v) => { edgeDirt.width = v; emit(); }
        }),
        edgeDirtScale: makeNumberSliderRow({
            label: 'Edge dirt scale',
            value: edgeDirt.scale ?? 0.55,
            min: 0.05,
            max: 10,
            step: 0.01,
            digits: 2,
            onChange: (v) => { edgeDirt.scale = v; emit(); }
        }),

        cracksEnabled: makeToggleRow({
            label: 'Cracks',
            value: cracks.enabled,
            onChange: (v) => { cracks.enabled = v; emit(); }
        }),
        cracksStrength: makeNumberSliderRow({
            label: 'Cracks strength',
            value: cracks.strength ?? 0.25,
            min: 0,
            max: 4,
            step: 0.01,
            digits: 2,
            onChange: (v) => { cracks.strength = v; emit(); }
        }),
        cracksScale: makeNumberSliderRow({
            label: 'Cracks scale',
            value: cracks.scale ?? 3.2,
            min: 0.1,
            max: 25,
            step: 0.1,
            digits: 1,
            onChange: (v) => { cracks.scale = v; emit(); }
        }),

        patchesEnabled: makeToggleRow({
            label: 'Patch repairs',
            value: patches.enabled,
            onChange: (v) => { patches.enabled = v; emit(); }
        }),
        patchesStrength: makeNumberSliderRow({
            label: 'Patch strength',
            value: patches.strength ?? 0.2,
            min: 0,
            max: 4,
            step: 0.01,
            digits: 2,
            onChange: (v) => { patches.strength = v; emit(); }
        }),
        patchesScale: makeNumberSliderRow({
            label: 'Patch scale',
            value: patches.scale ?? 4.0,
            min: 0.1,
            max: 25,
            step: 0.1,
            digits: 1,
            onChange: (v) => { patches.scale = v; emit(); }
        }),
        patchesCoverage: makeNumberSliderRow({
            label: 'Patch coverage',
            value: patches.coverage ?? 0.84,
            min: 0,
            max: 1,
            step: 0.01,
            digits: 2,
            onChange: (v) => { patches.coverage = v; emit(); }
        }),

        tireWearEnabled: makeToggleRow({
            label: 'Tire wear / polish',
            value: tireWear.enabled,
            onChange: (v) => { tireWear.enabled = v; emit(); }
        }),
        tireWearStrength: makeNumberSliderRow({
            label: 'Tire wear strength',
            value: tireWear.strength ?? 0.25,
            min: 0,
            max: 4,
            step: 0.01,
            digits: 2,
            onChange: (v) => { tireWear.strength = v; emit(); }
        }),
        tireWearScale: makeNumberSliderRow({
            label: 'Tire wear scale',
            value: tireWear.scale ?? 1.6,
            min: 0.1,
            max: 25,
            step: 0.1,
            digits: 1,
            onChange: (v) => { tireWear.scale = v; emit(); }
        })
    };

    sectionLivedIn.appendChild(livedInControls.edgeDirtEnabled.row);
    sectionLivedIn.appendChild(livedInControls.edgeDirtStrength.row);
    sectionLivedIn.appendChild(livedInControls.edgeDirtWidth.row);
    sectionLivedIn.appendChild(livedInControls.edgeDirtScale.row);
    sectionLivedIn.appendChild(livedInControls.cracksEnabled.row);
    sectionLivedIn.appendChild(livedInControls.cracksStrength.row);
    sectionLivedIn.appendChild(livedInControls.cracksScale.row);
    sectionLivedIn.appendChild(livedInControls.patchesEnabled.row);
    sectionLivedIn.appendChild(livedInControls.patchesStrength.row);
    sectionLivedIn.appendChild(livedInControls.patchesScale.row);
    sectionLivedIn.appendChild(livedInControls.patchesCoverage.row);
    sectionLivedIn.appendChild(livedInControls.tireWearEnabled.row);
    sectionLivedIn.appendChild(livedInControls.tireWearStrength.row);
    sectionLivedIn.appendChild(livedInControls.tireWearScale.row);

    const note = makeEl('div', 'options-note');
    note.textContent = 'Coarse drives large-area breakup; Fine adds grain. Color and lived-in overlays help tune realism without swapping textures.';

	        this.body.appendChild(sectionCoarse);
	        this.body.appendChild(sectionFine);
	        this.body.appendChild(sectionMarkings);
	        if (sectionMarkingsCalibration) this.body.appendChild(sectionMarkingsCalibration);
	        this.body.appendChild(sectionColor);
	        this.body.appendChild(sectionLivedIn);
	        this.body.appendChild(note);
	    }

