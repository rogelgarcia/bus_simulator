// src/graphics/gui/terrain_debugger/view/ui/TerrainDebuggerUiControlBuilders.js
// Shared control builders for Terrain Debugger tab UIs.
// @ts-check

function clamp(value, min, max, fallback) {
    const num = Number(value);
    const fb = fallback === undefined ? min : fallback;
    if (!Number.isFinite(num)) return fb;
    return Math.max(min, Math.min(max, num));
}

function makeEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
}

function applyTooltip(node, text) {
    const el = node && typeof node === 'object' ? node : null;
    const t = typeof text === 'string' ? text.trim() : '';
    if (!el || !t) return;
    el.title = t;
}

function normalizeHexColor(value) {
    const raw = String(value ?? '').trim();
    const m = raw.match(/^#?([0-9a-fA-F]{6})$/);
    if (!m) return null;
    return `#${m[1].toUpperCase()}`;
}

export function makeToggleRow({ label, value = false, tooltip = '', onChange }) {
    const row = makeEl('div', 'options-row');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control');

    const wrap = makeEl('label', 'options-toggle-switch');
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = !!value;
    toggle.className = 'options-toggle';
    toggle.addEventListener('change', () => onChange?.(!!toggle.checked));
    wrap.appendChild(toggle);
    wrap.appendChild(makeEl('span', 'options-toggle-ui'));

    right.appendChild(wrap);
    row.appendChild(left);
    row.appendChild(right);
    applyTooltip(left, tooltip);
    applyTooltip(toggle, tooltip);
    return { row, toggle };
}

export function makeSelectRow({ label, value = '', options = [], tooltip = '', onChange }) {
    const row = makeEl('div', 'options-row');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control');

    const select = document.createElement('select');
    select.className = 'options-select';
    for (const opt of Array.isArray(options) ? options : []) {
        const id = String(opt?.id ?? '');
        const text = String(opt?.label ?? id);
        if (!id) continue;
        const optionEl = document.createElement('option');
        optionEl.value = id;
        optionEl.textContent = text;
        select.appendChild(optionEl);
    }
    select.value = String(value ?? '');
    select.addEventListener('change', () => onChange?.(String(select.value)));

    right.appendChild(select);
    row.appendChild(left);
    row.appendChild(right);
    applyTooltip(left, tooltip);
    applyTooltip(select, tooltip);
    return { row, select, labelEl: left };
}

export function makeChoiceRow({ label, value = '', options = [], tooltip = '', segmented = false, onChange }) {
    const row = makeEl('div', 'options-row options-row-wide');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control options-row-control-wide');

    const groupClass = segmented
        ? 'options-choice-group options-choice-group-segmented'
        : 'options-choice-group';
    const group = makeEl('div', groupClass);
    const buttons = new Map();
    let current = String(value ?? '');

    const setActive = (id) => {
        const next = String(id ?? '');
        if (!buttons.has(next)) return;
        current = next;
        for (const [key, btn] of buttons.entries()) btn.classList.toggle('is-active', key === next);
    };

    const seenIds = new Set();
    for (const opt of Array.isArray(options) ? options : []) {
        const id = String(opt?.id ?? '').trim();
        const text = String(opt?.label ?? id).trim() || id;
        if (!id || !text || seenIds.has(id)) continue;
        seenIds.add(id);
        const btnClass = segmented
            ? 'options-choice-btn options-choice-btn-segmented'
            : 'options-choice-btn';
        const btn = makeEl('button', btnClass, text);
        btn.type = 'button';
        applyTooltip(btn, tooltip);
        btn.addEventListener('click', () => {
            setActive(id);
            onChange?.(id);
        });
        group.appendChild(btn);
        buttons.set(id, btn);
    }

    if (!buttons.has(current)) current = buttons.keys().next().value ?? '';
    setActive(current);

    right.appendChild(group);
    row.appendChild(left);
    row.appendChild(right);
    applyTooltip(left, tooltip);
    applyTooltip(group, tooltip);
    return {
        row,
        group,
        getValue: () => current,
        setValue: (id) => setActive(id),
        setDisabled: (disabled) => {
            const off = !!disabled;
            for (const btn of buttons.values()) btn.disabled = off;
        }
    };
}

export function makeNumberSliderRow({ label, value = 0, min = 0, max = 1, step = 0.01, digits = 2, tooltip = '', onChange }) {
    const row = makeEl('div', 'options-row options-row-wide');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control options-row-control-wide');

    const range = document.createElement('input');
    range.type = 'range';
    range.min = String(min);
    range.max = String(max);
    range.step = String(step);
    range.value = String(clamp(value, min, max, value));
    range.className = 'options-range';

    const number = document.createElement('input');
    number.type = 'number';
    number.min = String(min);
    number.max = String(max);
    number.step = String(step);
    number.value = String(clamp(value, min, max, value).toFixed(digits));
    number.className = 'options-number';

    const emit = (raw) => {
        const next = clamp(raw, min, max, min);
        range.value = String(next);
        number.value = String(next.toFixed(digits));
        onChange?.(next);
    };

    range.addEventListener('input', () => emit(Number(range.value)));
    number.addEventListener('input', () => emit(Number(number.value)));

    right.appendChild(range);
    right.appendChild(number);
    row.appendChild(left);
    row.appendChild(right);
    applyTooltip(left, tooltip);
    applyTooltip(range, tooltip);
    applyTooltip(number, tooltip);
    return { row, range, number };
}

export function makeTextRow({ label, value = '', placeholder = '', tooltip = '', onChange }) {
    const row = makeEl('div', 'options-row options-row-wide');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control options-row-control-wide');

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'options-number';
    input.value = String(value ?? '');
    if (placeholder) input.placeholder = String(placeholder);

    input.addEventListener('change', () => onChange?.(String(input.value)));
    input.addEventListener('blur', () => onChange?.(String(input.value)));

    right.appendChild(input);
    row.appendChild(left);
    row.appendChild(right);
    applyTooltip(left, tooltip);
    applyTooltip(input, tooltip);
    return { row, input };
}

export function makeColorRow({ label, value = '#FFFFFF', tooltip = '', onChange }) {
    const row = makeEl('div', 'options-row options-row-wide');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control options-row-control-wide');

    const color = document.createElement('input');
    color.type = 'color';
    color.className = 'options-color';

    const text = document.createElement('input');
    text.type = 'text';
    text.className = 'options-number';

    const initial = normalizeHexColor(value) ?? '#FFFFFF';
    color.value = initial;
    text.value = initial;

    const emit = (raw) => {
        const normalized = normalizeHexColor(raw);
        if (!normalized) return;
        color.value = normalized;
        text.value = normalized;
        onChange?.(normalized);
    };

    color.addEventListener('input', () => emit(color.value));
    text.addEventListener('change', () => emit(text.value));
    text.addEventListener('blur', () => emit(text.value));

    right.appendChild(color);
    right.appendChild(text);
    row.appendChild(left);
    row.appendChild(right);
    applyTooltip(left, tooltip);
    applyTooltip(color, tooltip);
    applyTooltip(text, tooltip);
    return { row, color, text };
}

export function makeButtonRow({ label, text = 'Action', tooltip = '', onClick }) {
    const row = makeEl('div', 'options-row');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control');
    const btn = makeEl('button', 'options-btn', text);
    btn.type = 'button';
    btn.addEventListener('click', () => onClick?.());
    right.appendChild(btn);
    row.appendChild(left);
    row.appendChild(right);
    applyTooltip(left, tooltip);
    applyTooltip(btn, tooltip);
    return { row, btn };
}
