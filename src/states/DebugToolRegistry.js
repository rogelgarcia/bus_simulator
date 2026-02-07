// src/states/DebugToolRegistry.js
// Registry for isolated debug tool screens (standalone HTML pages).

export const DEBUG_TOOL_REGISTRY = Object.freeze([
    Object.freeze({
        id: 'atmosphere_debug',
        key: '1',
        label: 'Atmosphere',
        description: 'HDR background + IBL look-dev scene',
        href: 'debug_tools/atmosphere_debug.html'
    }),
    Object.freeze({
        id: 'asphalt_debug',
        key: '2',
        label: 'Asphalt',
        description: 'Road asphalt + noise + markings (gameplay engine)',
        href: 'debug_tools/asphalt_debug.html'
    }),
    Object.freeze({
        id: 'sun_bloom_debug',
        key: '3',
        label: 'Sun Bloom',
        description: 'Sun-only bloom / glare look-dev scene',
        href: 'debug_tools/sun_bloom_debug.html'
    }),
    Object.freeze({
        id: 'markings_aa_debug',
        key: '4',
        label: 'Markings AA',
        description: 'Lane markings AA + occlusion debugger',
        href: 'debug_tools/markings_aa_debug.html'
    }),
    Object.freeze({
        id: 'window_mesh_debug',
        key: '5',
        label: 'Window Mesh',
        description: 'Procedural window mesh (frame/glass/shade/interior)',
        href: 'debug_tools/window_mesh_debug.html'
    }),
    Object.freeze({
        id: 'terrain_debug',
        key: '6',
        label: 'Terrain',
        description: 'Terrain + IBL + ground material look-dev',
        href: 'debug_tools/terrain_debug.html'
    }),
    Object.freeze({
        id: 'grass_lod_debug',
        key: '7',
        label: 'Grass',
        description: 'Grass LOD experiments + blade inspector',
        href: 'debug_tools/grass_lod_debug.html'
    }),
    Object.freeze({
        id: 'ao_foliage_debug',
        key: '8',
        label: 'AO Foliage',
        description: 'AO alpha foliage repro scene (SSAO/GTAO)',
        href: 'debug_tools/ao_foliage_debug.html'
    })
]);

export function getDebugToolShortcuts() {
    return DEBUG_TOOL_REGISTRY;
}
