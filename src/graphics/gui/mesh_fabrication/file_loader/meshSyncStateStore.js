// src/graphics/gui/mesh_fabrication/file_loader/meshSyncStateStore.js

export function createMeshSyncStateStore(initial = null) {
    let state = Object.freeze({
        enabled: true,
        inFlight: false,
        etag: '',
        lastModified: '',
        lastCheckMs: 0,
        label: 'Idle',
        hasError: false,
        updatePulseUntilMs: 0,
        bootstrapTried: false,
        ...(initial && typeof initial === 'object' ? initial : {})
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
