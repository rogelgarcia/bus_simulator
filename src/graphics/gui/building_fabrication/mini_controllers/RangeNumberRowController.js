// src/graphics/gui/building_fabrication/mini_controllers/RangeNumberRowController.js
// Range+number mini controller with clamping, formatting, and disposal.
import { clampNumber, formatFixed } from './RangeNumberUtils.js';
import { applyTooltip, appendMustHaveDot, createRangeRow } from './UiMiniControlPrimitives.js';

export function createRangeNumberRowController({
    label,
    min,
    max,
    step,
    value,
    disabled = false,
    tooltip = '',
    mustHave = false,
    clamp = null,
    formatNumber = null,
    formatRange = null,
    onChange = null
} = {}) {
    const row = createRangeRow(label);
    row.range.min = String(min);
    row.range.max = String(max);
    row.range.step = String(step);
    row.number.min = String(min);
    row.number.max = String(max);
    row.number.step = String(step);

    const clampFn = typeof clamp === 'function' ? clamp : (v) => clampNumber(v, min, max);
    const formatNumberFn = typeof formatNumber === 'function'
        ? formatNumber
        : (v) => formatFixed(v, step < 1 ? 2 : 0);
    const formatRangeFn = typeof formatRange === 'function' ? formatRange : (v) => String(v);
    const onChangeFn = typeof onChange === 'function' ? onChange : null;

    const setValue = (nextValue) => {
        const safe = clampFn(nextValue);
        row.range.value = formatRangeFn(safe);
        row.number.value = formatNumberFn(safe);
    };

    if (tooltip) {
        applyTooltip(row.label, tooltip);
        applyTooltip(row.range, tooltip);
        applyTooltip(row.number, tooltip);
    }
    if (mustHave) appendMustHaveDot(row.label);

    setValue(value);
    row.range.disabled = !!disabled;
    row.number.disabled = !!disabled;

    const handleRangeInput = () => {
        const safe = clampFn(row.range.value);
        row.range.value = formatRangeFn(safe);
        row.number.value = formatNumberFn(safe);
        onChangeFn?.(safe, { source: 'range' });
    };
    const handleNumberChange = () => {
        const safe = clampFn(row.number.value);
        row.range.value = formatRangeFn(safe);
        row.number.value = formatNumberFn(safe);
        onChangeFn?.(safe, { source: 'number' });
    };

    row.range.addEventListener('input', handleRangeInput);
    row.number.addEventListener('change', handleNumberChange);

    const setDisabled = (nextDisabled) => {
        const off = !!nextDisabled;
        row.range.disabled = off;
        row.number.disabled = off;
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
        row.range.removeEventListener('input', handleRangeInput);
        row.number.removeEventListener('change', handleNumberChange);
    };

    return {
        row: row.row,
        root: row.row,
        label: row.label,
        range: row.range,
        number: row.number,
        setValue,
        setEnabled,
        setDisabled,
        sync,
        destroy,
        dispose: destroy
    };
}
