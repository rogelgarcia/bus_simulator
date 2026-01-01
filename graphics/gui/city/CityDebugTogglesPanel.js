// graphics/gui/city/CityDebugTogglesPanel.js
// Controls city debug toggles and render mode switches.
export class CityDebugTogglesPanel {
    constructor({
        connectorDebugEnabled = true,
        hoverOutlineEnabled = true,
        collisionDebugEnabled = true,
        treesEnabled = true,
        roadRenderMode = 'debug',
        onConnectorDebugToggle = null,
        onHoverOutlineToggle = null,
        onCollisionDebugToggle = null,
        onTreesToggle = null,
        onRoadRenderModeChange = null
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

        this.treesToggle = document.createElement('label');
        this.treesToggle.className = 'connector-debug-toggle-switch city-debugs-toggle-switch';
        this.treesToggleInput = document.createElement('input');
        this.treesToggleInput.type = 'checkbox';
        this.treesToggleInput.checked = !!treesEnabled;
        this.treesToggleLabel = document.createElement('span');
        this.treesToggleLabel.textContent = 'Trees';
        this.treesToggle.appendChild(this.treesToggleInput);
        this.treesToggle.appendChild(this.treesToggleLabel);
        this.controls.appendChild(this.treesToggle);

        this.displaySection = document.createElement('div');
        this.displaySection.className = 'city-debugs-section';
        this.displayTitle = document.createElement('div');
        this.displayTitle.className = 'city-debugs-section-title';
        this.displayTitle.textContent = 'Display';
        this.displayRow = document.createElement('div');
        this.displayRow.className = 'city-debugs-mode-row';
        this.displayLabel = document.createElement('span');
        this.displayLabel.className = 'city-debugs-mode-label';
        this.displayLabel.textContent = 'Road rendering mode:';
        this.modeSelector = document.createElement('div');
        this.modeSelector.className = 'city-debugs-mode-selector';
        this.modeNormal = document.createElement('button');
        this.modeNormal.type = 'button';
        this.modeNormal.className = 'city-debugs-mode-text';
        this.modeNormal.textContent = 'Normal';
        this.modeToggle = document.createElement('button');
        this.modeToggle.type = 'button';
        this.modeToggle.className = 'city-debugs-mode-toggle';
        this.modeToggleThumb = document.createElement('span');
        this.modeToggleThumb.className = 'city-debugs-mode-thumb';
        this.modeToggle.appendChild(this.modeToggleThumb);
        this.modeDebug = document.createElement('button');
        this.modeDebug.type = 'button';
        this.modeDebug.className = 'city-debugs-mode-text';
        this.modeDebug.textContent = 'Debug';
        this.modeSelector.appendChild(this.modeNormal);
        this.modeSelector.appendChild(this.modeToggle);
        this.modeSelector.appendChild(this.modeDebug);
        this.displayRow.appendChild(this.displayLabel);
        this.displayRow.appendChild(this.modeSelector);
        this.displaySection.appendChild(this.displayTitle);
        this.displaySection.appendChild(this.displayRow);

        this.root.appendChild(this.title);
        this.root.appendChild(this.controls);
        this.root.appendChild(this.displaySection);

        this._onConnectorDebugToggle = onConnectorDebugToggle;
        this._onHoverOutlineToggle = onHoverOutlineToggle;
        this._onCollisionDebugToggle = onCollisionDebugToggle;
        this._onTreesToggle = onTreesToggle;
        this._onRoadRenderModeChange = onRoadRenderModeChange;

        this._setRoadRenderMode(roadRenderMode);

        this.connectorToggleInput.addEventListener('change', () => {
            if (this._onConnectorDebugToggle) this._onConnectorDebugToggle(this.connectorToggleInput.checked);
        });

        this.outlineToggleInput.addEventListener('change', () => {
            if (this._onHoverOutlineToggle) this._onHoverOutlineToggle(this.outlineToggleInput.checked);
        });

        this.collisionToggleInput.addEventListener('change', () => {
            if (this._onCollisionDebugToggle) this._onCollisionDebugToggle(this.collisionToggleInput.checked);
        });

        this.treesToggleInput.addEventListener('change', () => {
            if (this._onTreesToggle) this._onTreesToggle(this.treesToggleInput.checked);
        });

        this.modeToggle.addEventListener('click', () => {
            const next = this._roadRenderMode === 'debug' ? 'normal' : 'debug';
            this._setRoadRenderMode(next);
            if (this._onRoadRenderModeChange) this._onRoadRenderModeChange(this._roadRenderMode);
        });

        this.modeNormal.addEventListener('click', () => {
            if (this._roadRenderMode === 'normal') return;
            this._setRoadRenderMode('normal');
            if (this._onRoadRenderModeChange) this._onRoadRenderModeChange(this._roadRenderMode);
        });

        this.modeDebug.addEventListener('click', () => {
            if (this._roadRenderMode === 'debug') return;
            this._setRoadRenderMode('debug');
            if (this._onRoadRenderModeChange) this._onRoadRenderModeChange(this._roadRenderMode);
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

    setTreesEnabled(enabled) {
        if (this.treesToggleInput) this.treesToggleInput.checked = !!enabled;
    }

    setRoadRenderMode(mode) {
        this._setRoadRenderMode(mode);
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

    setOnTreesToggle(fn) {
        this._onTreesToggle = fn;
    }

    setOnRoadRenderModeChange(fn) {
        this._onRoadRenderModeChange = fn;
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

    _setRoadRenderMode(mode) {
        const next = mode === 'normal' ? 'normal' : 'debug';
        this._roadRenderMode = next;
        if (this.modeToggle) {
            this.modeToggle.classList.toggle('is-debug', next === 'debug');
        }
        if (this.modeNormal) this.modeNormal.classList.toggle('is-active', next === 'normal');
        if (this.modeDebug) this.modeDebug.classList.toggle('is-active', next === 'debug');
    }
}
