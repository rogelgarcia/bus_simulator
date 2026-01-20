// src/graphics/gui/building_fabrication/mini_controllers/ToggleRowController.js
// Toggle-row mini controller with tooltip/meta and disposal.
import { applyTooltip, appendMustHaveDot, createToggleRow } from './UiMiniControlPrimitives.js';

export function createToggleRowController({
    label,
    checked = false,
    disabled = false,
    tooltip = '',
    mustHave = false,
    onChange = null,
    extraClassName = ''
} = {}) {
    const row = createToggleRow(label, { wide: true, extraClassName });
    row.input.checked = !!checked;
    row.input.disabled = !!disabled;

    if (tooltip) {
        applyTooltip(row.text, tooltip);
        applyTooltip(row.toggle, tooltip);
    }
    if (mustHave) appendMustHaveDot(row.text);

    const onChangeFn = typeof onChange === 'function' ? onChange : null;
    const handleChange = () => {
        onChangeFn?.(!!row.input.checked);
    };
    row.input.addEventListener('change', handleChange);

    const setChecked = (nextChecked) => {
        row.input.checked = !!nextChecked;
    };

    const setDisabled = (nextDisabled) => {
        row.input.disabled = !!nextDisabled;
    };

    const setEnabled = (nextEnabled) => {
        setDisabled(!nextEnabled);
    };

    const sync = ({ checked: nextChecked = null, enabled = null, disabled: syncDisabled = null } = {}) => {
        if (nextChecked !== null) setChecked(nextChecked);
        if (typeof enabled === 'boolean') setEnabled(enabled);
        if (typeof syncDisabled === 'boolean') setDisabled(syncDisabled);
    };

    const destroy = () => {
        row.input.removeEventListener('change', handleChange);
    };

    return {
        row: row.toggle,
        root: row.toggle,
        toggle: row.toggle,
        input: row.input,
        text: row.text,
        setChecked,
        setEnabled,
        setDisabled,
        sync,
        destroy,
        dispose: destroy
    };
}
