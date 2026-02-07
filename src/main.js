// src/main.js
import { GameEngine } from './app/core/GameEngine.js';
import { StateMachine } from './app/core/StateMachine.js';

import { WelcomeState } from './states/WelcomeState.js';
import { SetupState } from './states/SetupState.js';
import { BusSelectState } from './states/BusSelectState.js';
import { TestModeState } from './states/TestModeState.js';
import { MapDebuggerState } from './states/MapDebuggerState.js';
import { GameplayState } from './states/GameplayState.js';
import { ConnectorDebuggerState } from './states/ConnectorDebuggerState.js';
import { RapierDebuggerState } from './states/rapier_debugger/RapierDebuggerState.js';
import { BuildingFabricationState } from './states/BuildingFabricationState.js';
import { BuildingFabrication2State } from './states/BuildingFabrication2State.js';
import { InspectorRoomState } from './states/InspectorRoomState.js';
import { MaterialCalibrationState } from './states/MaterialCalibrationState.js';
import { RoadDebuggerState } from './states/RoadDebuggerState.js';
import { OptionsState } from './states/OptionsState.js';
import { ensureGlobalPerfBar } from './graphics/gui/perf_bar/PerfBar.js';
import { installViewportContextMenuBlocker } from './graphics/gui/shared/utils/viewportContextMenuBlocker.js';

function isEditableTarget(target) {
    const el = target && typeof target === 'object' ? target : null;
    if (!el) return false;
    const tag = String(el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    return !!el.isContentEditable;
}

const perfBar = ensureGlobalPerfBar();

const canvas = document.getElementById('game-canvas');
const viewport = document.getElementById('game-viewport');

if (viewport) installViewportContextMenuBlocker(viewport);

const engine = new GameEngine({ canvas });
perfBar.setRenderer(engine.renderer);
engine.addFrameListener((frame) => perfBar.onFrame(frame));
const sm = new StateMachine();
window.__busSim = { engine, sm };
sm.register('welcome', new WelcomeState(engine, sm));
sm.register('setup', new SetupState(engine, sm));
sm.register('bus_select', new BusSelectState(engine, sm));
sm.register('test_mode', new TestModeState(engine, sm));
sm.register('map_debugger', new MapDebuggerState(engine, sm));
sm.register('game_mode', new GameplayState(engine, sm));
sm.register('connector_debugger', new ConnectorDebuggerState(engine, sm));
sm.register('rapier_debugger', new RapierDebuggerState(engine, sm));
sm.register('building_fabrication', new BuildingFabricationState(engine, sm));
sm.register('building_fabrication2', new BuildingFabrication2State(engine, sm));
sm.register('inspector_room', new InspectorRoomState(engine, sm));
sm.register('material_calibration', new MaterialCalibrationState(engine, sm));
sm.register('road_debugger', new RoadDebuggerState(engine, sm));
sm.register('options', new OptionsState(engine, sm));

engine.setStateMachine(sm);
engine.start();
sm.go('welcome');

window.addEventListener('keydown', (e) => {
    if (isEditableTarget(e.target)) return;
    const code = e.code;
    const key = e.key;
    const is0 = code === 'Digit0' || code === 'Numpad0' || key === '0';
    if (!is0) return;
    if (sm.currentName === 'options' || sm.isOverlayOpen('options')) return;
    e.preventDefault();
    sm.pushOverlay('options', { returnTo: sm.currentName || 'welcome' });
}, { passive: false, capture: true });
