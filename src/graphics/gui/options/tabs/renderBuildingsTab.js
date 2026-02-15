import { makeEl, makeNumberSliderRow, makeToggleRow } from '../OptionsUiControls.js';

export function renderBuildingsTab() {
    this._ensureDraftBuildingWindowVisuals();
    this._ensureDraftLighting();

    const sectionBuildings = makeEl('div', 'options-section');
    sectionBuildings.appendChild(makeEl('div', 'options-section-title', 'Buildings'));

    const d = this._draftBuildingWindowVisuals;
    const glass = d.reflective.glass ?? (d.reflective.glass = {});
    const emit = () => this._emitLiveChange();
    const controls = {
        reflective: makeToggleRow({
            label: 'Reflective building windows',
            value: d.reflective.enabled,
            onChange: (v) => { d.reflective.enabled = v; emit(); }
        }),
        glassEnvMapIntensity: makeNumberSliderRow({
            label: 'Window glass reflection intensity',
            value: glass.envMapIntensity ?? 4.0,
            min: 0,
            max: 5,
            step: 0.01,
            digits: 2,
            onChange: (v) => { glass.envMapIntensity = v; emit(); }
        }),
        glassRoughness: makeNumberSliderRow({
            label: 'Window glass roughness',
            value: glass.roughness ?? 0.02,
            min: 0,
            max: 1,
            step: 0.01,
            digits: 2,
            onChange: (v) => { glass.roughness = v; emit(); }
        }),
        glassTransmission: makeNumberSliderRow({
            label: 'Window glass transmission',
            value: glass.transmission ?? 0.0,
            min: 0,
            max: 1,
            step: 0.01,
            digits: 2,
            onChange: (v) => { glass.transmission = v; emit(); }
        }),
        glassIor: makeNumberSliderRow({
            label: 'Window glass ior',
            value: glass.ior ?? 2.2,
            min: 1,
            max: 2.5,
            step: 0.01,
            digits: 2,
            onChange: (v) => { glass.ior = v; emit(); }
        }),
        glassMetalness: makeNumberSliderRow({
            label: 'Window glass metalness',
            value: glass.metalness ?? 0.0,
            min: 0,
            max: 1,
            step: 0.01,
            digits: 2,
            onChange: (v) => { glass.metalness = v; emit(); }
        })
    };

    sectionBuildings.appendChild(controls.reflective.row);
    sectionBuildings.appendChild(controls.glassEnvMapIntensity.row);
    sectionBuildings.appendChild(controls.glassRoughness.row);
    sectionBuildings.appendChild(controls.glassTransmission.row);
    sectionBuildings.appendChild(controls.glassIor.row);
    sectionBuildings.appendChild(controls.glassMetalness.row);

    const syncReflectiveEnabled = (enabled) => {
        const off = !enabled;
        for (const entry of [
            controls.glassEnvMapIntensity,
            controls.glassRoughness,
            controls.glassTransmission,
            controls.glassIor,
            controls.glassMetalness
        ]) {
            entry.range.disabled = off;
            entry.number.disabled = off;
        }
    };
    syncReflectiveEnabled(!!d.reflective.enabled);
    controls.reflective.toggle.addEventListener('change', () => syncReflectiveEnabled(!!controls.reflective.toggle.checked));

    if (!this._draftLighting?.ibl?.enabled) {
        const warn = makeEl('div', 'options-note');
        warn.textContent = 'IBL is disabled. Reflective windows need IBL (Lighting tab) to show reflections.';
        sectionBuildings.appendChild(warn);
    }

    const note = makeEl('div', 'options-note');
    note.textContent = 'Changes apply live to the current scene. Save to persist. If you still don’t see reflections, reload (to regenerate buildings/materials).';

    this.body.appendChild(sectionBuildings);
    this.body.appendChild(note);
}

