// src/graphics/gui/mesh_fabrication/mesh_state/meshRuntimeStateStore.js

export function createMeshRuntimeStateStore(initialState = null) {
    let state = Object.freeze({
        sourceDocument: null,
        parsedDocument: null,
        displayContract: null,
        revision: '-',
        etag: '',
        lastModified: '',
        lastCheckMs: 0,
        syncLabel: 'Idle',
        hasError: false,
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
        },
        reset() {
            state = Object.freeze({
                sourceDocument: null,
                parsedDocument: null,
                displayContract: null,
                revision: '-',
                etag: '',
                lastModified: '',
                lastCheckMs: 0,
                syncLabel: 'Idle',
                hasError: false
            });
            return state;
        }
    });
}
