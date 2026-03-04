// src/graphics/gui/mesh_fabrication/ui/controls/selectModeButton.js

import { createIconToolbarButton } from './createIconToolbarButton.js';

export function createSelectModeButton(view) {
    return createIconToolbarButton({
        label: 'Select mode',
        icon: 'ads_click',
        caption: 'Select',
        onClick: () => view._setUserMode('select')
    });
}
