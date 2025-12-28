// graphics/gui/CityDebugPanel.js
export class CityDebugPanel {
    constructor({ roads = [], onReload = null } = {}) {
        this.root = document.createElement('div');
        this.root.className = 'city-debug-panel hidden';

        this.title = document.createElement('div');
        this.title.className = 'city-debug-title';
        this.title.textContent = 'City Roads';

        this.header = document.createElement('div');
        this.header.className = 'city-debug-header';
        this.header.textContent = 'index; lanesF; lanesB; type';

        this.list = document.createElement('div');
        this.list.className = 'city-debug-list';

        this.actions = document.createElement('div');
        this.actions.className = 'city-debug-actions';

        this.reloadBtn = document.createElement('button');
        this.reloadBtn.className = 'city-debug-btn';
        this.reloadBtn.type = 'button';
        this.reloadBtn.textContent = 'Reload';

        this.actions.appendChild(this.reloadBtn);
        this.root.appendChild(this.title);
        this.root.appendChild(this.header);
        this.root.appendChild(this.list);
        this.root.appendChild(this.actions);

        this._items = [];
        this._onReload = onReload;
        this._handleReload = () => {
            if (this._onReload) this._onReload();
        };
        this.reloadBtn.addEventListener('click', this._handleReload);

        this.setRoads(roads);
    }

    setRoads(roads = []) {
        this._items = [];
        this.list.textContent = '';

        roads.forEach((road, index) => {
            const row = document.createElement('label');
            row.className = 'city-debug-row';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = true;

            const meta = document.createElement('span');
            meta.className = 'city-debug-meta';
            meta.textContent = `${index}; ${road.lanesF ?? 0}; ${road.lanesB ?? 0}; ${road.tag ?? 'road'}`;

            row.appendChild(checkbox);
            row.appendChild(meta);
            this.list.appendChild(row);

            this._items.push({ road, checkbox });
        });
    }

    getSelectedRoads() {
        return this._items.filter((item) => item.checkbox.checked).map((item) => item.road);
    }

    setOnReload(fn) {
        this._onReload = fn;
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
        this.reloadBtn.removeEventListener('click', this._handleReload);
        if (this.root.isConnected) this.root.remove();
    }
}
