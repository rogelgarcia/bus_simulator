// src/graphics/gui/mesh_fabrication/meshBooleanKernelManifold.js
// Manifold kernel bootstrap and readiness probe for mesh-fabrication booleans.

import createManifoldModule from 'manifold-3d';

export const MANIFOLD_BOOLEAN_KERNEL_CONTRACT = Object.freeze({
    kernelId: 'manifold-3d',
    module: 'manifold-3d',
    integrationVersion: 'mesh-boolean-kernel-manifold.v1',
    probe: 'cube_subtract_returns_triangles'
});

const manifoldModule = await createManifoldModule();
if (!manifoldModule || typeof manifoldModule !== 'object') {
    throw new Error('[MeshBooleanKernelManifold] Failed to initialize manifold module.');
}
if (typeof manifoldModule.setup === 'function') {
    manifoldModule.setup();
}

let probeCompleted = false;

function assertProbeMesh(mesh) {
    const triVerts = mesh?.triVerts;
    if (!(triVerts instanceof Uint32Array) || triVerts.length < 3) {
        throw new Error('[MeshBooleanKernelManifold] Probe failed: no output triangles from manifold subtract.');
    }
}

function runProbe() {
    if (probeCompleted) return;
    let a = null;
    let b = null;
    let out = null;
    try {
        a = manifoldModule.Manifold.cube([1, 1, 1], true);
        b = manifoldModule.Manifold.cube([1, 1, 1], true).translate([0.35, 0, 0]);
        out = a.subtract(b);
        assertProbeMesh(out.getMesh());
        probeCompleted = true;
    } finally {
        if (out && typeof out.delete === 'function') out.delete();
        if (b && typeof b.delete === 'function') b.delete();
        if (a && typeof a.delete === 'function') a.delete();
    }
}

export function ensureManifoldBooleanKernelReady() {
    runProbe();
    return manifoldModule;
}

export function getManifoldBooleanKernelStatus() {
    return Object.freeze({
        kernelId: MANIFOLD_BOOLEAN_KERNEL_CONTRACT.kernelId,
        initialized: !!manifoldModule,
        probeCompleted
    });
}
