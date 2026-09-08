// Player mode controls and on-demand developer diagnostics for optional bakes.
import { makeChoiceRow, makeEl, makeToggleRow, makeValueRow } from '../OptionsUiControls.js';

export function renderBakedLightingTab() {
    this._ensureDraftBakedLighting();
    const baked = this._draftBakedLighting;
    const mode = makeEl('div', 'options-section');
    mode.appendChild(makeEl('div', 'options-section-title', 'Lighting mode'));
    mode.appendChild(makeChoiceRow({ label: 'Illumination mode', value: baked.mode,
        options: [{ id: 'current', label: 'Current' }, { id: 'baked', label: 'Baked' }, { id: 'auto', label: 'Auto' }],
        onChange: value => { baked.mode = value; this._emitLiveChange(); }
    }).row);
    mode.appendChild(makeEl('div', 'options-note', 'Current uses live lighting. Baked requests the selected baked channels; Auto uses them when an exact compatible profile is available. Loading or an unavailable profile keeps the complete Current rendering path.'));
    const status = {
        path: makeValueRow({ label: 'Active path', value: '-' }),
        state: makeValueRow({ label: 'Status', value: '-' }),
        profile: makeValueRow({ label: 'Map / sun profile', value: '-' })
    };
    for (const row of Object.values(status)) mode.appendChild(row.row);

    const channels = makeEl('div', 'options-section');
    channels.appendChild(makeEl('div', 'options-section-title', 'Baked preferences'));
    channels.appendChild(makeEl('div', 'options-note', 'These preferences are retained when you switch to Current. All selected channels activate together.'));
    channels.appendChild(makeToggleRow({ label: 'Enable baked shadows', value: baked.shadows.enabled,
        onChange: value => { baked.shadows.enabled = value; this._emitLiveChange(); }
    }).row);
    channels.appendChild(makeChoiceRow({ label: 'Moving-object shadow resolution', value: baked.shadows.dynamicResolution,
        options: [{ id: 'medium', label: 'Medium' }, { id: 'high', label: 'High' }],
        onChange: value => { baked.shadows.dynamicResolution = value; this._emitLiveChange(); }
    }).row);
    const indirect = makeToggleRow({ label: 'Enable baked indirect illumination', value: baked.receivers.indirect,
        onChange: value => { baked.receivers.indirect = value; this._emitLiveChange(); }
    });
    indirect.toggle.setAttribute('aria-label', 'Enable baked indirect illumination');
    channels.appendChild(indirect.row);
    channels.appendChild(makeEl('div', 'options-note', 'Indirect illumination includes the enhanced surface coverage, bounced light and sky occlusion. Sunlight stays live. When indirect illumination is active, the Graphics tab uses your AO preference for baked lighting (Dynamic Only by default).'));
    channels.appendChild(makeEl('div', 'options-note', 'Exposure, tone mapping and postprocessing remain adjustable. Changing sunlight, hemisphere lighting or IBL requires an exact matching bake; otherwise the game returns to Current.'));
    const receiverStatus = makeValueRow({ label: 'Illumination status', value: '-' });
    channels.appendChild(receiverStatus.row);

    const developer = makeEl('details', 'options-section');
    developer.appendChild(makeEl('summary', 'options-section-title', 'Developer diagnostics'));
    developer.appendChild(makeChoiceRow({ label: 'Illumination view', value: baked.receivers.debug,
        options: ['final', 'indirect', 'uv', 'pages', 'unmapped', 'difference', 'mip'].map(id => ({ id, label: id[0].toUpperCase() + id.slice(1) })),
        onChange: value => { baked.receivers.debug = value; this._emitLiveChange(); }
    }).row);
    const reload = makeEl('button', 'options-btn', 'Reload / revalidate');
    reload.type = 'button';
    reload.disabled = !this._reloadBakedLighting;
    reload.addEventListener('click', async () => {
        reload.disabled = true;
        try { await this._reloadBakedLighting?.(); }
        finally { reload.disabled = false; this._refreshBakedLightingDebug(); }
    });
    developer.appendChild(reload);
    developer.appendChild(makeEl('div', 'options-note', 'Reload discards cached publications and repeats validation. Offline baking: node tools/bake.mjs. See tools/baking/README.md for export, Blender configuration, validation and publication. Blender is never run by this menu.'));
    const details = makeEl('pre', 'options-note options-baked-diagnostics');
    developer.appendChild(details);
    this._bakedLightingDebugEls = { path: status.path.text, state: status.state.text, profile: status.profile.text,
        receivers: receiverStatus.text, details, developer };
    developer.addEventListener('toggle', () => this._refreshBakedLightingDebug());
    this.body.append(mode, channels, developer);
    this._refreshBakedLightingDebug();
}
