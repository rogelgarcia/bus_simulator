// Compare complete daylight recipes without changing scene materials or camera poses.
import { applyDaylightPreset, DAYLIGHT_PRESET_OPTIONS, getDaylightPresetId } from '../../../lighting/DaylightPresets.js';
import { makeChoiceRow, makeEl } from '../OptionsUiControls.js';

export function renderDaylightPresetControls(ui) {
    const section = makeEl('div', 'options-section');
    section.appendChild(makeEl('div', 'options-section-title', 'Daylight comparison'));
    const choice = makeChoiceRow({ label: 'Lighting preset', options: DAYLIGHT_PRESET_OPTIONS,
        value: getDaylightPresetId(ui.getDraft()),
        onChange: id => {
            ui._setDraftFromFullDraft(applyDaylightPreset(ui.getDraft(), id));
            ui._renderTab();
            ui._emitLiveChange();
        }
    });
    const status = makeEl('div', 'options-note');
    status.setAttribute('role', 'status');
    ui._refreshDaylightPreset = () => {
        const id = getDaylightPresetId(ui.getDraft());
        const view = ui._getBakedLightingDebugInfo?.()?.view;
        for (const option of DAYLIGHT_PRESET_OPTIONS) {
            const active = id === option.id;
            choice.getButton(option.id).classList.toggle('is-active', active);
            choice.getButton(option.id).setAttribute('aria-pressed', String(active));
        }
        status.textContent = ui._lightingPresetError || (ui._lightingPresetPending || view?.preparing ? 'Preparing lighting…'
            : id === 'custom' ? 'Custom settings' : id === 'previous' ? 'Previous lighting · 55° · live'
                : 'Calibrated lighting · 55° · matching bake when available');
    };
    section.append(choice.row, status, makeEl('div', 'options-note',
        'Both use the same 55° sun position, ACESFilmic and grading Off. Previous restores the original light and sky settings with live lighting. Calibrated uses the measured daylight and matching baked lighting. Bus materials and camera stay as they are. Save keeps your choice; Cancel restores your settings.'));
    ui._refreshDaylightPreset();
    return section;
}
