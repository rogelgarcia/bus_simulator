import { makeChoiceRow, makeEl, makeToggleRow, makeValueRow } from '../OptionsUiControls.js';

export function renderBakedLightingTab() {
    this._ensureDraftBakedLighting();
    const baked = this._draftBakedLighting;

    const intro = makeEl(
        'div',
        'options-note',
        'Baked lighting reuses precomputed map lighting instead of rendering every static effect each frame, which should improve performance. If baked data for the current map is unavailable or out of date, the game safely uses legacy lighting and may run slower.'
    );

    const sectionShadows = makeEl('div', 'options-section');
    sectionShadows.appendChild(makeEl('div', 'options-section-title', 'Baked shadows'));
    const enabled = makeToggleRow({
        label: 'Enable baked shadows',
        value: baked.shadows.enabled === true,
        onChange: (value) => {
            baked.shadows.enabled = value;
            this._emitLiveChange();
        }
    });
    sectionShadows.appendChild(enabled.row);

    const dynamicResolution = makeChoiceRow({
        label: 'Moving-object shadow resolution',
        value: baked.shadows.dynamicResolution,
        options: [
            { id: 'medium', label: 'Medium' },
            { id: 'high', label: 'High' }
        ],
        onChange: (value) => {
            baked.shadows.dynamicResolution = value;
            this._emitLiveChange();
        }
    });
    sectionShadows.appendChild(dynamicResolution.row);
    sectionShadows.appendChild(makeEl(
        'div',
        'options-note',
        'Controls the shared real-time shadow map used by the bus and other registered moving objects. High doubles linear resolution from 2048 to 4096 while preserving coverage, using four times as many target pixels.'
    ));

    const status = {
        path: makeValueRow({ label: 'Active path', value: '-' }),
        state: makeValueRow({ label: 'Status', value: '-' }),
        profile: makeValueRow({ label: 'Map / sun profile', value: '-' })
    };
    sectionShadows.appendChild(status.path.row);
    sectionShadows.appendChild(status.state.row);
    sectionShadows.appendChild(status.profile.row);
    sectionShadows.appendChild(makeEl(
        'div',
        'options-note',
        'The current development cache activates only for an exact compatible map and sun profile. Loading or fallback never disables the complete legacy render path.'
    ));

    const future = makeEl('div', 'options-placeholder');
    future.appendChild(makeEl('div', 'options-placeholder-title', 'More baked lighting'));
    future.appendChild(makeEl('div', 'options-placeholder-text', 'Direct and indirect baked-light controls will be added here later.'));

    this._bakedLightingDebugEls = {
        path: status.path.text,
        state: status.state.text,
        profile: status.profile.text
    };
    this.body.appendChild(intro);
    this.body.appendChild(sectionShadows);
    this.body.appendChild(future);
    this._refreshBakedLightingDebug();
}
