// src/graphics/gui/mesh_fabrication/ui/toolbarComposer.js

import { createToolbarGroup } from './toolbarGroup.js';
import { createOrbitModeButton } from './controls/orbitModeButton.js';
import { createSelectModeButton } from './controls/selectModeButton.js';
import { createAutoOrbitButton } from './controls/autoOrbitButton.js';
import { createDisplayModeControl } from './controls/displayModeControl.js';
import { createTessellationControl } from './controls/tessellationControl.js';
import { createViewsComboControl } from './controls/viewsComboControl.js';
import { createOverlaysComboControl } from './controls/overlaysComboControl.js';
import { createLiveToggleControl } from './controls/liveToggleControl.js';

export function composeMeshFabricationToolbar(view) {
    const topBar = document.createElement('div');
    topBar.className = 'mesh-fab-topbar';

    const userGroup = createToolbarGroup('User');
    const orbitButton = createOrbitModeButton(view);
    const selectButton = createSelectModeButton(view);
    const autoOrbitButton = createAutoOrbitButton(view);
    userGroup.buttons.appendChild(orbitButton);
    userGroup.buttons.appendChild(selectButton);
    userGroup.buttons.appendChild(autoOrbitButton);
    topBar.appendChild(userGroup.root);

    const displayGroup = createToolbarGroup('Display');
    displayGroup.buttons.appendChild(createDisplayModeControl(view));
    topBar.appendChild(displayGroup.root);

    const tessellationGroup = createToolbarGroup('Tessellation');
    tessellationGroup.buttons.appendChild(createTessellationControl(view));
    topBar.appendChild(tessellationGroup.root);

    const viewsGroup = createToolbarGroup('Views');
    viewsGroup.buttons.appendChild(createViewsComboControl(view));
    topBar.appendChild(viewsGroup.root);

    const overlayGroup = createToolbarGroup('Overlay');
    overlayGroup.buttons.appendChild(createOverlaysComboControl(view));
    topBar.appendChild(overlayGroup.root);

    const liveGroup = createToolbarGroup('Live');
    const liveControl = createLiveToggleControl(view);
    liveGroup.buttons.appendChild(liveControl.root);
    topBar.appendChild(liveGroup.root);

    return Object.freeze({
        topBar,
        orbitButton,
        selectButton,
        autoOrbitButton,
        liveControl
    });
}
