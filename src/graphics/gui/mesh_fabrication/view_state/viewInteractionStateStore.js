// src/graphics/gui/mesh_fabrication/view_state/viewInteractionStateStore.js

export function createViewInteractionStateStore(initialState = null) {
    let state = Object.freeze({
        layoutPresetId: 'layout_1',
        displayMode: 'shaded',
        userMode: 'orbit',
        hoverTileId: '',
        overlayOptionsOpen: false,
        layoutComboOpen: false,
        displayModeComboOpen: false,
        tessellationControlsOpen: false,
        ...(initialState && typeof initialState === 'object' ? initialState : {})
    });

    return Object.freeze({
        getSnapshot() {
            return state;
        },
        set(partial) {
            if (!partial || typeof partial !== 'object') return state;
            state = Object.freeze({ ...state, ...partial });
            return state;
        }
    });
}
