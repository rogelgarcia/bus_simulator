// src/graphics/gui/mesh_fabrication/ui/toolbarGroup.js

export function createToolbarGroup(titleText) {
    const root = document.createElement('section');
    root.className = 'mesh-fab-topbar-group';
    const title = document.createElement('h3');
    title.className = 'mesh-fab-topbar-title';
    title.textContent = titleText;
    const buttons = document.createElement('div');
    buttons.className = 'mesh-fab-topbar-buttons';
    root.appendChild(title);
    root.appendChild(buttons);
    return { root, buttons };
}
