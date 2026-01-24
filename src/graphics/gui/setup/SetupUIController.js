// src/graphics/gui/setup/SetupUIController.js
// Setup screen controller (menu + ASCII frame) supporting both full-screen and in-game overlay modes.
// @ts-check

import { applyMaterialSymbolToButton } from '../shared/materialSymbols.js';

const STORAGE_KEYS = Object.freeze({
    overlayCollapsed: 'busSim.setupOverlayCollapsed'
});

const MODE = Object.freeze({
    state: 'state',
    overlay: 'overlay'
});

const FOOTER_TEXT = Object.freeze({
    state: 'Press number, 0 (Options), Q, or click. Esc to return.',
    overlay: 'Press number, 0 (Options), Q/Esc closes, click outside to close.'
});

function normalizeKey(key) {
    return typeof key === 'string' ? key.trim().toUpperCase() : '';
}

function isEditableTarget(target) {
    const el = target && typeof target === 'object' ? target : null;
    if (!el) return false;
    const tag = String(el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    return !!el.isContentEditable;
}

function resolveMode(mode) {
    return mode === MODE.overlay ? MODE.overlay : MODE.state;
}

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function getLayoutSpec(mode, collapsed) {
    if (mode === MODE.overlay) {
        if (collapsed) {
            return { maxCols: 44, maxWidthVw: 0.48, maxHeightVh: 0.32, maxHeightPx: 160, minCols: 22, minRows: 4 };
        }
        return { maxCols: 64, maxWidthVw: 0.62, maxHeightVh: 0.76, maxHeightPx: 480, minCols: 22, minRows: 6 };
    }
    return { maxCols: 110, maxWidthVw: 0.96, maxHeightVh: 0.8, maxHeightPx: 620, minCols: 20, minRows: 6 };
}

function readBoolStorage(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        const norm = String(raw).trim().toLowerCase();
        return !(['0', 'false', 'no', 'off'].includes(norm));
    } catch {
        return fallback;
    }
}

function writeBoolStorage(key, value) {
    try {
        localStorage.setItem(key, value ? '1' : '0');
    } catch {
    }
}

/**
 * @typedef {object} SetupSceneItem
 * @property {string} key
 * @property {string} label
 * @property {string} state
 */

/**
 * @typedef {object} SetupCloseItem
 * @property {string} key
 * @property {string} label
 */

export class SetupUIController {
    constructor() {
        this.root = document.getElementById('ui-setup');
        this.frameEl = this.root?.querySelector?.('#setup-frame') ?? null;
        this.menuEl = this.root?.querySelector?.('#setup-menu') ?? null;
        this.menuBackEl = this.root?.querySelector?.('#setup-menu-back') ?? null;
        this.subtitleEl = this.root?.querySelector?.('.setup-subtitle') ?? null;
        this.footerEl = this.root?.querySelector?.('.setup-footer') ?? null;
        this.collapseBtn = this.root?.querySelector?.('#setup-collapse') ?? null;

        this.borderTop = this.root?.querySelector?.('#setup-border-top') ?? null;
        this.borderBottom = this.root?.querySelector?.('#setup-border-bottom') ?? null;
        this.borderLeft = this.root?.querySelector?.('#setup-border-left') ?? null;
        this.borderRight = this.root?.querySelector?.('#setup-border-right') ?? null;

        /** @type {SetupSceneItem[]} */
        this._scenes = [];
        /** @type {SetupCloseItem|null} */
        this._close = null;
        this._mode = MODE.state;
        this._collapsed = false;
        this._open = false;

        this.optionRows = [];
        this.selectedIndex = 0;
        this._menuColumns = 1;

        this._onSelectState = null;
        this._onRequestClose = null;

        this._onKeyDown = (e) => this._handleKeyDown(e);
        this._onResize = () => this._syncLayout();
        this._onBackdropPointerDown = (e) => this._handleBackdropPointerDown(e);
        this._onCollapseClick = (e) => this._handleCollapseClick(e);
    }

    isOpen() {
        return this._open;
    }

