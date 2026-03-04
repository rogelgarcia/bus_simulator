// src/graphics/gui/mesh_fabrication/services/cameraController.js

import * as THREE from 'three';

export function applyPerspectiveOrbitToCamera({
    camera,
    orbitTarget,
    orbitYaw,
    orbitPitch,
    orbitRadius
}) {
    const pitchCos = Math.cos(orbitPitch);
    const x = orbitTarget.x + Math.sin(orbitYaw) * pitchCos * orbitRadius;
    const y = orbitTarget.y + Math.sin(orbitPitch) * orbitRadius;
    const z = orbitTarget.z + Math.cos(orbitYaw) * pitchCos * orbitRadius;
    camera.position.set(x, y, z);
    camera.lookAt(orbitTarget);
    camera.updateProjectionMatrix();
}

export function panPerspectiveOrbitTarget({
    camera,
    orbitTarget,
    orbitRadius,
    dx,
    dy,
    panScaleFactor = 0.0022,
    yDirection = 1
}) {
    const forward = new THREE.Vector3().subVectors(orbitTarget, camera.position);
    if (forward.lengthSq() <= 1e-8) return;
    forward.normalize();

    const up = camera.up.clone().normalize();
    const right = new THREE.Vector3().crossVectors(forward, up).normalize();
    if (right.lengthSq() <= 1e-8) return;

    const panScale = orbitRadius * panScaleFactor;
    const tx = -dx * panScale;
    const ty = dy * yDirection * panScale;
    orbitTarget.addScaledVector(right, tx);
    orbitTarget.addScaledVector(up, ty);
}

export function configureOrthoCameraToBounds({
    camera,
    viewType,
    aspect,
    modelCenter,
    modelSize,
    auxZoom,
    orthoDistance,
    padding = 1.6
}) {
    const safeAspect = Math.max(0.0001, Number.isFinite(aspect) ? aspect : 1);
    const halfX = Math.max(0.001, modelSize.x * 0.5);
    const halfY = Math.max(0.001, modelSize.y * 0.5);
    const halfZ = Math.max(0.001, modelSize.z * 0.5);

    let modelHalfW = halfX;
    let modelHalfH = halfY;
    switch (viewType) {
        case 'left':
        case 'right':
            modelHalfW = halfZ;
            modelHalfH = halfY;
            break;
        case 'top':
        case 'bottom':
            modelHalfW = halfX;
            modelHalfH = halfZ;
            break;
        case 'front':
        case 'back':
        default:
            modelHalfW = halfX;
            modelHalfH = halfY;
            break;
    }

    const fitHalf = Math.max(modelHalfH * padding, (modelHalfW * padding) / safeAspect);
    const zoomHalf = fitHalf / Math.max(0.001, auxZoom);
    camera.left = -zoomHalf * safeAspect;
    camera.right = zoomHalf * safeAspect;
    camera.top = zoomHalf;
    camera.bottom = -zoomHalf;

    const dist = orthoDistance;
    const y = modelCenter.y;
    camera.up.set(0, 1, 0);

    switch (viewType) {
        case 'left':
            camera.position.set(modelCenter.x - dist, y, modelCenter.z);
            break;
        case 'right':
            camera.position.set(modelCenter.x + dist, y, modelCenter.z);
            break;
        case 'front':
            camera.position.set(modelCenter.x, y, modelCenter.z + dist);
            break;
        case 'back':
            camera.position.set(modelCenter.x, y, modelCenter.z - dist);
            break;
        case 'top':
            camera.position.set(modelCenter.x, modelCenter.y + dist, modelCenter.z);
            camera.up.set(0, 0, -1);
            break;
        case 'bottom':
            camera.position.set(modelCenter.x, modelCenter.y - dist, modelCenter.z);
            camera.up.set(0, 0, 1);
            break;
        default:
            camera.position.set(modelCenter.x, y, modelCenter.z + dist);
            break;
    }

    const near = Math.max(0.01, dist - (modelSize.length() + 8));
    const far = dist + modelSize.length() + 30;
    camera.near = near;
    camera.far = far;
    camera.lookAt(modelCenter);
    camera.updateProjectionMatrix();
}
