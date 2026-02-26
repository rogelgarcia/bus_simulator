// src/graphics/gui/wall_decoration_mesh_debugger/view/WallDecoratorCatalogLoader.js
// Bridges wall decorator catalog entries into renderable shape specs.
// @ts-check

import {
    buildWallDecoratorShapeSpecs,
    getWallDecoratorPresetEntries,
    getWallDecoratorPresetEntryById,
    getWallDecoratorPresetOptions,
    getWallDecoratorTypeEntries,
    getWallDecoratorTypeEntryById,
    getWallDecoratorTypeOptions,
    sanitizeWallDecoratorDebuggerState
} from '../../../../app/buildings/wall_decorators/index.js';

export class WallDecoratorCatalogLoader {
    listTypeOptions() {
        return getWallDecoratorTypeOptions();
    }

    listTypeEntries() {
        return getWallDecoratorTypeEntries();
    }

    getTypeById(id) {
        return getWallDecoratorTypeEntryById(id);
    }

    listPresetOptions() {
        return getWallDecoratorPresetOptions();
    }

    listPresetEntries() {
        return getWallDecoratorPresetEntries();
    }

    getPresetById(id) {
        return getWallDecoratorPresetEntryById(id);
    }

    // Back-compat aliases while callers migrate from "catalog" to "types/presets".
    listOptions() {
        return this.listTypeOptions();
    }

    listEntries() {
        return this.listTypeEntries();
    }

    getEntryById(id) {
        return this.getTypeById(id);
    }

    loadShapeSpecs({ state, wallSpec } = {}) {
        const safeState = sanitizeWallDecoratorDebuggerState(state);
        return buildWallDecoratorShapeSpecs(safeState, wallSpec);
    }
}
