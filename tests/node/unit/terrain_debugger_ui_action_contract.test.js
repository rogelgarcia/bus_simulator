// Node unit tests: Terrain debugger UI action contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    TerrainDebuggerUiActionType,
    createTerrainDebuggerCameraPresetAction,
    createTerrainDebuggerStateChangedAction,
    isTerrainDebuggerUiAction
} from '../../../src/graphics/gui/terrain_debugger/view/contracts/TerrainDebuggerUiActionContract.js';

test('TerrainDebuggerUiActionContract: creates typed state action payload', () => {
    const state = { tab: 'terrain', camera: { presetId: 'low' } };
    const action = createTerrainDebuggerStateChangedAction(state);

    assert.equal(action.type, TerrainDebuggerUiActionType.STATE_CHANGED);
    assert.equal(isTerrainDebuggerUiAction(action), true);
    assert.equal(action.payload.state, state);
});

test('TerrainDebuggerUiActionContract: creates camera preset action', () => {
    const action = createTerrainDebuggerCameraPresetAction('behind_gameplay');
    assert.equal(action.type, TerrainDebuggerUiActionType.CAMERA_PRESET);
    assert.equal(action.payload.presetId, 'behind_gameplay');
    assert.equal(isTerrainDebuggerUiAction(action), true);
});

test('TerrainDebuggerUiActionContract: rejects invalid action shape', () => {
    assert.equal(isTerrainDebuggerUiAction(null), false);
    assert.equal(isTerrainDebuggerUiAction({}), false);
    assert.equal(isTerrainDebuggerUiAction({ type: '', payload: {} }), false);
    assert.equal(isTerrainDebuggerUiAction({ type: TerrainDebuggerUiActionType.RESET_CAMERA, payload: null }), false);
});
