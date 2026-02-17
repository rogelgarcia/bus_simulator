import { getColorGradingPresetOptions } from '../../../visuals/postprocessing/ColorGradingPresets.js';
import { getSunFlarePresetById, getSunFlarePresetOptions } from '../../../visuals/sun/SunFlarePresets.js';
import { makeChoiceRow, makeColorRow, makeEl, makeNumberSliderRow, makeToggleRow, makeValueRow } from '../OptionsUiControls.js';

export function renderLightingTab() {
    this._ensureDraftLighting();
    this._ensureDraftAtmosphere();
    this._ensureDraftBloom();
    this._ensureDraftColorGrading();
    this._ensureDraftSunFlare();

    const sectionIbl = makeEl('div', 'options-section');
    sectionIbl.appendChild(makeEl('div', 'options-section-title', 'IBL'));

    const sectionLighting = makeEl('div', 'options-section');
    sectionLighting.appendChild(makeEl('div', 'options-section-title', 'Renderer + Lights'));

    const sectionAtmosphere = makeEl('div', 'options-section');
    sectionAtmosphere.appendChild(makeEl('div', 'options-section-title', 'Atmosphere / Sky'));
    const showAtmosphereSection = this._showLightingAtmosphereSection !== false;

    const d = this._draftLighting;
    const atmo = this._draftAtmosphere;
    const bloom = this._draftBloom;
    const grading = this._draftColorGrading;
    const sunFlare = this._draftSunFlare;
    const emit = () => this._emitLiveChange();
    let syncGradeEnabled = () => {};
    let syncSunFlareControls = () => {};
	        const controls = {
	            iblEnabled: makeToggleRow({
	                label: 'IBL enabled',
	                value: d.ibl.enabled,
	                onChange: (v) => { d.ibl.enabled = v; emit(); }
	            }),
        iblIntensity: makeNumberSliderRow({
            label: 'IBL intensity (envMapIntensity)',
            value: d.ibl.envMapIntensity,
            min: 0,
            max: 5,
            step: 0.01,
            digits: 2,
            onChange: (v) => { d.ibl.envMapIntensity = v; emit(); }
        }),
	            iblBackground: makeToggleRow({
	                label: 'HDR background',
	                value: d.ibl.setBackground,
	                onChange: (v) => { d.ibl.setBackground = v; emit(); }
	            }),
        iblProbeSphere: makeToggleRow({
            label: 'Show IBL probe sphere',
            value: !!d.ibl.showProbeSphere,
            onChange: (v) => { d.ibl.showProbeSphere = v; emit(); }
        }),
        exposure: makeNumberSliderRow({
            label: 'Tone mapping exposure',
            value: d.exposure,
            min: 0.1,
            max: 5,
            step: 0.01,
            digits: 2,
            onChange: (v) => { d.exposure = v; emit(); }
        }),
        hemi: makeNumberSliderRow({
            label: 'Hemisphere intensity',
            value: d.hemiIntensity,
            min: 0,
            max: 5,
            step: 0.01,
            digits: 2,
            onChange: (v) => { d.hemiIntensity = v; emit(); }
        }),
        sun: makeNumberSliderRow({
            label: 'Sun intensity',
            value: d.sunIntensity,
            min: 0,
            max: 10,
            step: 0.01,
            digits: 2,
            onChange: (v) => { d.sunIntensity = v; emit(); }
        }),
        sunAzimuthDeg: makeNumberSliderRow({
            label: 'Sun azimuth (°)',
            value: atmo.sun.azimuthDeg,
            min: 0,
            max: 360,
            step: 1,
            digits: 0,
            onChange: (v) => { atmo.sun.azimuthDeg = v; emit(); }
        }),
        sunElevationDeg: makeNumberSliderRow({
            label: 'Sun elevation (°)',
            value: atmo.sun.elevationDeg,
            min: 0,
            max: 89,
            step: 1,
            digits: 0,
            onChange: (v) => { atmo.sun.elevationDeg = v; emit(); }
        }),
        skyBgMode: makeChoiceRow({
            label: 'Background priority',
            value: atmo.sky.iblBackgroundMode,
            options: [
                { id: 'ibl', label: 'IBL (HDR background)' },
                { id: 'gradient', label: 'Gradient (force sky)' }
            ],
            onChange: (v) => { atmo.sky.iblBackgroundMode = v; emit(); }
        }),
        skyHorizon: makeColorRow({
            label: 'Sky horizon',
            value: atmo.sky.horizonColor,
            onChange: (v) => { atmo.sky.horizonColor = v; emit(); }
        }),
        skyZenith: makeColorRow({
            label: 'Sky zenith',
            value: atmo.sky.zenithColor,
            onChange: (v) => { atmo.sky.zenithColor = v; emit(); }
        }),
        skyGround: makeColorRow({
            label: 'Sky ground',
            value: atmo.sky.groundColor,
            onChange: (v) => { atmo.sky.groundColor = v; emit(); }
        }),
        skyExposure: makeNumberSliderRow({
            label: 'Sky exposure',
            value: atmo.sky.exposure,
            min: 0,
            max: 8,
            step: 0.01,
            digits: 2,
            onChange: (v) => { atmo.sky.exposure = v; emit(); }
        }),
        skyCurve: makeNumberSliderRow({
            label: 'Sky curve',
            value: atmo.sky.curve,
            min: 0.05,
            max: 8,
            step: 0.01,
            digits: 2,
            onChange: (v) => { atmo.sky.curve = v; emit(); }
        }),
        skyDither: makeNumberSliderRow({
            label: 'Sky dither',
            value: atmo.sky.ditherStrength,
            min: 0,
            max: 2,
            step: 0.01,
            digits: 2,
            onChange: (v) => { atmo.sky.ditherStrength = v; emit(); }
        }),
        hazeEnabled: makeToggleRow({
            label: 'Horizon haze',
            value: atmo.haze.enabled,
            onChange: (v) => { atmo.haze.enabled = v; emit(); }
        }),
        hazeIntensity: makeNumberSliderRow({
            label: 'Haze intensity',
            value: atmo.haze.intensity,
            min: 0,
            max: 4,
            step: 0.01,
            digits: 2,
            onChange: (v) => { atmo.haze.intensity = v; emit(); }
        }),
        hazeThickness: makeNumberSliderRow({
            label: 'Haze thickness',
            value: atmo.haze.thickness,
            min: 0.02,
            max: 1,
            step: 0.01,
            digits: 2,
            onChange: (v) => { atmo.haze.thickness = v; emit(); }
        }),
        hazeCurve: makeNumberSliderRow({
            label: 'Haze curve',
            value: atmo.haze.curve,
            min: 0.1,
            max: 8,
            step: 0.01,
            digits: 2,
            onChange: (v) => { atmo.haze.curve = v; emit(); }
        }),
        glareEnabled: makeToggleRow({
            label: 'Sun glare',
            value: atmo.glare.enabled,
            onChange: (v) => { atmo.glare.enabled = v; emit(); }
        }),
        glareIntensity: makeNumberSliderRow({
            label: 'Glare intensity',
            value: atmo.glare.intensity,
            min: 0,
            max: 20,
            step: 0.01,
            digits: 2,
            onChange: (v) => { atmo.glare.intensity = v; emit(); }
        }),
        glareSigma: makeNumberSliderRow({
            label: 'Glare size (σ °)',
            value: atmo.glare.sigmaDeg,
            min: 0.25,
            max: 60,
            step: 0.01,
            digits: 2,
            onChange: (v) => { atmo.glare.sigmaDeg = v; emit(); }
        }),
        glarePower: makeNumberSliderRow({
            label: 'Glare power',
            value: atmo.glare.power,
            min: 0.2,
            max: 6,
            step: 0.01,
            digits: 2,
            onChange: (v) => { atmo.glare.power = v; emit(); }
        }),
        discEnabled: makeToggleRow({
            label: 'Sun disc',
            value: atmo.disc.enabled,
            onChange: (v) => { atmo.disc.enabled = v; emit(); }
        }),
        discIntensity: makeNumberSliderRow({
            label: 'Disc intensity',
            value: atmo.disc.intensity,
            min: 0,
            max: 50,
            step: 0.01,
            digits: 2,
            onChange: (v) => { atmo.disc.intensity = v; emit(); }
        }),
        discSigma: makeNumberSliderRow({
            label: 'Disc size (σ °)',
            value: atmo.disc.sigmaDeg,
            min: 0.05,
            max: 5,
            step: 0.01,
            digits: 2,
            onChange: (v) => { atmo.disc.sigmaDeg = v; emit(); }
        }),
        discCoreIntensity: makeNumberSliderRow({
            label: 'Disc core intensity',
            value: atmo.disc.coreIntensity,
            min: 0,
            max: 50,
            step: 0.01,
            digits: 2,
            onChange: (v) => { atmo.disc.coreIntensity = v; emit(); }
        }),
        discCoreSigma: makeNumberSliderRow({
            label: 'Disc core size (σ °)',
            value: atmo.disc.coreSigmaDeg,
            min: 0.02,
            max: 5,
            step: 0.01,
            digits: 2,
            onChange: (v) => { atmo.disc.coreSigmaDeg = v; emit(); }
        }),
        skyDebugMode: makeChoiceRow({
            label: 'Sky debug',
            value: atmo.debug.mode,
            options: [
                { id: 'full', label: 'Full' },
                { id: 'baseline', label: 'Baseline' },
                { id: 'glare', label: 'Glare' },
                { id: 'disc', label: 'Disc' }
            ],
            onChange: (v) => { atmo.debug.mode = v; emit(); }
        }),
        skySunRing: makeToggleRow({
            label: 'Show sun ring',
            value: atmo.debug.showSunRing,
            onChange: (v) => { atmo.debug.showSunRing = v; emit(); }
        }),
        bloomEnabled: makeToggleRow({
            label: 'Bloom (glow)',
            value: bloom.enabled,
            onChange: (v) => { bloom.enabled = v; emit(); }
        }),
        bloomStrength: makeNumberSliderRow({
            label: 'Bloom strength',
            value: bloom.strength,
            min: 0,
            max: 3,
            step: 0.01,
            digits: 2,
            onChange: (v) => { bloom.strength = v; emit(); }
        }),
        bloomRadius: makeNumberSliderRow({
            label: 'Bloom radius',
            value: bloom.radius,
            min: 0,
            max: 1,
            step: 0.01,
            digits: 2,
            onChange: (v) => { bloom.radius = v; emit(); }
        }),
        bloomThreshold: makeNumberSliderRow({
            label: 'Bloom threshold (HDR)',
            value: bloom.threshold,
            min: 0,
            max: 5,
            step: 0.01,
            digits: 2,
            onChange: (v) => { bloom.threshold = v; emit(); }
        }),
        sunFlarePreset: makeChoiceRow({
            label: 'Sun flare',
            value: sunFlare.enabled ? sunFlare.preset : 'off',
            options: [
                { id: 'off', label: 'Off' },
                ...getSunFlarePresetOptions()
            ],
            onChange: (v) => {
                const id = String(v ?? '').trim().toLowerCase();
                if (id === 'off') {
                    sunFlare.enabled = false;
                    sunFlare.components = { core: false, halo: false, starburst: false, ghosting: false };
                    syncSunFlareControls();
                    emit();
                    return;
                }
                sunFlare.enabled = true;
                sunFlare.preset = id;
                if (id === 'cinematic') sunFlare.strength = 1.1;
                else if (id === 'subtle') sunFlare.strength = 0.65;
                const preset = getSunFlarePresetById(id);
                if (preset?.components) sunFlare.components = { ...preset.components };
                syncSunFlareControls();
                emit();
            }
        }),
        sunFlareStrength: makeNumberSliderRow({
            label: 'Sun flare strength',
            value: sunFlare.strength,
            min: 0,
            max: 2,
            step: 0.01,
            digits: 2,
            onChange: (v) => { sunFlare.strength = v; emit(); }
        }),
        sunFlareCore: makeToggleRow({
            label: 'Flare core',
            value: sunFlare.components?.core,
            onChange: (v) => { sunFlare.components.core = v; emit(); }
        }),
        sunFlareHalo: makeToggleRow({
            label: 'Flare halo/waves',
            value: sunFlare.components?.halo,
            onChange: (v) => { sunFlare.components.halo = v; emit(); }
        }),
        sunFlareStarburst: makeToggleRow({
            label: 'Flare starburst',
            value: sunFlare.components?.starburst,
            onChange: (v) => { sunFlare.components.starburst = v; emit(); }
        }),
        sunFlareGhosting: makeToggleRow({
            label: 'Flare ghosting',
            value: sunFlare.components?.ghosting,
            onChange: (v) => { sunFlare.components.ghosting = v; emit(); }
        }),
        gradePreset: makeChoiceRow({
            label: 'Color grading (LUT)',
            value: grading.preset,
            options: getColorGradingPresetOptions(),
            onChange: (v) => {
                grading.preset = v;
                syncGradeEnabled(v);
                emit();
            }
        }),
        gradeIntensity: makeNumberSliderRow({
            label: 'Color grading intensity',
            value: grading.intensity,
            min: 0,
            max: 1,
            step: 0.01,
            digits: 2,
            onChange: (v) => { grading.intensity = v; emit(); }
        })
    };

    sectionIbl.appendChild(controls.iblEnabled.row);
    sectionIbl.appendChild(controls.iblIntensity.row);
    sectionIbl.appendChild(controls.iblBackground.row);
    sectionIbl.appendChild(controls.iblProbeSphere.row);

    let iblStatusSection = null;
    if (this._getIblDebugInfo) {
	            iblStatusSection = makeEl('div', 'options-section');
	            iblStatusSection.appendChild(makeEl('div', 'options-section-title', 'IBL Status'));
	            const rowEnvMap = makeValueRow({ label: 'Env map', value: '-' });
	            const rowIntensity = makeValueRow({ label: 'Config intensity', value: '-' });
	            const rowSceneEnv = makeValueRow({ label: 'Scene.environment', value: '-' });
	            const rowSceneBg = makeValueRow({ label: 'Scene.background', value: '-' });
	            const rowBgConfig = makeValueRow({ label: 'Config HDR background', value: '-' });
	            const rowEnvIsTexture = makeValueRow({ label: 'Env isTexture', value: '-' });
	            const rowEnvType = makeValueRow({ label: 'Env type', value: '-' });
	            const rowEnvMapMapping = makeValueRow({ label: 'Env mapping', value: '-' });
	            const rowEnvUserData = makeValueRow({ label: 'Env userData', value: '-' });
	            const rowSceneMatch = makeValueRow({ label: 'Env matches loaded', value: '-' });
	            const rowProbeEnvMap = makeValueRow({ label: 'Probe envMap', value: '-' });
	            const rowProbeEnvIsTexture = makeValueRow({ label: 'Probe env isTexture', value: '-' });
	            const rowProbeEnvType = makeValueRow({ label: 'Probe env type', value: '-' });
	            const rowProbeEnvMapMapping = makeValueRow({ label: 'Probe env mapping', value: '-' });
	            const rowProbeMaterial = makeValueRow({ label: 'Probe material', value: '-' });
	            const rowProbeIntensity = makeValueRow({ label: 'Probe envMapIntensity', value: '-' });
	            const rowProbeScreen = makeValueRow({ label: 'Probe screen', value: '-' });
	            const rowProbeVisible = makeValueRow({ label: 'Probe visible', value: '-' });
	            const rowProbeRadius = makeValueRow({ label: 'Probe radius', value: '-' });
	            const rowHdrUrl = makeValueRow({ label: 'HDR URL', value: '-' });
	            iblStatusSection.appendChild(rowEnvMap.row);
	            iblStatusSection.appendChild(rowIntensity.row);
	            iblStatusSection.appendChild(rowSceneEnv.row);
	            iblStatusSection.appendChild(rowSceneBg.row);
	            iblStatusSection.appendChild(rowBgConfig.row);
	            iblStatusSection.appendChild(rowEnvIsTexture.row);
	            iblStatusSection.appendChild(rowEnvType.row);
	            iblStatusSection.appendChild(rowEnvMapMapping.row);
	            iblStatusSection.appendChild(rowEnvUserData.row);
	            iblStatusSection.appendChild(rowSceneMatch.row);
	            iblStatusSection.appendChild(rowProbeEnvMap.row);
	            iblStatusSection.appendChild(rowProbeEnvIsTexture.row);
	            iblStatusSection.appendChild(rowProbeEnvType.row);
	            iblStatusSection.appendChild(rowProbeEnvMapMapping.row);
	            iblStatusSection.appendChild(rowProbeMaterial.row);
	            iblStatusSection.appendChild(rowProbeIntensity.row);
	            iblStatusSection.appendChild(rowProbeScreen.row);
	            iblStatusSection.appendChild(rowProbeVisible.row);
	            iblStatusSection.appendChild(rowProbeRadius.row);
	            iblStatusSection.appendChild(rowHdrUrl.row);
	            this._iblDebugEls = {
	                envMap: rowEnvMap.text,
	                intensity: rowIntensity.text,
	                sceneEnv: rowSceneEnv.text,
	                sceneBg: rowSceneBg.text,
	                bgConfig: rowBgConfig.text,
	                envIsTexture: rowEnvIsTexture.text,
	                envType: rowEnvType.text,
	                envMapMapping: rowEnvMapMapping.text,
	                envUserData: rowEnvUserData.text,
	                sceneMatch: rowSceneMatch.text,
	                probeEnvMap: rowProbeEnvMap.text,
	                probeEnvIsTexture: rowProbeEnvIsTexture.text,
	                probeEnvType: rowProbeEnvType.text,
	                probeEnvMapMapping: rowProbeEnvMapMapping.text,
	                probeMaterial: rowProbeMaterial.text,
	                probeIntensity: rowProbeIntensity.text,
	                probeScreen: rowProbeScreen.text,
	                probeVisible: rowProbeVisible.text,
	                probeRadius: rowProbeRadius.text,
	                hdrUrl: rowHdrUrl.text
	            };
	        }

    sectionLighting.appendChild(controls.exposure.row);
    sectionLighting.appendChild(controls.hemi.row);
    sectionLighting.appendChild(controls.sun.row);

    sectionAtmosphere.appendChild(controls.sunAzimuthDeg.row);
    sectionAtmosphere.appendChild(controls.sunElevationDeg.row);
    sectionAtmosphere.appendChild(controls.skyBgMode.row);
    sectionAtmosphere.appendChild(controls.skyHorizon.row);
    sectionAtmosphere.appendChild(controls.skyZenith.row);
    sectionAtmosphere.appendChild(controls.skyGround.row);
    sectionAtmosphere.appendChild(controls.skyExposure.row);
    sectionAtmosphere.appendChild(controls.skyCurve.row);
    sectionAtmosphere.appendChild(controls.skyDither.row);
    sectionAtmosphere.appendChild(controls.hazeEnabled.row);
    sectionAtmosphere.appendChild(controls.hazeIntensity.row);
    sectionAtmosphere.appendChild(controls.hazeThickness.row);
    sectionAtmosphere.appendChild(controls.hazeCurve.row);
    sectionAtmosphere.appendChild(controls.glareEnabled.row);
    sectionAtmosphere.appendChild(controls.glareIntensity.row);
    sectionAtmosphere.appendChild(controls.glareSigma.row);
    sectionAtmosphere.appendChild(controls.glarePower.row);
    sectionAtmosphere.appendChild(controls.discEnabled.row);
    sectionAtmosphere.appendChild(controls.discIntensity.row);
    sectionAtmosphere.appendChild(controls.discSigma.row);
    sectionAtmosphere.appendChild(controls.discCoreIntensity.row);
    sectionAtmosphere.appendChild(controls.discCoreSigma.row);
    sectionAtmosphere.appendChild(controls.skyDebugMode.row);
    sectionAtmosphere.appendChild(controls.skySunRing.row);

    const sectionPost = makeEl('div', 'options-section');
    sectionPost.appendChild(makeEl('div', 'options-section-title', 'Post-processing'));
    if (this._getPostProcessingDebugInfo) {
        const pipelineRow = makeValueRow({ label: 'Post-processing pipeline', value: '-' });
        const bloomRow = makeValueRow({ label: 'Bloom (active now)', value: '-' });
        const aoRow = makeValueRow({ label: 'Ambient occlusion (active now)', value: '-' });
        const gradeRow = makeValueRow({ label: 'Color grading (active now)', value: '-' });
        sectionPost.appendChild(pipelineRow.row);
        sectionPost.appendChild(bloomRow.row);
        sectionPost.appendChild(aoRow.row);
        sectionPost.appendChild(gradeRow.row);
        this._postDebugEls = { pipeline: pipelineRow.text, bloom: bloomRow.text, ao: aoRow.text, grading: gradeRow.text };
    } else {
        if (this._initialPostProcessingActive !== null) {
            sectionPost.appendChild(makeValueRow({
                label: 'Post-processing pipeline (active now)',
                value: this._initialPostProcessingActive ? 'On (composer)' : 'Off (direct)'
            }).row);
        }
        if (this._initialColorGradingDebug) {
            const requested = String(this._initialColorGradingDebug.requestedPreset ?? 'off');
            const intensity = Number.isFinite(this._initialColorGradingDebug.intensity) ? this._initialColorGradingDebug.intensity : 0;
            const hasLut = !!this._initialColorGradingDebug.hasLut;
            sectionPost.appendChild(makeValueRow({
                label: 'Color grading (active now)',
                value: (requested === 'off' || intensity <= 0)
                    ? 'Off'
                    : `${requested} (${intensity.toFixed(2)})${hasLut ? '' : ' (loading)'}`
            }).row);
        }
    }
    sectionPost.appendChild(controls.bloomEnabled.row);
    sectionPost.appendChild(controls.bloomStrength.row);
    sectionPost.appendChild(controls.bloomRadius.row);
    sectionPost.appendChild(controls.bloomThreshold.row);
    sectionPost.appendChild(controls.sunFlarePreset.row);
    sectionPost.appendChild(controls.sunFlareStrength.row);
    sectionPost.appendChild(controls.sunFlareCore.row);
    sectionPost.appendChild(controls.sunFlareHalo.row);
    sectionPost.appendChild(controls.sunFlareStarburst.row);
    sectionPost.appendChild(controls.sunFlareGhosting.row);
    sectionPost.appendChild(controls.gradePreset.row);
    sectionPost.appendChild(controls.gradeIntensity.row);

    const syncBloomEnabled = (enabled) => {
        const off = !enabled;
        controls.bloomStrength.range.disabled = off;
        controls.bloomStrength.number.disabled = off;
        controls.bloomRadius.range.disabled = off;
        controls.bloomRadius.number.disabled = off;
        controls.bloomThreshold.range.disabled = off;
        controls.bloomThreshold.number.disabled = off;
    };
    syncBloomEnabled(!!bloom.enabled);
    controls.bloomEnabled.toggle.addEventListener('change', () => syncBloomEnabled(!!controls.bloomEnabled.toggle.checked));

    syncGradeEnabled = (presetId) => {
        const off = String(presetId ?? '').trim().toLowerCase() === 'off';
        controls.gradeIntensity.range.disabled = off;
        controls.gradeIntensity.number.disabled = off;
    };
    syncGradeEnabled(controls.gradePreset.getValue());

    syncSunFlareControls = () => {
        const enabled = !!sunFlare.enabled;
        const disabled = !enabled;
        controls.sunFlareStrength.range.disabled = disabled;
        controls.sunFlareStrength.number.disabled = disabled;
        for (const entry of [controls.sunFlareCore, controls.sunFlareHalo, controls.sunFlareStarburst, controls.sunFlareGhosting]) {
            entry.toggle.disabled = disabled;
        }
        controls.sunFlareCore.toggle.checked = !!sunFlare.components?.core;
        controls.sunFlareHalo.toggle.checked = !!sunFlare.components?.halo;
        controls.sunFlareStarburst.toggle.checked = !!sunFlare.components?.starburst;
        controls.sunFlareGhosting.toggle.checked = !!sunFlare.components?.ghosting;

        const strength = Number.isFinite(sunFlare.strength) ? sunFlare.strength : 0;
        controls.sunFlareStrength.range.value = String(strength);
        controls.sunFlareStrength.number.value = String(strength.toFixed(2));
    };
    syncSunFlareControls();

    const note = makeEl('div', 'options-note');
    note.textContent = 'URL params override saved settings (e.g. ibl, iblIntensity, iblBackground, bloom, sunFlare, grade). Bloom affects only bright pixels; raise threshold to reduce glow.';

    this.body.appendChild(sectionIbl);
    if (iblStatusSection) this.body.appendChild(iblStatusSection);
    this.body.appendChild(sectionLighting);
    if (showAtmosphereSection) {
        this.body.appendChild(sectionAtmosphere);
    } else {
        const fixedAtmosphereNote = makeEl('div', 'options-note');
        fixedAtmosphereNote.textContent = 'Atmosphere controls are fixed for this tool to keep look-dev captures repeatable.';
        this.body.appendChild(fixedAtmosphereNote);
    }
    this.body.appendChild(sectionPost);
    this.body.appendChild(note);

    this._lightingControls = controls;
    this._refreshIblDebug();
    this._refreshPostProcessingDebug();
}
