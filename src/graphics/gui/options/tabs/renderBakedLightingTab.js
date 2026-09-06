import { makeChoiceRow, makeEl, makeToggleRow, makeValueRow } from '../OptionsUiControls.js';
import { applyMaterialSymbolToButton, createMaterialSymbolIcon } from '../../shared/materialSymbols.js';

export function renderBakedLightingTab() {
    this._ensureDraftBakedLighting();
    const baked = this._draftBakedLighting;

    const intro = makeEl(
        'div',
        'options-note',
        'Baked lighting reuses precomputed shadows and illumination. Performance depends on map coverage and texture cost. If the current map or lighting profile does not match the bake, the game uses live lighting.'
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

    const illumination = makeEl('div', 'options-section');
    illumination.appendChild(makeEl('div', 'options-section-title', 'Blender illumination (preview)'));
    const receiverControls = makeEl('div', 'options-illumination-toggles');
    const toggles = new Map();
    const link = makeEl('button', 'options-btn options-illumination-link');
    link.type = 'button';
    baked.receivers.linked ??= true;
    const syncControls = () => {
        for (const [key, control] of toggles) control.toggle.checked = baked.receivers[key];
        link.setAttribute('aria-pressed', String(baked.receivers.linked));
        applyMaterialSymbolToButton(link, {
            name: baked.receivers.linked ? 'link' : 'link_off',
            label: 'Link direct and indirect illumination'
        });
        link.title = baked.receivers.linked
            ? 'Linked: either switch changes both illumination channels'
            : 'Link illumination switches using the indirect switch value';
    };
    for (const [key, label] of [['indirect', 'Enable baked indirect illumination'], ['direct', 'Enable baked direct illumination']]) {
        const control = makeToggleRow({ label, value: baked.receivers[key], onChange: (value) => {
            baked.receivers[key] = value;
            if (baked.receivers.linked) {
                baked.receivers.direct = value;
                baked.receivers.indirect = value;
            }
            syncControls();
            this._emitLiveChange();
        } });
        control.toggle.setAttribute('aria-label', label);
        toggles.set(key, control);
        receiverControls.appendChild(control.row);
    }
    link.addEventListener('click', () => {
        baked.receivers.linked = !baked.receivers.linked;
        if (baked.receivers.linked) baked.receivers.direct = baked.receivers.indirect;
        syncControls();
        this._emitLiveChange();
    });
    syncControls();
    receiverControls.appendChild(link);
    illumination.appendChild(receiverControls);
    const enhanced = makeToggleRow({ label: 'Enhanced baked illumination (AI 548)', value: baked.receivers.enhanced === true,
        onChange: (value) => { baked.receivers.enhanced = value; this._emitLiveChange(); } });
    enhanced.toggle.setAttribute('aria-label', 'Enhanced baked illumination (AI 548)');
    const warning = createMaterialSymbolIcon('warning', { size: 'sm', ariaHidden: false });
    warning.title = 'This feature is buggy and should not be used. It can cause visual artifacts.';
    warning.setAttribute('role', 'img');
    warning.setAttribute('aria-label', warning.title);
    enhanced.toggle.setAttribute('aria-description', warning.title);
    enhanced.row.querySelector('.options-row-label').append('\u00a0', warning);
    illumination.appendChild(enhanced.row);
    illumination.appendChild(makeEl('div', 'options-note', 'Adds baked indirect light and sky occlusion to opaque surfaces, including ground tiles, platform sides and buildings. It uses the existing baked sun shadows, so enabling it does not increase sun-shadow resolution. Turn off to compare with the original preview. Each version retains its loaded maps in memory.'));
    illumination.appendChild(makeEl('div', 'options-note', 'Blender lighting can change brightness and color. The original preview covers selected static surfaces. The enhanced bake covers supported opaque surfaces; glass and the moving bus keep live lighting. Direct illumination is experimental and requires active baked shadows.'));
    illumination.appendChild(makeEl('div', 'options-note', 'This preview uses the default city lighting profile. The status below shows the current check or map-loading step and elapsed time. Existing lighting continues while it loads. Loaded maps stay cached in memory when disabled.'));
    illumination.appendChild(makeChoiceRow({ label: 'Illumination view', value: baked.receivers.debug,
        options: ['final', 'direct', 'indirect', 'combined', 'uv', 'pages', 'unmapped', 'difference', 'mip'].map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) })),
        onChange: (value) => { baked.receivers.debug = value; this._emitLiveChange(); }
    }).row);
    const receiverStatus = makeValueRow({ label: 'Illumination status', value: '-' });
    illumination.appendChild(receiverStatus.row);

    this._bakedLightingDebugEls = {
        path: status.path.text,
        state: status.state.text,
        profile: status.profile.text,
        receivers: receiverStatus.text
    };
    this.body.appendChild(intro);
    this.body.appendChild(sectionShadows);
    this.body.appendChild(illumination);
    this._refreshBakedLightingDebug();
}
