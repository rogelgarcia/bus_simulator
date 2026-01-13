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
import { MeshInspectorState } from './states/MeshInspectorState.js';
import { TextureInspectorState } from './states/TextureInspectorState.js';
import { DebugCorners2State } from './states/DebugCorners2State.js';

const canvas = document.getElementById('game-canvas');

const engine = new GameEngine({ canvas });
const sm = new StateMachine();

sm.register('welcome', new WelcomeState(engine, sm));
sm.register('setup', new SetupState(engine, sm));
sm.register('bus_select', new BusSelectState(engine, sm));
sm.register('test_mode', new TestModeState(engine, sm));
sm.register('map_debugger', new MapDebuggerState(engine, sm));
sm.register('game_mode', new GameplayState(engine, sm));
sm.register('connector_debugger', new ConnectorDebuggerState(engine, sm));
sm.register('rapier_debugger', new RapierDebuggerState(engine, sm));
sm.register('building_fabrication', new BuildingFabricationState(engine, sm));
sm.register('mesh_inspector', new MeshInspectorState(engine, sm));
sm.register('texture_inspector', new TextureInspectorState(engine, sm));
sm.register('debug_corners2', new DebugCorners2State(engine, sm));

engine.setStateMachine(sm);
engine.start();
sm.go('welcome');
