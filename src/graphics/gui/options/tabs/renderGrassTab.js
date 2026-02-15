import { makeEl, makeToggleRow } from '../OptionsUiControls.js';

export function renderGrassTab() {
    this._ensureDraftAsphaltNoise();

    const d = this._draftAsphaltNoise;
    const livedIn = d.livedIn ?? (d.livedIn = {});
    const strip = livedIn.sidewalkGrassEdgeStrip ?? (livedIn.sidewalkGrassEdgeStrip = {});
    const emit = () => this._emitLiveChange();

    const section = makeEl('div', 'options-section');
    section.appendChild(makeEl('div', 'options-section-title', 'Sidewalk Edge Blend'));

    const controls = {
        enabled: makeToggleRow({
            label: 'Sidewalk grass-edge dirt strip',
            value: strip.enabled,
            onChange: (v) => { strip.enabled = v; emit(); }
        })
    };

    section.appendChild(controls.enabled.row);

    const note = makeEl('div', 'options-note');
    note.textContent = 'Adds a subtle dirt/wear strip where sidewalks transition into grass/ground.';

    this.body.appendChild(section);
    this.body.appendChild(note);
}

