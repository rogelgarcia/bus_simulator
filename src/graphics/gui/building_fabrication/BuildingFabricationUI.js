// src/graphics/gui/building_fabrication/BuildingFabricationUI.js
// Builds the HUD controls for the building fabrication scene.

function clampInt(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    const rounded = Math.round(num);
    return Math.max(min, Math.min(max, rounded));
}

export class BuildingFabricationUI {
    constructor({
        floorMin = 1,
        floorMax = 60,
        floorCount = 6
    } = {}) {
        this.floorMin = clampInt(floorMin, 1, 9999);
        this.floorMax = clampInt(floorMax, this.floorMin, 9999);
        this._floorCount = clampInt(floorCount, this.floorMin, this.floorMax);

        this.root = document.createElement('div');
        this.root.className = 'ui-hud-root building-fab-hud';
        this.root.id = 'building-fab-hud';

        this.panel = document.createElement('div');
        this.panel.className = 'ui-panel is-interactive building-fab-panel';

        this.title = document.createElement('div');
        this.title.className = 'ui-title';
        this.title.textContent = 'Building Fabrication';

        this.hint = document.createElement('div');
        this.hint.className = 'building-fab-hint';
        this.hint.textContent = 'Click tiles to add/remove buildings (uses current floor count). Drag to orbit. Scroll to zoom. Esc to exit.';

        this.counts = document.createElement('div');
        this.counts.className = 'building-fab-counts';
        this.buildingCountEl = document.createElement('div');
        this.buildingCountEl.className = 'building-fab-count';
        this.counts.appendChild(this.buildingCountEl);
        this.setBuildingCount(0);

        this.floorLabel = document.createElement('div');
        this.floorLabel.className = 'ui-section-label';
        this.floorLabel.textContent = 'Floors';

        this.floorRow = document.createElement('div');
        this.floorRow.className = 'building-fab-floor-row';

        this.floorRange = document.createElement('input');
        this.floorRange.type = 'range';
        this.floorRange.min = String(this.floorMin);
        this.floorRange.max = String(this.floorMax);
        this.floorRange.step = '1';
        this.floorRange.value = String(this._floorCount);
        this.floorRange.className = 'building-fab-floor-range';

        this.floorNumber = document.createElement('input');
        this.floorNumber.type = 'number';
        this.floorNumber.min = String(this.floorMin);
        this.floorNumber.max = String(this.floorMax);
        this.floorNumber.step = '1';
        this.floorNumber.value = String(this._floorCount);
        this.floorNumber.className = 'building-fab-floor-number';

        this.floorRow.appendChild(this.floorRange);
        this.floorRow.appendChild(this.floorNumber);

        this.actions = document.createElement('div');
        this.actions.className = 'building-fab-actions';

        this.resetBtn = document.createElement('button');
        this.resetBtn.type = 'button';
        this.resetBtn.className = 'building-fab-btn building-fab-btn-danger';
        this.resetBtn.textContent = 'Clear / Reset';

        this.actions.appendChild(this.resetBtn);

        this.panel.appendChild(this.title);
        this.panel.appendChild(this.hint);
        this.panel.appendChild(this.counts);
        this.panel.appendChild(this.floorLabel);
        this.panel.appendChild(this.floorRow);
        this.panel.appendChild(this.actions);

        this.root.appendChild(this.panel);

        this.onReset = null;
        this.onFloorChange = null;

        this._bound = false;
        this._enabled = true;

        this._onRangeInput = () => this._setFloorFromUi(this.floorRange.value);
        this._onNumberInput = () => this._setFloorFromUi(this.floorNumber.value);
        this._onReset = () => this.onReset?.();
    }

    mount(parent = document.body) {
        if (this.root.isConnected) return;
        parent.appendChild(this.root);
        this._bind();
    }

    unmount() {
        this._unbind();
        if (this.root.isConnected) this.root.remove();
    }

    setEnabled(enabled) {
        const next = !!enabled;
        this._enabled = next;
        this.resetBtn.disabled = !next;
        this.floorRange.disabled = !next;
        this.floorNumber.disabled = !next;
        this.panel.classList.toggle('is-disabled', !next);
    }

    getFloorCount() {
        return this._floorCount;
    }

    setFloorCount(floors) {
        const next = clampInt(floors, this.floorMin, this.floorMax);
        if (next === this._floorCount) return;
        this._floorCount = next;
        this.floorRange.value = String(next);
        this.floorNumber.value = String(next);
        this.onFloorChange?.(next);
    }

    setBuildingCount(count) {
        const safe = clampInt(count, 0, 9999);
        this.buildingCountEl.textContent = `Buildings: ${safe}`;
    }

    _setFloorFromUi(raw) {
        const next = clampInt(raw, this.floorMin, this.floorMax);
        const changed = next !== this._floorCount;
        this._floorCount = next;
        this.floorRange.value = String(next);
        this.floorNumber.value = String(next);
        if (changed) this.onFloorChange?.(next);
    }

    _bind() {
        if (this._bound) return;
        this._bound = true;

        this.floorRange.addEventListener('input', this._onRangeInput);
        this.floorNumber.addEventListener('input', this._onNumberInput);
        this.resetBtn.addEventListener('click', this._onReset);
    }

    _unbind() {
        if (!this._bound) return;
        this._bound = false;

        this.floorRange.removeEventListener('input', this._onRangeInput);
        this.floorNumber.removeEventListener('input', this._onNumberInput);
        this.resetBtn.removeEventListener('click', this._onReset);
    }
}
