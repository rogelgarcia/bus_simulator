// src/states/SetupState.js
import { getSelectableSceneShortcuts } from './SceneShortcutRegistry.js';

export class SetupState {
    constructor(engine, sm) {
        this.engine = engine;
        this.sm = sm;

        this.uiWelcome = document.getElementById('ui-welcome');
        this.uiSelect = document.getElementById('ui-select');
        this.uiSetup = document.getElementById('ui-setup');

        this.frameEl = this.uiSetup?.querySelector('#setup-frame') ?? null;
        this.menuEl = this.uiSetup?.querySelector('#setup-menu') ?? null;
        this.menuBackEl = this.uiSetup?.querySelector('#setup-menu-back') ?? null;

        this.borderTop = this.uiSetup?.querySelector('#setup-border-top') ?? null;
        this.borderBottom = this.uiSetup?.querySelector('#setup-border-bottom') ?? null;
        this.borderLeft = this.uiSetup?.querySelector('#setup-border-left') ?? null;
        this.borderRight = this.uiSetup?.querySelector('#setup-border-right') ?? null;

        const scenes = getSelectableSceneShortcuts();
        this.options = [
            ...scenes.map((scene) => ({ key: scene.key, label: scene.label, state: scene.id })),
            { key: 'Q', label: 'Back', state: 'welcome' }
        ];

        this.optionRows = [];
        this.selectedIndex = 0;
        this._menuColumns = 1;

        this._onKeyDown = (e) => this._handleKeyDown(e);
        this._onResize = () => this._syncLayout();
    }

    enter() {
        document.body.classList.remove('splash-bg');
        document.body.classList.add('setup-bg');

        if (this.uiSelect) this.uiSelect.classList.add('hidden');
        if (this.uiWelcome) this.uiWelcome.classList.add('hidden');
        if (this.uiSetup) this.uiSetup.classList.remove('hidden');

        this.engine.clearScene();

        this._buildMenu({ force: true });
        this.selectedIndex = 0;
        this._setSelected(this.selectedIndex);

        requestAnimationFrame(() => {
            this._syncLayout();
        });

        if (document.fonts?.ready) {
            document.fonts.ready.then(() => this._syncLayout());
        }

        window.addEventListener('keydown', this._onKeyDown, { passive: false });
        window.addEventListener('resize', this._onResize);
    }

    exit() {
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('resize', this._onResize);

        document.body.classList.remove('setup-bg');
        if (this.uiSetup) this.uiSetup.classList.add('hidden');
    }

    _buildMenu({ force = false, preserveSelection = false } = {}) {
        if (!this.menuEl && !this.menuBackEl) return;
        if (!force && ((this.menuEl?.childElementCount ?? 0) > 0 || (this.menuBackEl?.childElementCount ?? 0) > 0)) return;

        const prevKey = preserveSelection ? (this.optionRows[this.selectedIndex]?.button?.dataset?.key ?? null) : null;

        if (this.menuEl) this.menuEl.textContent = '';
        if (this.menuBackEl) this.menuBackEl.textContent = '';
        this.optionRows = [];

        const cols = this._getMenuColumns();
        const main = this.options.filter((opt) => opt?.state !== 'welcome');
        const back = this.options.find((opt) => opt?.state === 'welcome') ?? null;

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
            const target = option.state === 'welcome' && this.menuBackEl ? this.menuBackEl : this.menuEl;
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
            button.dataset.state = option.state;
            button.dataset.key = option.key;

            const num = document.createElement('span');
            num.className = 'setup-option-num';
            num.textContent = `[${option.key}]`;

            const label = document.createElement('span');
            label.className = 'setup-option-label';
            label.textContent = option.label;

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
                this._go(option.state);
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
        const key = e.key;
        const code = e.code;

        if (code === 'Escape' || key === 'Escape') {
            e.preventDefault();
            this.sm.go('welcome');
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
            this.sm.go('welcome');
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

        const typed = typeof key === 'string' ? key.toUpperCase() : '';
        const option = this.options.find((opt) => opt.key.toUpperCase() === typed);
        if (option) {
            e.preventDefault();
            this._go(option.state);
        }
    }

    _go(state) {
        this.sm.go(state);
    }

    _activateSelected() {
        const option = this.optionRows[this.selectedIndex]?.option ?? null;
        if (option) this._go(option.state);
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

        next = Math.max(0, Math.min(next, this.optionRows.length - 1));
        if (next !== this.selectedIndex) this._setSelected(next);
    }

    _getMenuColumns() {
        return this._menuColumns;
    }

    _setSelected(index) {
        if (!this.optionRows.length) return;
        const next = Math.max(0, Math.min(index, this.optionRows.length - 1));
        this.selectedIndex = next;

        for (const [i, row] of this.optionRows.entries()) {
            const active = i === next;
            row.row.classList.toggle('is-selected', active);
            row.button.classList.toggle('is-selected', active);
            row.indicator.textContent = active ? '■' : '□';
        }

        const button = this.optionRows[next]?.button;
        button?.focus?.({ preventScroll: true });
    }

    _syncLayout() {
        this._syncBorders();
        this._syncMenuColumns();
    }

    _syncMenuColumns() {
        if (!this.menuEl) return;
        const mainCount = this.options.filter((opt) => opt?.state !== 'welcome').length;
        const width = this.frameEl?.getBoundingClientRect?.().width ?? window.innerWidth;
        const wantsTwo = mainCount > 4 && width >= 640;
        const nextCols = wantsTwo ? 2 : 1;
        const changed = nextCols !== this._menuColumns;
        this._menuColumns = nextCols;
        this.menuEl.classList.toggle('two-col', wantsTwo);
        if (changed) {
            this._buildMenu({ force: true, preserveSelection: true });
            this._setSelected(Math.max(0, Math.min(this.selectedIndex, this.optionRows.length - 1)));
        }
    }

    _syncBorders() {
        if (!this.frameEl) return;

        const size = this._measureCharSize();
        const maxWidth = Math.min(window.innerWidth * 0.96, size.charWidth * 110);
        const maxHeight = Math.min(window.innerHeight * 0.8, 620, window.innerHeight - 32);

        const cols = Math.max(20, Math.floor(maxWidth / size.charWidth) - 2);
        const rows = Math.max(6, Math.floor((maxHeight - size.lineHeight * 2) / size.lineHeight));

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
