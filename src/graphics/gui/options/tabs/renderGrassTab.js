import { makeEl, makeSelectRow } from '../OptionsUiControls.js';

export function renderGrassTab() {
    const section = makeEl('div', 'options-section');
    section.appendChild(makeEl('div', 'options-section-title', 'Grass'));
    const details = makeEl('div', 'options-section');
    const title = makeEl('div', 'options-section-title');
    const note = makeEl('div', 'options-note');
    const refresh = () => {
        const mode = this._draftGrass.mode === '3d' ? '3D' : 'Texture';
        title.textContent = `${mode} details`;
        note.textContent = `Detailed ${mode} grass settings will be added later.`;
    };
    const mode = makeSelectRow({ label: 'Grass mode', value: this._draftGrass.mode,
        options: [{ id: 'texture', label: 'Texture' }, { id: '3d', label: '3D' }],
        onChange: value => { this._draftGrass.mode = value; refresh(); this._emitLiveChange(); } });
    mode.select.setAttribute('aria-label', 'Grass mode');
    section.appendChild(mode.row);
    details.append(title, note);
    refresh();
    this.body.append(section, details);
}
