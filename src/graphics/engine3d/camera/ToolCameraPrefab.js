// src/graphics/engine3d/camera/ToolCameraPrefab.js
// Factory helpers for ToolCameraController with consistent defaults and per-view home pose initialization.
import * as THREE from 'three';
import { ToolCameraController } from './ToolCameraController.js';

export function getDefaultToolCameraHomeDirection() {
    return new THREE.Vector3(0.55, 0.32, 0.72).normalize();
}

export function getTopDownToolCameraHomeDirection() {
    return new THREE.Vector3(0.0, 1.0, 0.06).normalize();
}

function applyInitialPose(controls, initialPose) {
    if (!controls) return false;
    if (!initialPose) return false;

    const pose = typeof initialPose === 'function' ? initialPose({ controls, camera: controls.camera }) : initialPose;
    if (!pose || typeof pose !== 'object') return false;

    const orbit = pose.orbit ?? null;
    if (orbit && typeof orbit === 'object' && typeof controls.setOrbit === 'function') {
        controls.setOrbit(orbit, { immediate: true });
        return true;
    }

    const position = pose.position ?? null;
    const target = pose.target ?? null;
    if (position || target) {
        controls.setLookAt({ position, target });
        return true;
    }

    return false;
}

export function createToolCameraController(camera, canvas, {
    uiRoot = null,
    enabled = true,
    enableDamping = true,
    dampingFactor = 0.08,
    rotateSpeed = 1.0,
    panSpeed = 1.0,
    zoomSpeed = 1.0,
    minDistance = 0.1,
    maxDistance = 1e6,
    minPolarAngle = 0.12,
    maxPolarAngle = Math.PI / 2.05,
    orbitMouseButtons = null,
    panMouseButtons = null,
    shiftPanFromOrbitButtons = true,
    getFocusTarget = null,
    initialPose = null
} = {}) {
    const controls = new ToolCameraController(camera, canvas, {
        uiRoot,
        enabled,
        enableDamping,
        dampingFactor,
        rotateSpeed,
        panSpeed,
        zoomSpeed,
        minDistance,
        maxDistance,
        minPolarAngle,
        maxPolarAngle,
        orbitMouseButtons,
        panMouseButtons,
        shiftPanFromOrbitButtons,
        getFocusTarget
    });

    applyInitialPose(controls, initialPose);
    controls.setHomeFromCurrent();

    return controls;
}
