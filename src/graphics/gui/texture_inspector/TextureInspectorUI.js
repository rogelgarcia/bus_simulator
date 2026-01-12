// src/graphics/gui/texture_inspector/TextureInspectorUI.js
// HUD UI for browsing textures and previewing them on a plane.

export const TEXTURE_INSPECTOR_BASE_COLORS = Object.freeze([
    { id: 'white', label: 'White', hex: 0xffffff },
    { id: 'light_gray', label: 'Light gray', hex: 0xd7dde7 },
    { id: 'mid_gray', label: 'Mid gray', hex: 0x8c96a6 },
    { id: 'dark', label: 'Dark', hex: 0x1b2430 },
    { id: 'black', label: 'Black', hex: 0x0b0f14 }
]);

function formatFloat(value, digits = 5) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '-';
    return num.toFixed(digits);
}

function formatRectPx(rectPx) {
    const r = rectPx && typeof rectPx === 'object' ? rectPx : null;
    if (!r) return '-';
    const x = Number.isFinite(r.x) ? r.x : '-';
    const y = Number.isFinite(r.y) ? r.y : '-';
    const w = Number.isFinite(r.w) ? r.w : '-';
    const h = Number.isFinite(r.h) ? r.h : '-';
    return `${x},${y},${w},${h}`;
}

function formatUv(uv) {
    const r = uv && typeof uv === 'object' ? uv : null;
    if (!r) return '-';
    return `${formatFloat(r.u0)},${formatFloat(r.v0)},${formatFloat(r.u1)},${formatFloat(r.v1)}`;
}

