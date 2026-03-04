// src/graphics/gui/mesh_fabrication/ui/controls/autoOrbitButton.js

import { createIconToolbarButton } from './createIconToolbarButton.js';

export function createAutoOrbitButton(view) {
    return createIconToolbarButton({
        label: 'Toggle orbit camera',
        icon: 'autorenew',
        caption: 'OrbitCam',
        onClick: view._onAutoOrbitToggle
    });
}
