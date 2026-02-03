// src/graphics/gui/shared/material_picker/MaterialPickerPopupController.js
// Standard material picker popup controller (sections-driven).

import { PickerPopup } from '../PickerPopup.js';

export const MATERIAL_PICKER_EMPTY_OPTION_ID = '__material_picker_empty__';

function normalizeSections(sections) {
    const list = Array.isArray(sections) ? sections : [];
    const out = [];
    for (const section of list) {
        if (!section || typeof section !== 'object') continue;
        const label = typeof section.label === 'string' ? section.label : '';
        const rawOptions = Array.isArray(section.options) ? section.options : [];
        const allowEmpty = !!section.allowEmpty;
        const options = allowEmpty
            ? [
                {
                    id: MATERIAL_PICKER_EMPTY_OPTION_ID,
                    label: 'None',
                    kind: 'texture',
                    previewUrl: null,
                    hex: null
                },
                ...rawOptions
            ]
            : rawOptions;
        out.push({ label, options });
    }
    return out;
}

export class MaterialPickerPopupController {
    constructor() {
        this._popup = new PickerPopup();
    }

    isOpen() {
        return this._popup.isOpen();
    }

    open({ title = 'Select', sections = [], selectedId = null, onSelect = null } = {}) {
        this._popup.open({
            title,
            sections: normalizeSections(sections),
            selectedId,
            onSelect
        });
    }

    close() {
        this._popup.close();
    }

    dispose() {
        this._popup.dispose();
    }
}

