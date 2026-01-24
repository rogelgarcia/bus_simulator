// src/graphics/gui/shared/PickerPopup.js
// Simple reusable picker popup for selecting color or texture-like options.

function normalizeOptions(options) {
    if (!Array.isArray(options)) return [];
    return options
        .filter(Boolean)
        .map((opt) => ({
            id: typeof opt.id === 'string' ? opt.id : '',
            label: typeof opt.label === 'string' ? opt.label : '',
            kind: opt.kind === 'color' ? 'color' : 'texture',
            hex: Number.isFinite(opt.hex) ? opt.hex : null,
            previewUrl: typeof opt.previewUrl === 'string' ? opt.previewUrl : null
        }))
        .filter((opt) => !!opt.id);
}

const _warnedPreviewUrls = new Set();

function isDevHost() {
    if (typeof window === 'undefined') return false;
    const host = String(window.location.hostname || '').toLowerCase();
    const protocol = String(window.location.protocol || '').toLowerCase();
    if (protocol === 'file:') return true;
    if (!host) return true;
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') return true;
    if (host.endsWith('.localhost')) return true;

    const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (!m) return false;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    return false;
}

export class PickerPopup {
    constructor() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'ui-picker-overlay hidden';

        this.panel = document.createElement('div');
        this.panel.className = 'ui-panel is-interactive ui-picker-panel';

        this.header = document.createElement('div');
        this.header.className = 'ui-picker-header';

        this.titleEl = document.createElement('div');
        this.titleEl.className = 'ui-title ui-picker-title';
        this.titleEl.textContent = '';

        this.closeBtn = document.createElement('button');
        this.closeBtn.type = 'button';
        this.closeBtn.className = 'ui-picker-close';
        this.closeBtn.textContent = 'Close';

        this.header.appendChild(this.titleEl);
        this.header.appendChild(this.closeBtn);

        this.tabs = document.createElement('div');
        this.tabs.className = 'ui-picker-tabs hidden';

        this.grid = document.createElement('div');
        this.grid.className = 'ui-picker-grid';

        this.footer = document.createElement('div');
        this.footer.className = 'ui-picker-footer';
        this.footer.textContent = 'Click an option to select.';

        this.panel.appendChild(this.header);
        this.panel.appendChild(this.tabs);
        this.panel.appendChild(this.grid);
        this.panel.appendChild(this.footer);
        this.overlay.appendChild(this.panel);

        this._sections = [];
        this._activeSection = 0;
        this._selectedId = null;
        this._onSelect = null;

