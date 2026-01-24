// src/graphics/gui/building_fabrication/mini_controllers/UiMiniControlPrimitives.js
// DOM primitives shared by building fabrication mini controllers.

export function applyTooltip(node, text) {
    const el = node && typeof node === 'object' ? node : null;
    const t = typeof text === 'string' ? text : '';
    if (!el || !t) return;
    el.title = t;
}

export function appendMustHaveDot(target) {
    const el = target && typeof target === 'object' ? target : null;
    if (!el) return;
    const dot = document.createElement('span');
    dot.className = 'building-fab-must-have-dot';
    dot.setAttribute('aria-hidden', 'true');
    dot.textContent = '•';
    el.appendChild(dot);
    const sr = document.createElement('span');
    sr.className = 'building-fab-sr-only';
    sr.textContent = ' (must-have)';
    el.appendChild(sr);
}

export function createRangeRow(labelText) {
    const row = document.createElement('div');
    row.className = 'building-fab-row';
    const label = document.createElement('div');
    label.className = 'building-fab-row-label';
    label.textContent = labelText;
    const range = document.createElement('input');
    range.type = 'range';
    range.className = 'building-fab-range';
    const number = document.createElement('input');
    number.type = 'number';
    number.className = 'building-fab-number';
    row.appendChild(label);
    row.appendChild(range);
    row.appendChild(number);
    return { row, label, range, number };
}

export function createSelectRow(labelText) {
    const row = document.createElement('div');
    row.className = 'building-fab-row building-fab-row-wide';
    const label = document.createElement('div');
    label.className = 'building-fab-row-label';
    label.textContent = labelText;
    const select = document.createElement('select');
    select.className = 'building-fab-select';
    row.appendChild(label);
    row.appendChild(select);
    return { row, label, select };
}

export function createToggleRow(labelText, { wide = true, extraClassName = '' } = {}) {
    const toggle = document.createElement('label');
    toggle.className = `building-fab-toggle${wide ? ' building-fab-toggle-wide' : ''}${extraClassName ? ` ${extraClassName}` : ''}`;
    const input = document.createElement('input');
    input.type = 'checkbox';
    const text = document.createElement('span');
    text.textContent = labelText;
    toggle.appendChild(input);
    toggle.appendChild(text);
    return { toggle, input, text };
}

export function bindDetailsState(details, key, detailsOpenByKey, { open = true } = {}) {
    if (!details || typeof key !== 'string' || !key) return;
    const map = detailsOpenByKey instanceof Map ? detailsOpenByKey : null;
    if (!map) return;
    details.dataset.detailsKey = key;
    const stored = map.get(key);
    details.open = typeof stored === 'boolean' ? stored : !!open;
    map.set(key, details.open);
    details.addEventListener('toggle', () => {
        map.set(key, details.open);
    });
}

export function createDetailsSection(title, { open = true, nested = false, key = null, detailsOpenByKey = null } = {}) {
    const details = document.createElement('details');
    details.className = nested ? 'building-fab-details building-fab-layer-subdetails' : 'building-fab-details';
    const summary = document.createElement('summary');
    summary.className = 'building-fab-details-summary';
    const label = document.createElement('span');
    label.className = 'building-fab-details-title';
    label.textContent = title;
    summary.appendChild(label);
    details.appendChild(summary);
    const body = document.createElement('div');
    body.className = 'building-fab-details-body';
    details.appendChild(body);
    bindDetailsState(details, key, detailsOpenByKey, { open });
    return { details, summary, body, label };
}

export function createSectionLabel(text) {
    const label = document.createElement('div');
    label.className = 'ui-section-label';
    label.textContent = text;
    return label;
}

export function createHint(text) {
    const hint = document.createElement('div');
    hint.className = 'building-fab-hint';
    hint.textContent = text;
    return hint;
}
