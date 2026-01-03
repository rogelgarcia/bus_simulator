// src/graphics/gui/map_debugger/MapDebuggerShortcutsPanel.js
// Shows keyboard shortcuts for the map debugger screen.
export class MapDebuggerShortcutsPanel {
    constructor() {
        this.root = document.createElement('div');
        this.root.className = 'map-debugger-shortcuts-panel hidden';

        this.title = document.createElement('div');
        this.title.className = 'map-debugger-shortcuts-title';
        this.title.textContent = 'Shortcuts';

        this.list = document.createElement('div');
        this.list.className = 'map-debugger-shortcuts-list';

        const shortcuts = [
            { key: 'A', description: 'Zoom In' },
            { key: 'Z', description: 'Zoom Out' },
            { key: '↑', description: 'Move Up' },
            { key: '↓', description: 'Move Down' },
            { key: '←', description: 'Move Left' },
            { key: '→', description: 'Move Right' },
            { key: 'Esc', description: 'Exit to Menu' }
        ];

        shortcuts.forEach(({ key, description }) => {
            const item = document.createElement('div');
            item.className = 'map-debugger-shortcuts-item';

            const keyEl = document.createElement('div');
            keyEl.className = 'map-debugger-shortcuts-key';
            keyEl.textContent = key;

            const descEl = document.createElement('div');
            descEl.className = 'map-debugger-shortcuts-desc';
            descEl.textContent = description;

            item.appendChild(keyEl);
            item.appendChild(descEl);
            this.list.appendChild(item);
        });

        this.root.appendChild(this.title);
        this.root.appendChild(this.list);
    }

    attach(parent = document.body) {
        if (!this.root.isConnected) parent.appendChild(this.root);
    }

    show() {
        this.attach(document.body);
        this.root.classList.remove('hidden');
    }

    hide() {
        this.root.classList.add('hidden');
    }

    destroy() {
        if (this.root.isConnected) this.root.remove();
    }
}
