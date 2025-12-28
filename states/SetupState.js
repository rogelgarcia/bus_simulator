// states/SetupState.js
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

        this.options = [
            { key: '1', label: 'City Mode', state: 'city' },
            { key: '2', label: 'Test Mode', state: 'test_mode' },
            { key: 'Q', label: 'Back', state: 'welcome' }
        ];

        this.optionRows = [];
        this.selectedIndex = 0;

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

        this._buildMenu();
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

    _buildMenu() {
        if (!this.menuEl && !this.menuBackEl) return;
        if ((this.menuEl?.childElementCount ?? 0) > 0 || (this.menuBackEl?.childElementCount ?? 0) > 0) return;

        for (const [index, option] of this.options.entries()) {
            const target = option.state === 'welcome' && this.menuBackEl ? this.menuBackEl : this.menuEl;
            if (!target) continue;

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
            this.optionRows.push({ row, button, indicator });
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
        const option = this.options[this.selectedIndex];
        if (option) this._go(option.state);
    }

    _moveSelection({ isUp, isDown, isLeft, isRight }) {
        if (!this.options.length) return;
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
            else if (next % cols === 0 && next + 1 < this.options.length) next += 1;
        }

        next = Math.max(0, Math.min(next, this.options.length - 1));
        if (next !== this.selectedIndex) this._setSelected(next);
    }

    _getMenuColumns() {
        if (!this.menuEl) return 1;
        return this.menuEl.classList.contains('two-col') ? 2 : 1;
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
        this.menuEl.classList.remove('two-col');
        const needsTwo = this.menuEl.scrollHeight > this.menuEl.clientHeight + 1;
        if (needsTwo) this.menuEl.classList.add('two-col');
    }

    _syncBorders() {
        if (!this.frameEl) return;

        const size = this._measureCharSize();
        const maxWidth = Math.min(window.innerWidth * 0.92, size.charWidth * 90);
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
        const sampleEl = this.borderTop ?? this.frameEl;
        const span = document.createElement('span');
        span.textContent = '═';
        span.style.position = 'absolute';
        span.style.visibility = 'hidden';
        span.style.padding = '0';
        span.style.margin = '0';
        if (sampleEl) {
            const style = getComputedStyle(sampleEl);
            span.style.fontFamily = style.fontFamily;
            span.style.fontSize = style.fontSize;
            span.style.fontWeight = style.fontWeight;
            span.style.letterSpacing = style.letterSpacing;
        }
        this.frameEl.appendChild(span);
        const rect = span.getBoundingClientRect();
        const style = sampleEl ? getComputedStyle(sampleEl) : null;
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
