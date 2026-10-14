import { GRASS_QUALITY_PRESETS } from '../../../../app/grass/GrassSettings.js';
import { makeEl, makeChoiceRow } from '../OptionsUiControls.js';

export function renderGrassTab() {
    const section = makeEl('div', 'options-section');
    section.appendChild(makeEl('div', 'options-section-title', 'Grass'));
    const note = makeEl('div', 'options-note');
    note.setAttribute('role', 'status');
    const refresh = () => {
        for (const id of Object.keys(GRASS_QUALITY_PRESETS)) mode.getButton(id).setAttribute('aria-pressed', String(id === this._draftGrass.mode));
        note.textContent = GRASS_QUALITY_PRESETS[this._draftGrass.mode].description;
    };
    const mode = makeChoiceRow({ label: 'Grass quality', value: this._draftGrass.mode,
        options: Object.entries(GRASS_QUALITY_PRESETS).map(([id, preset]) => ({ id, label: preset.label })),
        onChange: value => { this._draftGrass.mode = value; refresh(); this._emitLiveChange(); } });
    mode.row.classList.add('options-grass-quality');
    mode.row.setAttribute('role', 'group'); mode.row.setAttribute('aria-label', 'Grass quality');
    section.append(mode.row, note);
    refresh();
    this.body.append(section);
}
