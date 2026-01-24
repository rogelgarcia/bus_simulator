// src/graphics/gui/building_fabrication/mini_controllers/SelectRowController.js
// Select-row mini controller with tooltip/meta and disposal.
import { applyTooltip, appendMustHaveDot, createSelectRow } from './UiMiniControlPrimitives.js';

export function createSelectRowController({
    label,
    options = [],
    value = '',
    disabled = false,
    tooltip = '',
    mustHave = false,
    onChange = null
} = {}) {
    const row = createSelectRow(label);

    const list = Array.isArray(options) ? options : [];
    row.select.textContent = '';
    for (const opt of list) {
        if (!opt || typeof opt !== 'object') continue;
        const option = document.createElement('option');
        option.value = String(opt.value ?? opt.id ?? '');
        option.textContent = String(opt.label ?? opt.text ?? option.value);
        row.select.appendChild(option);
    }

    row.select.value = String(value ?? '');
    row.select.disabled = !!disabled;

    if (tooltip) {
        applyTooltip(row.label, tooltip);
        applyTooltip(row.select, tooltip);
    }
    if (mustHave) appendMustHaveDot(row.label);

    const onChangeFn = typeof onChange === 'function' ? onChange : null;
    const handleChange = () => {
        onChangeFn?.(row.select.value);
    };
    row.select.addEventListener('change', handleChange);

    const setValue = (nextValue) => {
        row.select.value = String(nextValue ?? '');
    };

    const setDisabled = (nextDisabled) => {
        row.select.disabled = !!nextDisabled;
    };

    const setEnabled = (nextEnabled) => {
        setDisabled(!nextEnabled);
    };

    const sync = ({ value: nextValue = null, enabled = null, disabled: syncDisabled = null } = {}) => {
        if (nextValue !== null) setValue(nextValue);
        if (typeof enabled === 'boolean') setEnabled(enabled);
        if (typeof syncDisabled === 'boolean') setDisabled(syncDisabled);
    };

    const destroy = () => {
        row.select.removeEventListener('change', handleChange);
    };

    return {
        row: row.row,
        root: row.row,
        label: row.label,
        select: row.select,
        setValue,
        setEnabled,
        setDisabled,
        sync,
        destroy,
        dispose: destroy
    };
}