    open({
        mode = MODE.state,
        sceneItems = [],
        closeItem = null,
        currentStateId = null,
        currentStateLabel = null,
        onSelectState = null,
        onRequestClose = null
    } = {}) {
        if (!this.root || !this.frameEl) return;
        this.close();

        this._mode = resolveMode(mode);
        this.root.classList.toggle('is-overlay', this._mode === MODE.overlay);

        this._collapsed = this._mode === MODE.overlay
            ? readBoolStorage(STORAGE_KEYS.overlayCollapsed, false)
            : false;
        this.root.classList.toggle('is-collapsed', this._collapsed);

        this._scenes = Array.isArray(sceneItems)
            ? sceneItems
                .filter((v) => v && typeof v === 'object')
                .map((v) => ({ key: normalizeKey(v.key), label: String(v.label ?? ''), state: String(v.state ?? '') }))
                .filter((v) => v.key && v.label && v.state)
            : [];

        this._close = closeItem && typeof closeItem === 'object'
            ? { key: normalizeKey(closeItem.key), label: String(closeItem.label ?? '') }
            : null;

        this._onSelectState = typeof onSelectState === 'function' ? onSelectState : null;
        this._onRequestClose = typeof onRequestClose === 'function' ? onRequestClose : null;

        this._syncText({ currentStateId, currentStateLabel });

        this._syncCollapseButton();
        this.collapseBtn?.addEventListener?.('click', this._onCollapseClick, { passive: false });

        this._buildMenu({ force: true });
        this.selectedIndex = 0;
        this._setSelected(this.selectedIndex);

        this.root.classList.remove('hidden');

        window.addEventListener('keydown', this._onKeyDown, { passive: false });
        window.addEventListener('resize', this._onResize);
        if (this._mode === MODE.overlay) {
            this.root.addEventListener('pointerdown', this._onBackdropPointerDown, { passive: true });
        }

        requestAnimationFrame(() => this._syncLayout());
        if (document.fonts?.ready) document.fonts.ready.then(() => this._syncLayout());

        this._open = true;
    }

    close() {
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('resize', this._onResize);
        this.root?.removeEventListener?.('pointerdown', this._onBackdropPointerDown);
        this.collapseBtn?.removeEventListener?.('click', this._onCollapseClick);

        this.root?.classList?.add?.('hidden');
        this.root?.classList?.remove?.('is-overlay');
        this.root?.classList?.remove?.('is-collapsed');

        if (this.subtitleEl) this.subtitleEl.textContent = 'Select a scene';
        if (this.footerEl) this.footerEl.textContent = FOOTER_TEXT.state;

        document.activeElement?.blur?.();

        this._open = false;
        this._collapsed = false;
        this._mode = MODE.state;
        this._scenes = [];
        this._close = null;
        this.optionRows = [];
        this.selectedIndex = 0;
        this._menuColumns = 1;
        this._onSelectState = null;
        this._onRequestClose = null;
    }

    _syncText({ currentStateId, currentStateLabel }) {
        const currentId = typeof currentStateId === 'string' ? currentStateId : '';
        const currentLabelRaw = typeof currentStateLabel === 'string' ? currentStateLabel : '';
        const match = currentId ? (this._scenes.find((s) => s.state === currentId) ?? null) : null;
        const here = match?.label || currentLabelRaw || '';

        if (this.subtitleEl) {
            this.subtitleEl.textContent = here && this._mode === MODE.overlay
                ? `Select a scene · You are here: ${here}`
                : 'Select a scene';
        }

        if (this.footerEl) {
            this.footerEl.textContent = this._mode === MODE.overlay ? FOOTER_TEXT.overlay : FOOTER_TEXT.state;
        }
    }

    _syncCollapseButton() {
        if (!this.collapseBtn) return;

        const enabled = this._mode === MODE.overlay;
        this.collapseBtn.disabled = !enabled;

        if (!enabled) {
            this.collapseBtn.textContent = '';
            this.collapseBtn.classList.add('hidden');
            return;
        }

        this.collapseBtn.classList.remove('hidden');
        applyMaterialSymbolToButton(this.collapseBtn, {
            name: this._collapsed ? 'unfold_more' : 'unfold_less',
            label: this._collapsed ? 'Expand setup panel' : 'Collapse setup panel',
            size: 'md'
        });
    }

    _handleCollapseClick(e) {
        if (this._mode !== MODE.overlay) return;
        e.preventDefault();
        this._setCollapsed(!this._collapsed);
    }

    _setCollapsed(nextCollapsed) {
        this._collapsed = !!nextCollapsed;
        this.root?.classList?.toggle?.('is-collapsed', this._collapsed);
        writeBoolStorage(STORAGE_KEYS.overlayCollapsed, this._collapsed);
        this._syncCollapseButton();
        this._syncLayout();
    }

    _handleBackdropPointerDown(e) {
        if (this._mode !== MODE.overlay) return;
        const target = e.target && typeof e.target === 'object' ? e.target : null;
        if (!target || !this.frameEl) return;
        if (this.frameEl.contains(target)) return;
        this._onRequestClose?.();
    }

