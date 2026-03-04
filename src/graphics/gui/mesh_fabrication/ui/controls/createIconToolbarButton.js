// src/graphics/gui/mesh_fabrication/ui/controls/createIconToolbarButton.js

import { createMaterialSymbolIcon, setIconOnlyButtonLabel } from '../../../shared/materialSymbols.js';

export function createIconToolbarButton({
    label,
    icon,
    caption,
    onClick
}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mesh-fab-toolbar-btn';
    button.appendChild(createMaterialSymbolIcon(icon, { size: 'lg' }));

    const cap = document.createElement('span');
    cap.className = 'mesh-fab-btn-caption';
    cap.textContent = caption;
    button.appendChild(cap);

    setIconOnlyButtonLabel(button, label);
    if (typeof onClick === 'function') {
        button.addEventListener('click', onClick);
    }
    return button;
}
