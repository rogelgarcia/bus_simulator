// graphics/gui/CityDebugPanel.js
export class CityDebugPanel {
    constructor({ roads = [], onReload = null, onHover = null } = {}) {
        this.root = document.createElement('div');
        this.root.className = 'city-debug-panel hidden';

        this.title = document.createElement('div');
        this.title.className = 'city-debug-title';
        this.title.textContent = 'City Roads';

        this.tableWrap = document.createElement('div');
        this.tableWrap.className = 'city-debug-list';

        this.table = document.createElement('table');
        this.table.className = 'city-debug-table';

        this.thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        const headers = ['on', 'index', 'lanesF', 'lanesB', 'type', 'xStart:yStart', 'xEnd:yEnd'];
        headers.forEach((label) => {
            const th = document.createElement('th');
            th.textContent = label;
            headerRow.appendChild(th);
        });
        this.thead.appendChild(headerRow);

        this.tbody = document.createElement('tbody');

        this.table.appendChild(this.thead);
        this.table.appendChild(this.tbody);
        this.tableWrap.appendChild(this.table);

        this.root.appendChild(this.title);
        this.root.appendChild(this.tableWrap);

        this._items = [];
        this._onReload = onReload;
        this._onHover = onHover;
        this._hoverRow = null;

        this.setRoads(roads);
    }

    setRoads(roads = []) {
        this._items = [];
        this.tbody.textContent = '';

        roads.forEach((road, index) => {
            const row = document.createElement('tr');

            const checkboxCell = document.createElement('td');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = true;
            checkboxCell.appendChild(checkbox);

            const startX = road?.a?.[0] ?? 0;
            const startY = road?.a?.[1] ?? 0;
            const endX = road?.b?.[0] ?? 0;
            const endY = road?.b?.[1] ?? 0;

            const cells = [
                checkboxCell,
                String(index),
                String(road.lanesF ?? 0),
                String(road.lanesB ?? 0),
                String(road.tag ?? 'road'),
                `${startX}:${startY}`,
                `${endX}:${endY}`
            ];

            cells.forEach((cell) => {
                if (cell instanceof HTMLElement) {
                    row.appendChild(cell);
                    return;
                }
                const td = document.createElement('td');
                td.textContent = cell;
                row.appendChild(td);
            });

            this.tbody.appendChild(row);

            row.addEventListener('click', (e) => {
                if (e.target instanceof HTMLElement && e.target.closest('input[type="checkbox"]')) return;
                checkbox.checked = !checkbox.checked;
                if (this._onReload) this._onReload();
            });
            checkbox.addEventListener('change', () => {
                if (this._onReload) this._onReload();
            });
            row.addEventListener('mouseenter', () => {
                if (this._hoverRow && this._hoverRow !== row) {
                    this._hoverRow.classList.remove('city-debug-row-hover');
                }
                this._hoverRow = row;
                row.classList.add('city-debug-row-hover');
                if (this._onHover) this._onHover(road, index);
            });
            row.addEventListener('mouseleave', () => {
                row.classList.remove('city-debug-row-hover');
                if (this._hoverRow === row) this._hoverRow = null;
                if (this._onHover) this._onHover(null, index);
            });

            this._items.push({ road, checkbox, row });
        });
    }

    getSelectedRoads() {
        return this._items.filter((item) => item.checkbox.checked).map((item) => item.road);
    }

    setOnReload(fn) {
        this._onReload = fn;
    }

    setOnHover(fn) {
        this._onHover = fn;
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
