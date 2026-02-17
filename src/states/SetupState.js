// src/states/SetupState.js
import { Q_MENU_GROUP } from './SceneShortcutRegistry.js';
import {
    getQMenuGroupMenuItems,
    getQMenuQuickShortcutByKey,
    getQMenuScreenMenuItemsByGroup
} from './QMenuScreenRegistry.js';
import { SetupUIController } from '../graphics/gui/setup/SetupUIController.js';

function normalizeMenuId(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export class SetupState {
    constructor(engine, sm) {
        this.engine = engine;
        this.sm = sm;

        this.uiWelcome = document.getElementById('ui-welcome');
        this.uiSelect = document.getElementById('ui-select');
        this._ui = new SetupUIController();
    }

    enter(params = {}) {
        document.body.classList.remove('splash-bg');
        document.body.classList.add('setup-bg');

        if (this.uiSelect) this.uiSelect.classList.add('hidden');
        if (this.uiWelcome) this.uiWelcome.classList.add('hidden');

        this.engine.clearScene();
        const initialMenu = normalizeMenuId(params?.initialMenu);
        if (initialMenu === 'debugs' || initialMenu === 'debugger' || initialMenu === 'debuggers') {
            this._openGroupMenu(Q_MENU_GROUP.debuggers, { returnToWelcome: true });
            return;
        }
        if (initialMenu === Q_MENU_GROUP.fabrication) {
            this._openGroupMenu(Q_MENU_GROUP.fabrication, { returnToWelcome: true });
            return;
        }
        this._openRootMenu();
    }

    exit() {
        document.body.classList.remove('setup-bg');
        this._ui.close();
    }

    _openRootMenu() {
        this._ui.open({
            mode: 'state',
            sceneItems: getQMenuGroupMenuItems(),
            closeItem: { key: 'Q', label: 'Back' },
            onSelectState: (groupId) => this._openGroupMenu(groupId),
            onRequestClose: () => this.sm.go('welcome'),
            onShortcutKey: (key) => this._handleQuickShortcut(key)
        });
    }

    _openGroupMenu(groupId, { returnToWelcome = false } = {}) {
        const selectedGroup = groupId === Q_MENU_GROUP.debuggers ? Q_MENU_GROUP.debuggers : Q_MENU_GROUP.fabrication;
        const tools = getQMenuScreenMenuItemsByGroup(selectedGroup);

        if (!tools.length) {
            console.warn(`[SetupState] No Q-menu screens registered for group '${selectedGroup}'.`);
            if (returnToWelcome) this.sm.go('welcome');
            else this._openRootMenu();
            return;
        }

        this._ui.open({
            mode: 'state',
            sceneItems: tools,
            closeItem: { key: 'Q', label: 'Back' },
            onSelectState: (href) => this._navigateToScreen(href),
            onRequestClose: () => (returnToWelcome ? this.sm.go('welcome') : this._openRootMenu())
        });
    }

    _handleQuickShortcut(key) {
        const href = getQMenuQuickShortcutByKey(key);
        if (!href) return false;
        this._navigateToScreen(href);
        return true;
    }

    _navigateToScreen(href) {
        const raw = typeof href === 'string' ? href : '';
        if (!raw) return;
        const url = new URL(raw, window.location.href);
        const currentParams = new URLSearchParams(window.location.search);
        for (const [key, value] of currentParams.entries()) {
            if (key === 'screen') continue;
            if (!url.searchParams.has(key)) url.searchParams.set(key, value);
        }
        window.location.assign(url.toString());
    }
}
