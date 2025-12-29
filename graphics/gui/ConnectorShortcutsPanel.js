// graphics/gui/ConnectorShortcutsPanel.js
export class ConnectorShortcutsPanel {
    constructor() {
        this.root = document.createElement('div');
        this.root.className = 'city-shortcuts-panel connector-shortcuts-panel hidden';

        this.title = document.createElement('div');
        this.title.className = 'city-shortcuts-title';
        this.title.textContent = 'Shortcuts';

        this.list = document.createElement('div');
        this.list.className = 'city-shortcuts-list';

        const shortcuts = [
            { key: 'T', description: 'Orbital tour' },
            { key: 'A', description: 'Zoom in' },
            { key: 'Z', description: 'Zoom out' },
            { key: 'Up', description: 'Move up' },
            { key: 'Down', description: 'Move down' },
            { key: 'Left', description: 'Move left' },
            { key: 'Right', description: 'Move right' },
            { key: 'Q/W', description: 'Rotate curb' },
            { key: 'Esc', description: 'Exit to menu' }
        ];

        shortcuts.forEach(({ key, description }) => {
            const item = document.createElement('div');
            item.className = 'city-shortcuts-item';

            const keyEl = document.createElement('div');
            keyEl.className = 'city-shortcuts-key';
            keyEl.textContent = key;

            const descEl = document.createElement('div');
            descEl.className = 'city-shortcuts-desc';
            descEl.textContent = description;

            item.appendChild(keyEl);
            item.appendChild(descEl);
            this.list.appendChild(item);
        });

        this.root.appendChild(this.title);
        this.root.appendChild(this.list);
    }

    setTourActive(active) {
        this.root.classList.toggle('is-tour', !!active);
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
