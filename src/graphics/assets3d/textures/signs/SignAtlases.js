// src/graphics/assets3d/textures/signs/SignAtlases.js
// Defines sign atlas metadata and URLs.

export const SIGN_ATLAS_ID = Object.freeze({
    BASIC: 'basic',
    LANE: 'lane',
    WHITE_MESSAGES: 'white_messages'
});

const SIGN_ASSET_BASE_URL = new URL('../../../../../assets/signs/', import.meta.url);

const SIGN_ATLASES = Object.freeze([
    {
        id: SIGN_ATLAS_ID.BASIC,
        label: 'Basic',
        filename: 'sign_basic.jpg',
        width: 1575,
        height: 945
    },
    {
        id: SIGN_ATLAS_ID.LANE,
        label: 'Lane',
        filename: 'sign_lane.jpg',
        width: 1258,
        height: 1033
    },
    {
        id: SIGN_ATLAS_ID.WHITE_MESSAGES,
        label: 'White Messages',
        filename: 'sign_white_messages.jpg',
        width: 1340,
        height: 1592
    }
]);

export function getSignAtlases() {
    return Array.from(SIGN_ATLASES);
}

export function getSignAtlasById(atlasId) {
    const id = typeof atlasId === 'string' ? atlasId : '';
    const atlas = SIGN_ATLASES.find((entry) => entry.id === id) ?? null;
    if (!atlas) throw new Error(`[SignAtlases] Unknown atlas id: ${atlasId}`);
    return atlas;
}

export function resolveSignAtlasUrl(atlasId) {
    const atlas = getSignAtlasById(atlasId);
    return new URL(atlas.filename, SIGN_ASSET_BASE_URL).toString();
}
