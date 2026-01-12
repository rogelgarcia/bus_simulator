// src/app/buildings/WindowStyle.js
export const WINDOW_STYLE = Object.freeze({
    DEFAULT: 'default',
    DARK: 'dark',
    BLUE: 'blue',
    LIGHT_BLUE: 'light_blue',
    GREEN: 'green',
    WARM: 'warm',
    GRID: 'grid'
});

export function isWindowStyle(value) {
    if (typeof value !== 'string') return false;
    return value === WINDOW_STYLE.DEFAULT
        || value === WINDOW_STYLE.DARK
        || value === WINDOW_STYLE.BLUE
        || value === WINDOW_STYLE.LIGHT_BLUE
        || value === WINDOW_STYLE.GREEN
        || value === WINDOW_STYLE.WARM
        || value === WINDOW_STYLE.GRID;
}