export class TextureInspectorUI {
    constructor() {
        this.root = document.createElement('div');
        this.root.className = 'ui-hud-root texture-inspector-hud';
        this.root.id = 'texture-inspector-hud';

        this.panel = document.createElement('div');
        this.panel.className = 'ui-panel is-interactive texture-inspector-panel';

        this.title = document.createElement('div');
        this.title.className = 'ui-title';
        this.title.textContent = 'Texture Inspector';

        const makeRow = (label) => {
            const row = document.createElement('div');
            row.className = 'texture-inspector-row';
            const lab = document.createElement('div');
            lab.className = 'texture-inspector-row-label';
            lab.textContent = label;
            const val = document.createElement('div');
            val.className = 'texture-inspector-row-value';
            val.textContent = '-';
            row.appendChild(lab);
            row.appendChild(val);
            return { row, lab, val };
        };

        const idRow = makeRow('Id');
        this.textureIdRow = idRow.row;
        this.textureIdValue = idRow.val;

        const nameRow = makeRow('Name');
        this.textureNameRow = nameRow.row;
        this.textureNameValue = nameRow.val;

        this.catalogLabel = document.createElement('div');
        this.catalogLabel.className = 'ui-section-label';
        this.catalogLabel.textContent = 'Catalog';

        this.collectionRow = document.createElement('div');
        this.collectionRow.className = 'texture-inspector-row';
        this.collectionLabel = document.createElement('div');
        this.collectionLabel.className = 'texture-inspector-row-label';
        this.collectionLabel.textContent = 'Collection';
        this.collectionSelect = document.createElement('select');
        this.collectionSelect.className = 'texture-inspector-select';
        this.collectionRow.appendChild(this.collectionLabel);
        this.collectionRow.appendChild(this.collectionSelect);

        this.catalogRow = document.createElement('div');
        this.catalogRow.className = 'texture-inspector-catalog';

        this.prevBtn = document.createElement('button');
        this.prevBtn.type = 'button';
        this.prevBtn.className = 'texture-inspector-btn';
        this.prevBtn.textContent = 'Prev';

        this.nextBtn = document.createElement('button');
        this.nextBtn.type = 'button';
        this.nextBtn.className = 'texture-inspector-btn';
        this.nextBtn.textContent = 'Next';

        this.textureSelect = document.createElement('select');
        this.textureSelect.className = 'texture-inspector-select';

        this.catalogRow.appendChild(this.prevBtn);
        this.catalogRow.appendChild(this.textureSelect);
        this.catalogRow.appendChild(this.nextBtn);

        this.surfaceLabel = document.createElement('div');
        this.surfaceLabel.className = 'ui-section-label';
        this.surfaceLabel.textContent = 'Surface';

        this.previewLabel = document.createElement('div');
        this.previewLabel.className = 'ui-section-label';
        this.previewLabel.textContent = 'Preview';

        this.previewModeRow = document.createElement('div');
        this.previewModeRow.className = 'texture-inspector-row';
        this.previewModeLabel = document.createElement('div');
        this.previewModeLabel.className = 'texture-inspector-row-label';
        this.previewModeLabel.textContent = 'Mode';
        this.previewModeSelect = document.createElement('select');
        this.previewModeSelect.className = 'texture-inspector-select';
        const modeSingle = document.createElement('option');
        modeSingle.value = 'single';
        modeSingle.textContent = 'Single';
        const modeTiled = document.createElement('option');
        modeTiled.value = 'tiled';
        modeTiled.textContent = 'Tiled';
        this.previewModeSelect.appendChild(modeSingle);
        this.previewModeSelect.appendChild(modeTiled);
        this.previewModeRow.appendChild(this.previewModeLabel);
        this.previewModeRow.appendChild(this.previewModeSelect);

        this.gridRow = document.createElement('div');
        this.gridRow.className = 'texture-inspector-row';
        this.gridLabel = document.createElement('div');
        this.gridLabel.className = 'texture-inspector-row-label';
        this.gridLabel.textContent = 'Grid';
        this.gridToggle = document.createElement('input');
        this.gridToggle.type = 'checkbox';
        this.gridToggle.className = 'texture-inspector-checkbox';
        this.gridToggle.checked = true;
        this.gridRow.appendChild(this.gridLabel);
        this.gridRow.appendChild(this.gridToggle);

        this.tileGapRow = document.createElement('div');
        this.tileGapRow.className = 'texture-inspector-row';
        this.tileGapLabel = document.createElement('div');
        this.tileGapLabel.className = 'texture-inspector-row-label';
        this.tileGapLabel.textContent = 'Gap';
        this.tileGapControls = document.createElement('div');
        this.tileGapControls.className = 'texture-inspector-gap-controls';
        this.tileGapRange = document.createElement('input');
        this.tileGapRange.type = 'range';
        this.tileGapRange.className = 'texture-inspector-range';
        this.tileGapRange.min = '0';
        this.tileGapRange.max = '0.75';
        this.tileGapRange.step = '0.01';
        this.tileGapRange.value = '0';
        this.tileGapNumber = document.createElement('input');
        this.tileGapNumber.type = 'number';
        this.tileGapNumber.className = 'texture-inspector-number';
        this.tileGapNumber.min = '0';
        this.tileGapNumber.max = '0.75';
        this.tileGapNumber.step = '0.01';
        this.tileGapNumber.value = '0';
        this.tileGapControls.appendChild(this.tileGapRange);
        this.tileGapControls.appendChild(this.tileGapNumber);
        this.tileGapRow.appendChild(this.tileGapLabel);
        this.tileGapRow.appendChild(this.tileGapControls);

        this.baseColorRow = document.createElement('div');
        this.baseColorRow.className = 'texture-inspector-row';
        this.baseColorLabel = document.createElement('div');
        this.baseColorLabel.className = 'texture-inspector-row-label';
        this.baseColorLabel.textContent = 'Base';
        this.baseColorSelect = document.createElement('select');
        this.baseColorSelect.className = 'texture-inspector-select';
        for (const opt of TEXTURE_INSPECTOR_BASE_COLORS) {
            const o = document.createElement('option');
            o.value = opt.id;
            o.textContent = opt.label;
            this.baseColorSelect.appendChild(o);
        }
        this.baseColorRow.appendChild(this.baseColorLabel);
        this.baseColorRow.appendChild(this.baseColorSelect);

        this.summary = document.createElement('textarea');
        this.summary.className = 'texture-inspector-summary';
        this.summary.rows = 2;
        this.summary.readOnly = true;
        this.summary.value = '';

        this.copyBtn = document.createElement('button');
        this.copyBtn.type = 'button';
        this.copyBtn.className = 'texture-inspector-btn texture-inspector-btn-primary';
        this.copyBtn.textContent = 'Copy';

        this.panel.appendChild(this.title);
        this.panel.appendChild(this.textureIdRow);
        this.panel.appendChild(this.textureNameRow);
        this.panel.appendChild(this.catalogLabel);
        this.panel.appendChild(this.collectionRow);
        this.panel.appendChild(this.catalogRow);
        this.panel.appendChild(this.surfaceLabel);
        this.panel.appendChild(this.baseColorRow);
        this.panel.appendChild(this.previewLabel);
        this.panel.appendChild(this.previewModeRow);
        this.panel.appendChild(this.gridRow);
        this.panel.appendChild(this.tileGapRow);
        this.panel.appendChild(this.summary);
        this.panel.appendChild(this.copyBtn);
        this.root.appendChild(this.panel);

        this.onTextureIdChange = null;
        this.onCollectionIdChange = null;
        this.onTexturePrev = null;
        this.onTextureNext = null;
        this.onBaseColorChange = null;
        this.onPreviewModeChange = null;
        this.onGridEnabledChange = null;
        this.onTileGapChange = null;

        this._onSelectChange = () => this.onTextureIdChange?.(this.textureSelect.value);
        this._onCollectionChange = () => this.onCollectionIdChange?.(this.collectionSelect.value);
        this._onPrev = () => this.onTexturePrev?.();
        this._onNext = () => this.onTextureNext?.();
        this._onBaseColor = () => this.onBaseColorChange?.(this.baseColorSelect.value);
        this._onPreviewMode = () => {
            this._syncPreviewWidgets();
            this.onPreviewModeChange?.(this.previewModeSelect.value);
        };
        this._onGrid = () => this.onGridEnabledChange?.(this.gridToggle.checked);
        this._onTileGapRange = () => this._setTileGapFromUi(this.tileGapRange.value);
        this._onTileGapNumber = () => this._setTileGapFromUi(this.tileGapNumber.value);
        this._onCopy = () => this._copySummary();

        this._bound = false;
        this._selectedExtra = null;

        this._syncPreviewWidgets();
    }