    _buildMenu({ force = false, preserveSelection = false } = {}) {
        if (!this.menuEl && !this.menuBackEl) return;
        if (!force && ((this.menuEl?.childElementCount ?? 0) > 0 || (this.menuBackEl?.childElementCount ?? 0) > 0)) return;

        const prevKey = preserveSelection ? (this.optionRows[this.selectedIndex]?.button?.dataset?.key ?? null) : null;

        if (this.menuEl) this.menuEl.textContent = '';
        if (this.menuBackEl) this.menuBackEl.textContent = '';
        this.optionRows = [];

        const cols = this._getMenuColumns();
        const main = this._scenes;
        const back = this._close ? { ...this._close, action: 'close' } : null;

        const displayMain = cols === 2
            ? (() => {
                const half = Math.ceil(main.length / 2);
                const out = [];
                for (let i = 0; i < half; i++) {
                    if (main[i]) out.push(main[i]);
                    const other = main[half + i] ?? null;
                    if (other) out.push(other);
                }
                return out;
            })()
            : main;

        const display = back ? [...displayMain, back] : displayMain;

        for (const option of display) {
            const isClose = option?.action === 'close';
            const target = isClose && this.menuBackEl ? this.menuBackEl : this.menuEl;
            if (!target) continue;

            const index = this.optionRows.length;
            const row = document.createElement('div');
            row.className = 'setup-option-row';

            const indicator = document.createElement('span');
            indicator.className = 'setup-option-indicator';
            indicator.textContent = '□';

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'setup-option';
            button.dataset.state = isClose ? '' : String(option.state ?? '');
            button.dataset.key = String(option.key ?? '');
            if (isClose) button.dataset.action = 'close';

            const num = document.createElement('span');
            num.className = 'setup-option-num';
            num.textContent = `[${option.key}]`;

            const label = document.createElement('span');
            label.className = 'setup-option-label';
            label.textContent = String(option.label ?? '');

            const box = document.createElement('span');
            box.className = 'setup-option-box';
            box.appendChild(num);
            box.appendChild(label);

            button.appendChild(box);

            button.addEventListener('focus', () => {
                this._setSelected(index);
            });

            button.addEventListener('mouseenter', () => {
                this._setSelected(index);
            });

            button.addEventListener('click', () => {
                if (isClose) this._onRequestClose?.();
                else this._onSelectState?.(button.dataset.state);
            });

            row.appendChild(indicator);
            row.appendChild(button);
            target.appendChild(row);
            this.optionRows.push({ row, button, indicator, option });
        }

        if (prevKey) {
            const idx = this.optionRows.findIndex((r) => r?.button?.dataset?.key === prevKey);
            if (idx >= 0) this.selectedIndex = idx;
        }
    }

    _handleKeyDown(e) {
        if (isEditableTarget(e.target) && e.code !== 'Escape' && e.key !== 'Escape') return;
        const key = e.key;
        const code = e.code;

        const isEsc = code === 'Escape' || key === 'Escape';
        if (isEsc) {
            e.preventDefault();
            this._onRequestClose?.();
            return;
        }

        const isQ = code === 'KeyQ' || key === 'q' || key === 'Q';
        const isUp = code === 'ArrowUp' || key === 'ArrowUp';
        const isDown = code === 'ArrowDown' || key === 'ArrowDown';
        const isLeft = code === 'ArrowLeft' || key === 'ArrowLeft';
        const isRight = code === 'ArrowRight' || key === 'ArrowRight';
        const isEnter = code === 'Enter' || key === 'Enter';
        const isSpace = code === 'Space' || key === ' ' || key === 'Spacebar';

        if (isQ || isUp || isDown || isLeft || isRight || isEnter || isSpace) {
            e.preventDefault();
        }

        if (isQ) {
            this._onRequestClose?.();
            return;
        }

        if (isEnter || isSpace) {
            this._activateSelected();
            return;
        }

        if (isUp || isDown || isLeft || isRight) {
            this._moveSelection({ isUp, isDown, isLeft, isRight });
            return;
        }

        const typed = normalizeKey(key);
        if (!typed) return;

        const opt = this.optionRows.find((r) => normalizeKey(r?.button?.dataset?.key) === typed) ?? null;
        if (!opt) return;
        e.preventDefault();
        if (opt.button?.dataset?.action === 'close') this._onRequestClose?.();
        else this._onSelectState?.(opt.button?.dataset?.state);
    }