        this._onOverlayClick = (e) => this._handleOverlayClick(e);
        this._onClose = () => this.close();
        this._onGridClick = (e) => this._handleGridClick(e);
        this._onTabsClick = (e) => this._handleTabsClick(e);
    }

    isOpen() {
        return this.overlay.isConnected && !this.overlay.classList.contains('hidden');
    }

    open({
        title = 'Select',
        sections = [],
        selectedId = null,
        onSelect = null
    } = {}) {
        this._sections = (Array.isArray(sections) ? sections : []).map((s) => ({
            label: typeof s?.label === 'string' ? s.label : '',
            options: normalizeOptions(s?.options),
            allowEmpty: !!s?.allowEmpty
        })).filter((s) => s.options.length > 0 || s.allowEmpty);
        this._activeSection = 0;
        this._selectedId = typeof selectedId === 'string' ? selectedId : null;
        this._onSelect = typeof onSelect === 'function' ? onSelect : null;

        this.titleEl.textContent = title;

        if (!this.overlay.isConnected) document.body.appendChild(this.overlay);
        this.overlay.classList.remove('hidden');
        this._bind();
        this._renderTabs();
        this._renderActiveSection();
    }

    close() {
        if (!this.overlay.isConnected) return;
        this.overlay.classList.add('hidden');
        this._unbind();
        this._sections = [];
        this._activeSection = 0;
        this._selectedId = null;
        this._onSelect = null;
    }

    dispose() {
        this.close();
        this.overlay.remove();
    }

    _bind() {
        this.overlay.addEventListener('click', this._onOverlayClick);
        this.closeBtn.addEventListener('click', this._onClose);
        this.grid.addEventListener('click', this._onGridClick);
        this.tabs.addEventListener('click', this._onTabsClick);
    }

    _unbind() {
        this.overlay.removeEventListener('click', this._onOverlayClick);
        this.closeBtn.removeEventListener('click', this._onClose);
        this.grid.removeEventListener('click', this._onGridClick);
        this.tabs.removeEventListener('click', this._onTabsClick);
    }

    _handleOverlayClick(e) {
        if (!e) return;
        if (e.target === this.overlay) this.close();
    }

    _handleTabsClick(e) {
        const btn = e?.target?.closest?.('button');
        if (!btn || !this.tabs.contains(btn)) return;
        const idx = Number(btn.dataset?.idx);
        if (!Number.isFinite(idx)) return;
        if (idx === this._activeSection) return;
        this._activeSection = idx;
        this._renderTabs();
        this._renderActiveSection();
    }

    _handleGridClick(e) {
        const btn = e?.target?.closest?.('button');
        if (!btn || !this.grid.contains(btn)) return;
        if (btn.disabled) return;
        const id = btn.dataset?.id ?? '';
        if (!id) return;
        this._selectedId = id;
        const section = this._sections[this._activeSection];
        const opt = section?.options?.find?.((o) => o.id === id) ?? null;
        if (opt && this._onSelect) this._onSelect(opt);
        this.close();
    }

    _renderTabs() {
        const sections = this._sections;
        if (sections.length <= 1) {
            this.tabs.classList.add('hidden');
            this.tabs.textContent = '';
            return;
        }
        this.tabs.classList.remove('hidden');
        this.tabs.textContent = '';
        for (const [idx, section] of sections.entries()) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ui-picker-tab';
            btn.dataset.idx = String(idx);
            const label = section?.label || `Section ${idx + 1}`;
            btn.textContent = label;
            btn.classList.toggle('is-active', idx === this._activeSection);
            this.tabs.appendChild(btn);
        }
    }

    _renderActiveSection() {
        this.grid.textContent = '';
        const section = this._sections[this._activeSection];
        const options = section?.options ?? [];

        for (const opt of options) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ui-picker-option';
            btn.dataset.id = opt.id;
            btn.setAttribute('aria-label', opt.label || opt.id);
            btn.title = opt.label || opt.id;
            btn.classList.toggle('is-selected', opt.id === this._selectedId);
            btn.setAttribute('aria-pressed', opt.id === this._selectedId ? 'true' : 'false');

            const thumb = document.createElement('div');
            thumb.className = 'ui-picker-thumb';

            if (opt.kind === 'color' && opt.hex !== null) {
                thumb.style.background = `#${opt.hex.toString(16).padStart(6, '0')}`;
            } else if (opt.previewUrl) {
                const img = document.createElement('img');
                img.className = 'ui-picker-thumb-img';
                img.alt = opt.label || opt.id;
                img.loading = 'lazy';
                thumb.classList.add('has-image');
                img.addEventListener('error', () => {
                    const url = img.currentSrc || opt.previewUrl || '';
                    if (isDevHost() && url && !_warnedPreviewUrls.has(url)) {
                        _warnedPreviewUrls.add(url);
                        console.warn(`[PickerPopup] Preview image failed to load: ${url}`);
                    }
                    thumb.classList.remove('has-image');
                    thumb.textContent = opt.label || opt.id;
                }, { once: true });
                img.src = opt.previewUrl;
                thumb.appendChild(img);
            } else {
                thumb.textContent = opt.label || opt.id;
            }

            const label = document.createElement('div');
            label.className = 'ui-picker-option-label';
            label.textContent = opt.label || opt.id;

            btn.appendChild(thumb);
            btn.appendChild(label);
            this.grid.appendChild(btn);
        }
    }
}
