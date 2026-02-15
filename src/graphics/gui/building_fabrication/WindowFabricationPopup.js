// src/graphics/gui/building_fabrication/WindowFabricationPopup.js
// Popup wrapper around the shared Window Fabrication editor (viewport + controls).
// @ts-check

import { WindowFabricationView } from '../window_fabrication/WindowFabricationView.js';

function isInteractiveElement(target) {
    const tag = target?.tagName;
    if (!tag) return false;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || target?.isContentEditable;
}

export class WindowFabricationPopup {
    constructor() {
        this._overlay = document.createElement('div');
        this._overlay.className = 'ui-picker-overlay hidden building-fab-window-fab-overlay';

        this._panel = document.createElement('div');
        this._panel.className = 'ui-panel is-interactive building-fab-window-fab-panel';
        this._overlay.appendChild(this._panel);

        this._layout = document.createElement('div');
        this._layout.className = 'building-fab-window-fab-layout';
        this._panel.appendChild(this._layout);

        this._viewport = document.createElement('div');
        this._viewport.className = 'building-fab-window-fab-viewport';
        this._layout.appendChild(this._viewport);

        this._canvas = document.createElement('canvas');
        this._canvas.className = 'building-fab-window-fab-canvas';
        this._viewport.appendChild(this._canvas);

        this._options = document.createElement('div');
        this._options.className = 'building-fab-window-fab-options';
        this._layout.appendChild(this._options);

        this._view = null;
        this._onSettingsChange = null;
        this._panelClassName = '';

        this._onOverlayClick = (e) => this._handleOverlayClick(e);
        this._onKeyDown = (e) => this._handleKeyDown(e);
    }

    isOpen() {
        return this._overlay.isConnected && !this._overlay.classList.contains('hidden');
    }

    open({
        title = null,
        subtitle = null,
        initialSettings = null,
        onSettingsChange = null,
        popupClassName = '',
        wallSpec = null,
        previewGrid = null
    } = {}) {
        this.close();

        this._onSettingsChange = typeof onSettingsChange === 'function' ? onSettingsChange : null;
        this._panelClassName = typeof popupClassName === 'string' ? popupClassName.trim() : '';
        if (this._panelClassName) this._panel.classList.add(this._panelClassName);
        if (!this._overlay.isConnected) document.body.appendChild(this._overlay);
        this._overlay.classList.remove('hidden');
        this._overlay.addEventListener('click', this._onOverlayClick);
        window.addEventListener('keydown', this._onKeyDown, { passive: false });

        const uiTitle = typeof title === 'string' && title.trim() ? title.trim() : 'Window Fabrication';
        const uiSubtitle = typeof subtitle === 'string' ? subtitle : undefined;

        this._view = new WindowFabricationView({
            canvas: this._canvas,
            uiParent: this._options,
            uiEmbedded: true,
            uiTitle,
            uiSubtitle,
            initialSettings,
            wallSpec,
            previewGrid,
            onSettingsChange: (settings) => this._onSettingsChange?.(settings),
            onClose: () => this.close()
        });

        this._view.start().catch((err) => {
            console.error('[WindowFabricationPopup] Failed to start WindowFabricationView', err);
            this.close();
        });
    }

    close() {
        if (this._view) {
            this._view.destroy();
            this._view = null;
        }

        if (this._overlay.isConnected) {
            this._overlay.classList.add('hidden');
            this._overlay.removeEventListener('click', this._onOverlayClick);
            window.removeEventListener('keydown', this._onKeyDown);
        }
        if (this._panelClassName) this._panel.classList.remove(this._panelClassName);

        this._onSettingsChange = null;
        this._panelClassName = '';
    }

    dispose() {
        this.close();
        this._overlay.remove();
    }

    _handleOverlayClick(e) {
        if (!e) return;
        if (e.target === this._overlay) this.close();
    }

    _handleKeyDown(e) {
        if (!e) return;
        if (e.code !== 'Escape' && e.key !== 'Escape') return;
        if (isInteractiveElement(e.target) || isInteractiveElement(document.activeElement)) return;
        e.preventDefault();
        this.close();
    }
}
