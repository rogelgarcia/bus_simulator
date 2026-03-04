// src/graphics/gui/mesh_fabrication/ui/controls/liveToggleControl.js

import { createMaterialSymbolIcon } from '../../../shared/materialSymbols.js';

export function createLiveToggleControl(view) {
    const wrap = document.createElement('div');
    wrap.className = 'mesh-fab-live-status-wrap';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mesh-fab-live-status-btn';
    button.setAttribute('aria-label', 'Live mesh sync');
    button.setAttribute('aria-pressed', 'true');
    button.addEventListener('click', view._onLiveStatusToggle);

    const icon = createMaterialSymbolIcon('sync', { size: 'sm' });
    icon.classList.add('mesh-fab-live-status-icon');

    const mode = document.createElement('span');
    mode.className = 'mesh-fab-live-status-mode';
    mode.textContent = 'OFF';

    const dot = document.createElement('span');
    dot.className = 'mesh-fab-live-status-dot is-idle';
    dot.setAttribute('aria-hidden', 'true');

    button.appendChild(icon);
    button.appendChild(mode);
    button.appendChild(dot);

    const output = document.createElement('div');
    output.className = 'mesh-fab-live-status-output';
    output.textContent = 'Status: Idle';

    wrap.appendChild(button);
    wrap.appendChild(output);

    return Object.freeze({
        root: wrap,
        button,
        mode,
        dot,
        output
    });
}