    _activateSelected() {
        const row = this.optionRows[this.selectedIndex] ?? null;
        if (!row?.button) return;
        if (row.button.dataset?.action === 'close') this._onRequestClose?.();
        else this._onSelectState?.(row.button.dataset.state);
    }

    _moveSelection({ isUp, isDown, isLeft, isRight }) {
        if (!this.optionRows.length) return;
        const cols = this._getMenuColumns();
        let next = this.selectedIndex;

        if (isUp) next -= cols;
        if (isDown) next += cols;

        if (isLeft) {
            if (cols === 1) next -= 1;
            else if (next % cols === 1) next -= 1;
        }

        if (isRight) {
            if (cols === 1) next += 1;
            else if (next % cols === 0 && next + 1 < this.optionRows.length) next += 1;
        }

        next = clamp(next, 0, this.optionRows.length - 1);
        if (next !== this.selectedIndex) this._setSelected(next);
    }

    _getMenuColumns() {
        return this._menuColumns;
    }

    _setSelected(index) {
        if (!this.optionRows.length) return;
        const next = clamp(index, 0, this.optionRows.length - 1);
        this.selectedIndex = next;

        for (const [i, row] of this.optionRows.entries()) {
            const active = i === next;
            row.row.classList.toggle('is-selected', active);
            row.button.classList.toggle('is-selected', active);
            row.indicator.textContent = active ? '■' : '□';
        }

        this.optionRows[next]?.button?.focus?.({ preventScroll: true });
    }

    _syncLayout() {
        this._syncBorders();
        this._syncMenuColumns();
    }

    _syncMenuColumns() {
        if (!this.menuEl || !this.frameEl) return;
        const mainCount = this._scenes.length;
        const width = this.frameEl?.getBoundingClientRect?.().width ?? window.innerWidth;
        const wantsTwo = mainCount > 4 && width >= 640 && !this._collapsed;
        const nextCols = wantsTwo ? 2 : 1;
        const changed = nextCols !== this._menuColumns;
        this._menuColumns = nextCols;
        this.menuEl.classList.toggle('two-col', wantsTwo);
        if (changed) {
            this._buildMenu({ force: true, preserveSelection: true });
            this._setSelected(clamp(this.selectedIndex, 0, this.optionRows.length - 1));
        }
    }

    _syncBorders() {
        if (!this.frameEl) return;

        const size = this._measureCharSize();
        const spec = getLayoutSpec(this._mode, this._collapsed);
        const maxWidth = Math.min(window.innerWidth * spec.maxWidthVw, size.charWidth * spec.maxCols);
        const maxHeight = Math.min(window.innerHeight * spec.maxHeightVh, spec.maxHeightPx, window.innerHeight - 32);

        const cols = Math.max(spec.minCols, Math.floor(maxWidth / size.charWidth) - 2);
        const rows = Math.max(spec.minRows, Math.floor((maxHeight - size.lineHeight * 2) / size.lineHeight));

        const frameWidth = (cols + 2) * size.charWidth;
        const frameHeight = (rows + 2) * size.lineHeight;

        this.frameEl.style.width = `${frameWidth}px`;
        this.frameEl.style.height = `${frameHeight}px`;

        const lineTop = `╔${'═'.repeat(cols)}╗`;
        const lineBottom = `╚${'═'.repeat(cols)}╝`;

        if (this.borderTop) this.borderTop.textContent = lineTop;
        if (this.borderBottom) this.borderBottom.textContent = lineBottom;

        const side = new Array(rows).fill('║').join('\n');

        if (this.borderLeft) this.borderLeft.textContent = side;
        if (this.borderRight) this.borderRight.textContent = side;
    }

    _measureCharSize() {
        if (!this.frameEl) return { charWidth: 10, lineHeight: 16 };
        const span = document.createElement('span');
        span.textContent = '═';
        span.className = 'setup-border ui-offscreen';
        this.frameEl.appendChild(span);
        const rect = span.getBoundingClientRect();
        const style = this.borderTop ? getComputedStyle(this.borderTop) : getComputedStyle(this.frameEl);
        const fontSize = style ? parseFloat(style.fontSize) : 16;
        const lineHeight = style ? style.lineHeight : 'normal';
        const resolvedLineHeight = lineHeight === 'normal' ? fontSize : parseFloat(lineHeight);
        span.remove();
        return {
            charWidth: rect.width || 10,
            lineHeight: resolvedLineHeight || rect.height || 16
        };
    }
}

