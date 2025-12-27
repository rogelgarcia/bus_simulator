// src/main.js
import { GameEngine } from './core/GameEngine.js';
import { StateMachine } from './core/StateMachine.js';

import { WelcomeState } from '../states/WelcomeState.js';
import { BusSelectState } from '../states/BusSelectState.js';
import { TestModeState } from '../states/TestModeState.js';
import { CityState } from '../states/CityState.js';
import { GameplayState } from '../states/GameplayState.js';

const canvas = document.getElementById('game-canvas');

const engine = new GameEngine({ canvas });
const sm = new StateMachine();

sm.register('welcome', new WelcomeState(engine, sm));
sm.register('bus_select', new BusSelectState(engine, sm));
sm.register('test_mode', new TestModeState(engine, sm));
sm.register('city', new CityState(engine, sm));
sm.register('game_mode', new GameplayState(engine, sm));

engine.setStateMachine(sm);
engine.start();
sm.go('welcome');