    mount() {
        if (!this.root.isConnected) document.body.appendChild(this.root);
        this._bind();
    }

    unmount() {
        this._unbind();
        this.root.remove();
    }

    setCollectionOptions(options) {
        const list = Array.isArray(options) ? options : [];
        const current = this.collectionSelect.value;
        this.collectionSelect.textContent = '';
        for (const opt of list) {
            const id = typeof opt?.id === 'string' ? opt.id : '';
            if (!id) continue;
            const label = typeof opt?.name === 'string' ? opt.name : (typeof opt?.label === 'string' ? opt.label : id);
            const el = document.createElement('option');
            el.value = id;
            el.textContent = `${label} (${id})`;
            this.collectionSelect.appendChild(el);
        }
        if (current) this.collectionSelect.value = current;
    }

    setSelectedCollection({ id = '-' } = {}) {
        if (id) this.collectionSelect.value = id;
        this._syncSummary();
    }

    setTextureOptions(options) {
        const list = Array.isArray(options) ? options : [];
        const current = this.textureSelect.value;
        this.textureSelect.textContent = '';
        for (const opt of list) {
            const id = typeof opt?.id === 'string' ? opt.id : '';
            if (!id) continue;
            const label = typeof opt?.label === 'string' ? opt.label : id;
            const el = document.createElement('option');
            el.value = id;
            el.textContent = `${label} (${id})`;
            this.textureSelect.appendChild(el);
        }
        if (current) this.textureSelect.value = current;
    }

    setSelectedTexture({ id = '-', name = '-', collection = null, extra = null } = {}) {
        this.textureIdValue.textContent = id || '-';
        const safeCollection = typeof collection === 'string' ? collection : '';
        this.textureNameValue.textContent = safeCollection ? `${name || '-'} (${safeCollection})` : (name || '-');
        this._selectedExtra = extra;
        if (id) this.textureSelect.value = id;
        this._syncSummary();
    }

    setBaseColorId(id) {
        const next = TEXTURE_INSPECTOR_BASE_COLORS.find((c) => c.id === id)?.id ?? TEXTURE_INSPECTOR_BASE_COLORS[0]?.id ?? 'white';
        this.baseColorSelect.value = next;
        this._syncSummary();
    }

