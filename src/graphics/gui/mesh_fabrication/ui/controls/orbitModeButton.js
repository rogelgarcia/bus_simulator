// src/graphics/gui/mesh_fabrication/ui/controls/orbitModeButton.js

import { createIconToolbarButton } from './createIconToolbarButton.js';

export function createOrbitModeButton(view) {
    return createIconToolbarButton({
        label: 'Orbit camera mode',
        icon: '3d_rotation',
        caption: 'Orbit',
        onClick: () => view._setUserMode('orbit')
    });
}
