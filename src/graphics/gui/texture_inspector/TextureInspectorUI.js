// src/graphics/gui/texture_inspector/TextureInspectorUI.js
// HUD UI for browsing textures and previewing them on a plane.

export const TEXTURE_INSPECTOR_BASE_COLORS = Object.freeze([
    { id: 'white', label: 'White', hex: 0xffffff },
    { id: 'light_gray', label: 'Light gray', hex: 0xd7dde7 },
    { id: 'mid_gray', label: 'Mid gray', hex: 0x8c96a6 },
    { id: 'dark', label: 'Dark', hex: 0x1b2430 },
    { id: 'black', label: 'Black', hex: 0x0b0f14 }
]);

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
        this.panel.appendChild(this.catalogRow);
        this.panel.appendChild(this.surfaceLabel);
        this.panel.appendChild(this.baseColorRow);
        this.panel.appendChild(this.summary);
        this.panel.appendChild(this.copyBtn);
        this.root.appendChild(this.panel);

        this.onTextureIdChange = null;
        this.onTexturePrev = null;
        this.onTextureNext = null;
        this.onBaseColorChange = null;

        this._onSelectChange = () => this.onTextureIdChange?.(this.textureSelect.value);
        this._onPrev = () => this.onTexturePrev?.();
        this._onNext = () => this.onTextureNext?.();
        this._onBaseColor = () => this.onBaseColorChange?.(this.baseColorSelect.value);
        this._onCopy = () => this._copySummary();

        this._bound = false;
    }

    mount() {
        if (!this.root.isConnected) document.body.appendChild(this.root);
        this._bind();
    }

    unmount() {
        this._unbind();
        this.root.remove();
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

    setSelectedTexture({ id = '-', name = '-' } = {}) {
        this.textureIdValue.textContent = id || '-';
        this.textureNameValue.textContent = name || '-';
        if (id) this.textureSelect.value = id;
        this._syncSummary();
    }

    setBaseColorId(id) {
        const next = TEXTURE_INSPECTOR_BASE_COLORS.find((c) => c.id === id)?.id ?? TEXTURE_INSPECTOR_BASE_COLORS[0]?.id ?? 'white';
        this.baseColorSelect.value = next;
        this._syncSummary();
    }

    getBaseColorHex() {
        const id = this.baseColorSelect.value;
        return TEXTURE_INSPECTOR_BASE_COLORS.find((c) => c.id === id)?.hex ?? 0xffffff;
    }

    _syncSummary() {
        const textureId = this.textureSelect.value || '-';
        const base = this.baseColorSelect.value || 'white';
        this.summary.value = `texture:${textureId} base:${base}`;
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
        this.textureSelect.addEventListener('change', this._onSelectChange);
        this.prevBtn.addEventListener('click', this._onPrev);
        this.nextBtn.addEventListener('click', this._onNext);
        this.baseColorSelect.addEventListener('change', this._onBaseColor);
        this.copyBtn.addEventListener('click', this._onCopy);
    }

    _unbind() {
        if (!this._bound) return;
        this._bound = false;
        this.textureSelect.removeEventListener('change', this._onSelectChange);
        this.prevBtn.removeEventListener('click', this._onPrev);
        this.nextBtn.removeEventListener('click', this._onNext);
        this.baseColorSelect.removeEventListener('change', this._onBaseColor);
        this.copyBtn.removeEventListener('click', this._onCopy);
    }
}