    setPreviewModeId(modeId) {
        const next = modeId === 'tiled' ? 'tiled' : 'single';
        this.previewModeSelect.value = next;
        this._syncPreviewWidgets();
    }

    getPreviewModeId() {
        return this.previewModeSelect.value === 'tiled' ? 'tiled' : 'single';
    }

    setGridEnabled(enabled) {
        this.gridToggle.checked = !!enabled;
    }

    getGridEnabled() {
        return !!this.gridToggle.checked;
    }

    setTileGap(value) {
        const num = Number(value);
        const next = Number.isFinite(num) ? Math.max(0, Math.min(0.75, num)) : 0;
        const text = String(next);
        this.tileGapRange.value = text;
        this.tileGapNumber.value = text;
    }

    getBaseColorHex() {
        const id = this.baseColorSelect.value;
        return TEXTURE_INSPECTOR_BASE_COLORS.find((c) => c.id === id)?.hex ?? 0xffffff;
    }

    _syncSummary() {
        const collectionId = this.collectionSelect.value || '-';
        const textureId = this.textureSelect.value || '-';
        const base = this.baseColorSelect.value || 'white';
        const extra = this._selectedExtra;

        const parts = [`collection:${collectionId}`, `texture:${textureId}`, `base:${base}`];
        const atlas = typeof extra?.atlas === 'string' ? extra.atlas : '';
        if (atlas) parts.push(`atlas:${atlas}`);
        if (extra?.rectPx) parts.push(`rect:${formatRectPx(extra.rectPx)}`);
        if (extra?.uv) parts.push(`uv:${formatUv(extra.uv)}`);
        this.summary.value = parts.join(' ');
    }

    _copySummary() {
        const text = this.summary.value || '';
        if (!text) return;
        if (navigator?.clipboard?.writeText) {
            navigator.clipboard.writeText(text).catch(() => this._fallbackCopy(text));
            return;
        }
        this._fallbackCopy(text);
    }

    _setTileGapFromUi(raw) {
        const num = Number(raw);
        const next = Number.isFinite(num) ? Math.max(0, Math.min(0.75, num)) : 0;
        this.setTileGap(next);
        this.onTileGapChange?.(next);
    }

    _syncPreviewWidgets() {
        const tiled = this.getPreviewModeId() === 'tiled';
        if (this.tileGapRow) this.tileGapRow.classList.toggle('hidden', !tiled);
    }

    _fallbackCopy(text) {
        this.summary.focus();
        this.summary.select();
        try {
            document.execCommand('copy');
        } catch {
            // ignore
        }
        this.summary.setSelectionRange(text.length, text.length);
    }

    _bind() {
        if (this._bound) return;
        this._bound = true;
        this.collectionSelect.addEventListener('change', this._onCollectionChange);
        this.textureSelect.addEventListener('change', this._onSelectChange);
        this.prevBtn.addEventListener('click', this._onPrev);
        this.nextBtn.addEventListener('click', this._onNext);
        this.baseColorSelect.addEventListener('change', this._onBaseColor);
        this.previewModeSelect.addEventListener('change', this._onPreviewMode);
        this.gridToggle.addEventListener('change', this._onGrid);
        this.tileGapRange.addEventListener('input', this._onTileGapRange);
        this.tileGapNumber.addEventListener('change', this._onTileGapNumber);
        this.copyBtn.addEventListener('click', this._onCopy);
    }

    _unbind() {
        if (!this._bound) return;
        this._bound = false;
        this.collectionSelect.removeEventListener('change', this._onCollectionChange);
        this.textureSelect.removeEventListener('change', this._onSelectChange);
        this.prevBtn.removeEventListener('click', this._onPrev);
        this.nextBtn.removeEventListener('click', this._onNext);
        this.baseColorSelect.removeEventListener('change', this._onBaseColor);
        this.previewModeSelect.removeEventListener('change', this._onPreviewMode);
        this.gridToggle.removeEventListener('change', this._onGrid);
        this.tileGapRange.removeEventListener('input', this._onTileGapRange);
        this.tileGapNumber.removeEventListener('change', this._onTileGapNumber);
        this.copyBtn.removeEventListener('click', this._onCopy);
    }
}
