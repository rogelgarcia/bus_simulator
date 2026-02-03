// src/graphics/gui/shared/material_picker/MaterialPickerRowController.js
// Material picker row controller with optional status + disposal.

import { applyTooltip, appendMustHaveDot } from '../../building_fabrication/mini_controllers/UiMiniControlPrimitives.js';

export function createMaterialPickerRowController({
    label,
    text = '',
    status = false,
    statusText = '',
    disabled = false,
    tooltip = '',
    mustHave = false,
    rowExtraClassName = '',
    pickerExtraClassName = '',
    onPick = null
} = {}) {
    const row = document.createElement('div');
    row.className = `building-fab-row building-fab-row-texture${rowExtraClassName ? ` ${rowExtraClassName}` : ''}`;

    const labelEl = document.createElement('div');
    labelEl.className = 'building-fab-row-label';
    labelEl.textContent = typeof label === 'string' ? label : '';

    const picker = document.createElement('div');
    picker.className = `building-fab-texture-picker building-fab-material-picker${pickerExtraClassName ? ` ${pickerExtraClassName}` : ''}`;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'building-fab-material-button';

    const thumb = document.createElement('div');
    thumb.className = 'building-fab-material-thumb';

    const textEl = document.createElement('div');
    textEl.className = 'building-fab-material-text';
    textEl.textContent = typeof text === 'string' ? text : '';

    button.appendChild(thumb);
    button.appendChild(textEl);

    const statusEl = status ? document.createElement('div') : null;
    if (statusEl) {
        statusEl.className = 'building-fab-texture-status';
        statusEl.textContent = typeof statusText === 'string' ? statusText : '';
    }

    picker.appendChild(button);
    if (statusEl) picker.appendChild(statusEl);
    row.appendChild(labelEl);
    row.appendChild(picker);

    if (tooltip) {
        applyTooltip(labelEl, tooltip);
        applyTooltip(button, tooltip);
    }
    if (mustHave) appendMustHaveDot(labelEl);

    button.disabled = !!disabled;

    const onPickFn = typeof onPick === 'function' ? onPick : null;
    const handlePick = () => {
        if (button.disabled) return;
        onPickFn?.();
    };
    if (onPickFn) button.addEventListener('click', handlePick);

    const setText = (nextText) => {
        textEl.textContent = typeof nextText === 'string' ? nextText : String(nextText ?? '');
    };

    const setStatus = (nextText) => {
        if (!statusEl) return;
        statusEl.textContent = typeof nextText === 'string' ? nextText : String(nextText ?? '');
    };

    const setDisabled = (nextDisabled) => {
        button.disabled = !!nextDisabled;
    };

    const setEnabled = (nextEnabled) => {
        button.disabled = !nextEnabled;
    };

    const sync = ({
        enabled = null,
        disabled: syncDisabled = null,
        text: syncText = null,
        statusText: syncStatusText = null
    } = {}) => {
        if (typeof enabled === 'boolean') setEnabled(enabled);
        if (typeof syncDisabled === 'boolean') setDisabled(syncDisabled);
        if (syncText !== null) setText(syncText);
        if (syncStatusText !== null) setStatus(syncStatusText);
    };

    const destroy = () => {
        if (onPickFn) button.removeEventListener('click', handlePick);
    };

    return {
        row,
        label: labelEl,
        picker,
        button,
        thumb,
        text: textEl,
        status: statusEl,
        setText,
        setStatus,
        setEnabled,
        setDisabled,
        sync,
        destroy,
        dispose: destroy
    };
}

