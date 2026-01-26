// src/states/DebugToolRegistry.js
// Registry for isolated debug tool screens (standalone HTML pages).

export const DEBUG_TOOL_REGISTRY = Object.freeze([
    Object.freeze({
        id: 'atmosphere_debug',
        key: '1',
        label: 'Atmosphere',
        description: 'HDR background + IBL look-dev scene',
        href: 'debug_tools/atmosphere_debug.html'
    })
]);

export function getDebugToolShortcuts() {
    return DEBUG_TOOL_REGISTRY;
}

