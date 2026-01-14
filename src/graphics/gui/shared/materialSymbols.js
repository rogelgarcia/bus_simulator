// src/graphics/gui/shared/materialSymbols.js
// Utilities for rendering Material Symbols Outlined icons consistently.

const SIZE_CLASS = Object.freeze({
    sm: 'ui-icon-sm',
    md: 'ui-icon-md',
    lg: 'ui-icon-lg',
    small: 'ui-icon-sm',
    medium: 'ui-icon-md',
    large: 'ui-icon-lg'
});

function getSizeClass(size) {
    const key = typeof size === 'string' ? size : '';
    return SIZE_CLASS[key] || SIZE_CLASS.md;
}

export function createMaterialSymbolIcon(name, {
    size = 'md',
    active = false,
    filled = false,
    disabled = false,
    ariaHidden = true
} = {}) {
    const iconName = typeof name === 'string' ? name : '';

    const icon = document.createElement('span');
    icon.className = `ui-icon ${getSizeClass(size)}`;
    if (active || filled) icon.classList.add('is-active');
    if (disabled) icon.classList.add('is-disabled');
    icon.textContent = iconName;
    if (ariaHidden) icon.setAttribute('aria-hidden', 'true');
    return icon;
}

export function setIconOnlyButtonLabel(button, label) {
    const b = button && typeof button === 'object' ? button : null;
    if (!b) return;
    const text = typeof label === 'string' ? label : '';
    if (!text) return;
    b.title = text;
    b.setAttribute('aria-label', text);
}

export function applyMaterialSymbolToButton(button, { name, label, size = 'md', active = false, filled = false, disabled = false } = {}) {
    const b = button && typeof button === 'object' ? button : null;
    if (!b) return null;

    const icon = createMaterialSymbolIcon(name, { size, active, filled, disabled, ariaHidden: true });
    b.textContent = '';
    b.appendChild(icon);
    setIconOnlyButtonLabel(b, label);
    return icon;
}
