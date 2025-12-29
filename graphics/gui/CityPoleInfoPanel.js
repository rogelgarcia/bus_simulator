// graphics/gui/CityPoleInfoPanel.js
export class CityPoleInfoPanel {
    constructor() {
        this.root = document.createElement('div');
        this.root.className = 'city-pole-info-panel hidden';

        this.title = document.createElement('div');
        this.title.className = 'city-pole-info-title';
        this.title.textContent = 'Object Data';

        this.rows = document.createElement('div');
        this.rows.className = 'city-pole-info-rows';

        this.typeRow = this._buildRow('Type');
        this.dynamicRows = [];

        this.rows.appendChild(this.typeRow.row);

        this.root.appendChild(this.title);
        this.root.appendChild(this.rows);

        this.setData(null);
    }

    setData(data) {
        const type = typeof data?.type === 'string' ? data.type : '--';
        this.typeRow.value.textContent = type;
        const fields = Array.isArray(data?.fields) ? data.fields : [];
        for (let i = 0; i < fields.length; i++) {
            const field = fields[i];
            let row = this.dynamicRows[i];
            if (!row) {
                row = this._buildRow('');
                this.dynamicRows.push(row);
                this.rows.appendChild(row.row);
            }
            const label = typeof field?.label === 'string' ? field.label : '';
            const value = typeof field?.value === 'string' ? field.value : '--';
            row.label.textContent = label;
            row.value.textContent = value;
            row.row.classList.toggle('hidden', label.length === 0);
        }
        for (let i = fields.length; i < this.dynamicRows.length; i++) {
            this.dynamicRows[i].row.classList.add('hidden');
        }
    }

    _buildRow(labelText) {
        const row = document.createElement('div');
        row.className = 'city-pole-info-row';
        const label = document.createElement('span');
        label.className = 'city-pole-info-label';
        label.textContent = labelText;
        const value = document.createElement('span');
        value.className = 'city-pole-info-value';
        row.appendChild(label);
        row.appendChild(value);
        return { row, label, value };
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
