// Cycles' UHD tile cache must remain isolated without inheriting deep job paths.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { blenderRuntimePath } from '../../../tools/baking/Blender.mjs';

test('Blender tile paths stay bounded and distinct for separate bake jobs', () => {
    const root = path.resolve('C:/Users/example/Projects/bus_simulator_worktrees/graphics');
    const stage = path.join(root, 'tests/artifacts/screens/ai556_bake_framework',
        'run-1789031339191-25336-aca52cf5/lighting/experiments/reference-matching/reference');
    const runtime = blenderRuntimePath(root, stage);
    const tile = path.join(runtime, 'blender_a13448/cycles-tile-buffer-29012-1782915599904-0-0.exr');
    assert.ok(tile.length < 260, tile);
    assert.ok(runtime.startsWith(path.join(root, 'tests/artifacts/screens') + path.sep));
    assert.equal(runtime, blenderRuntimePath(root, stage));
    assert.notEqual(runtime, blenderRuntimePath(root, stage + '-other-job'));
});
