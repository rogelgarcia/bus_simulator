// graphics/gui/CityDebugsPanel.js
export class CityDebugsPanel {
    constructor({
        connectorDebugEnabled = true,
        hoverOutlineEnabled = true,
        collisionDebugEnabled = true,
        onConnectorDebugToggle = null,
        onHoverOutlineToggle = null,
        onCollisionDebugToggle = null
    } = {}) {
        this.root = document.createElement('div');
        this.root.className = 'city-debugs-panel hidden';

        this.title = document.createElement('div');
        this.title.className = 'city-debugs-title';
        this.title.textContent = 'DEBUGs';

        this.controls = document.createElement('div');
        this.controls.className = 'city-debugs-controls';
        this.connectorToggle = document.createElement('label');
        this.connectorToggle.className = 'connector-debug-toggle-switch city-debugs-toggle-switch';
        this.connectorToggleInput = document.createElement('input');
        this.connectorToggleInput.type = 'checkbox';
        this.connectorToggleInput.checked = !!connectorDebugEnabled;
        this.connectorToggleLabel = document.createElement('span');
        this.connectorToggleLabel.textContent = 'Curb debug';
        this.connectorToggle.appendChild(this.connectorToggleInput);
        this.connectorToggle.appendChild(this.connectorToggleLabel);
        this.controls.appendChild(this.connectorToggle);

        this.outlineToggle = document.createElement('label');
        this.outlineToggle.className = 'connector-debug-toggle-switch city-debugs-toggle-switch';
        this.outlineToggleInput = document.createElement('input');
        this.outlineToggleInput.type = 'checkbox';
        this.outlineToggleInput.checked = !!hoverOutlineEnabled;
        this.outlineToggleLabel = document.createElement('span');
        this.outlineToggleLabel.textContent = 'Hover outline';
        this.outlineToggle.appendChild(this.outlineToggleInput);
        this.outlineToggle.appendChild(this.outlineToggleLabel);
        this.controls.appendChild(this.outlineToggle);

        this.collisionToggle = document.createElement('label');
        this.collisionToggle.className = 'connector-debug-toggle-switch city-debugs-toggle-switch';
        this.collisionToggleInput = document.createElement('input');
        this.collisionToggleInput.type = 'checkbox';
        this.collisionToggleInput.checked = !!collisionDebugEnabled;
        this.collisionToggleLabel = document.createElement('span');
        this.collisionToggleLabel.textContent = 'Poles view';
        this.collisionToggle.appendChild(this.collisionToggleInput);
        this.collisionToggle.appendChild(this.collisionToggleLabel);
        this.controls.appendChild(this.collisionToggle);

        this.legend = document.createElement('div');
        this.legend.className = 'city-debugs-legend';
        const makeLegendItem = (label, color, opts = null) => {
            const item = document.createElement('div');
            item.className = 'city-debugs-legend-item';
            const dot = document.createElement('span');
            dot.className = 'city-debugs-legend-dot';
            const style = opts ?? {};
            dot.style.backgroundColor = style.hollow ? 'transparent' : color;
            dot.style.borderColor = color;
            if (style.borderWidth) dot.style.borderWidth = `${style.borderWidth}px`;
            if (style.opacity !== undefined) dot.style.opacity = `${style.opacity}`;
            const text = document.createElement('span');
            text.className = 'city-debugs-legend-text';
            text.textContent = label;
            item.appendChild(dot);
            item.appendChild(text);
            return item;
        };
        this.legend.appendChild(makeLegendItem('Collision pole', '#ff3b30'));
        this.legend.appendChild(makeLegendItem('Connection pole', '#34c759'));
        this.legend.appendChild(makeLegendItem('Adjusted end pole', '#34c759', { hollow: true, borderWidth: 2 }));
        this.legend.appendChild(makeLegendItem('Original end pole', '#ff3b30', { opacity: 0.45 }));

        this.root.appendChild(this.title);
        this.root.appendChild(this.controls);
        this.root.appendChild(this.legend);

        this._onConnectorDebugToggle = onConnectorDebugToggle;
        this._onHoverOutlineToggle = onHoverOutlineToggle;
        this._onCollisionDebugToggle = onCollisionDebugToggle;

        this.connectorToggleInput.addEventListener('change', () => {
            if (this._onConnectorDebugToggle) this._onConnectorDebugToggle(this.connectorToggleInput.checked);
        });

        this.outlineToggleInput.addEventListener('change', () => {
            if (this._onHoverOutlineToggle) this._onHoverOutlineToggle(this.outlineToggleInput.checked);
        });

        this.collisionToggleInput.addEventListener('change', () => {
            if (this._onCollisionDebugToggle) this._onCollisionDebugToggle(this.collisionToggleInput.checked);
        });
    }

    setConnectorDebugEnabled(enabled) {
        if (this.connectorToggleInput) this.connectorToggleInput.checked = !!enabled;
    }

    setHoverOutlineEnabled(enabled) {
        if (this.outlineToggleInput) this.outlineToggleInput.checked = !!enabled;
    }

    setCollisionDebugEnabled(enabled) {
        if (this.collisionToggleInput) this.collisionToggleInput.checked = !!enabled;
    }

    setOnConnectorDebugToggle(fn) {
        this._onConnectorDebugToggle = fn;
    }

    setOnHoverOutlineToggle(fn) {
        this._onHoverOutlineToggle = fn;
    }

    setOnCollisionDebugToggle(fn) {
        this._onCollisionDebugToggle = fn;
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
