// src/states/SetupState.js
import { getSelectableSceneShortcuts } from './SceneShortcutRegistry.js';
import { getDebugToolShortcuts } from './DebugToolRegistry.js';
import { SetupUIController } from '../graphics/gui/setup/SetupUIController.js';

const DEBUGS_MENU_STATE = '__debugs__';
const DEBUGS_MENU_KEY = '8';

export class SetupState {
    constructor(engine, sm) {
        this.engine = engine;
        this.sm = sm;

        this.uiWelcome = document.getElementById('ui-welcome');
        this.uiSelect = document.getElementById('ui-select');
        this._ui = new SetupUIController();
    }

    enter() {
        document.body.classList.remove('splash-bg');
        document.body.classList.add('setup-bg');

        if (this.uiSelect) this.uiSelect.classList.add('hidden');
        if (this.uiWelcome) this.uiWelcome.classList.add('hidden');

        this.engine.clearScene();
        this._openMainMenu();
    }

    exit() {
        document.body.classList.remove('setup-bg');
        this._ui.close();
    }

    _openMainMenu() {
        const scenes = getSelectableSceneShortcuts().map((scene) => ({
            key: scene.key,
            label: scene.label,
            state: scene.id
        }));

        scenes.push({
            key: DEBUGS_MENU_KEY,
            label: 'Debugs',
            description: 'Isolated debug screens',
            state: DEBUGS_MENU_STATE
        });

        this._ui.open({
            mode: 'state',
            sceneItems: scenes,
            closeItem: { key: 'Q', label: 'Back' },
            onSelectState: (state) => {
                const id = typeof state === 'string' ? state : '';
                if (id === DEBUGS_MENU_STATE) {
                    this._openDebugsMenu();
                    return;
                }
                this.sm.go(id);
            },
            onRequestClose: () => this.sm.go('welcome')
        });
    }

    _openDebugsMenu() {
        const tools = getDebugToolShortcuts().map((tool) => ({
            key: tool.key,
            label: tool.label,
            description: tool.description,
            state: tool.href
        }));

        this._ui.open({
            mode: 'state',
            sceneItems: tools,
            closeItem: { key: 'Q', label: 'Back' },
            onSelectState: (href) => this._navigateToDebugTool(href),
            onRequestClose: () => this._openMainMenu()
        });
    }

    _navigateToDebugTool(href) {
        const raw = typeof href === 'string' ? href : '';
        if (!raw) return;
        const url = new URL(raw, window.location.href).toString();
        window.location.assign(url);
    }
}
