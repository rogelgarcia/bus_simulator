// src/states/SetupState.js
import { getSelectableSceneShortcuts } from './SceneShortcutRegistry.js';
import { SetupUIController } from '../graphics/gui/setup/SetupUIController.js';

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

        const scenes = getSelectableSceneShortcuts().map((scene) => ({
            key: scene.key,
            label: scene.label,
            state: scene.id
        }));

        this._ui.open({
            mode: 'state',
            sceneItems: scenes,
            closeItem: { key: 'Q', label: 'Back' },
            onSelectState: (state) => this.sm.go(state),
            onRequestClose: () => this.sm.go('welcome')
        });
    }

    exit() {
        document.body.classList.remove('setup-bg');
        this._ui.close();
    }
}
