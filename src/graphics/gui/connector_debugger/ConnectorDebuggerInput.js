// src/graphics/gui/connector_debugger/ConnectorDebuggerInput.js
// Handles input and camera updates for the connector debugger.
import * as THREE from 'three';

function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
}

function setPointerFromEvent(view, e) {
    const rect = view.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    view.pointer.set(x * 2 - 1, -(y * 2 - 1));
}

function intersectGround(view) {
    view.raycaster.setFromCamera(view.pointer, view.engine.camera);
    const hit = new THREE.Vector3();
    const ok = view.raycaster.ray.intersectPlane(view.dragPlane, hit);
    return ok ? hit : null;
}

function pickCurb(view) {
    view.raycaster.setFromCamera(view.pointer, view.engine.camera);
    const hits = view.raycaster.intersectObjects(view._curbMeshes, false);
    if (!hits.length) return null;
    const obj = hits[0].object;
    return obj.userData?.debugCurb ?? null;
}

function updateHover(view) {
    view.raycaster.setFromCamera(view.pointer, view.engine.camera);
    const hits = view.raycaster.intersectObjects(view._curbMeshes, false);
    if (!hits.length) {
        view._hoveredCurb = null;
        return;
    }
    const obj = hits[0].object;
    view._hoveredCurb = obj.userData?.debugCurb ?? null;
}

export function setupCamera(view) {
    const cam = view.engine.camera;
    const size = view.city?.config?.size ?? 1;
    const fovRad = cam.fov * Math.PI / 180;
    const aspect = cam.aspect || 1;
    const hFov = 2 * Math.atan(Math.tan(fovRad * 0.5) * aspect);
    const viewHalf = size * 0.45;
    view._zoomMin = Math.max(3, size * 0.03);
    view._zoomMax = size * 1.25;
    const zoomV = viewHalf / Math.tan(fovRad * 0.5);
    const zoomH = viewHalf / Math.tan(hFov * 0.5);
    view._zoom = clamp(Math.max(zoomV, zoomH), view._zoomMin, view._zoomMax);
    view._moveSpeed = size * 0.12;
    view._zoomSpeed = size * 0.6;
    cam.position.set(0, view._zoom, 0);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(-Math.PI * 0.5, 0, 0);
}

export function attachEvents(view) {
    view.canvas?.addEventListener('pointerdown', view._onPointerDown);
    window.addEventListener('pointermove', view._onPointerMove, { passive: true });
    window.addEventListener('pointerup', view._onPointerUp, { passive: true });
    window.addEventListener('keydown', view._onKeyDown, { passive: false });
    window.addEventListener('keyup', view._onKeyUp, { passive: false });
}

export function detachEvents(view) {
    view.canvas?.removeEventListener('pointerdown', view._onPointerDown);
    window.removeEventListener('pointermove', view._onPointerMove);
    window.removeEventListener('pointerup', view._onPointerUp);
    window.removeEventListener('keydown', view._onKeyDown);
    window.removeEventListener('keyup', view._onKeyUp);
}

export function handlePointerMove(view, e) {
    if (!view._inputEnabled) return;
    if (view.panel?.root?.contains(e.target) || view.shortcutsPanel?.root?.contains(e.target)) {
        view._hoveredCurb = null;
        return;
    }
    setPointerFromEvent(view, e);
    if (view._isDragging && view._activeCurb) {
        const hit = intersectGround(view);
        if (hit) {
            const nextX = hit.x + view._dragOffset.x;
            const nextZ = hit.z + view._dragOffset.z;
            const pos = view._activeCurb.mesh.position;
            if (Math.abs(pos.x - nextX) > 1e-6 || Math.abs(pos.z - nextZ) > 1e-6) {
                view._activeCurb.mesh.position.set(nextX, view._curbY, nextZ);
                view._lastDragMoveTime = performance.now();
                view._dragIdleReset = false;
                view._markInteraction();
            }
        }
    }
    updateHover(view);
}

export function handlePointerDown(view, e) {
    if (!view._inputEnabled) return;
    if (e.button !== 0) return;
    if (view.panel?.root?.contains(e.target) || view.shortcutsPanel?.root?.contains(e.target)) return;
    setPointerFromEvent(view, e);
    const pick = pickCurb(view);
    if (!pick) return;
    view._activeCurb = pick;
    view._isDragging = true;
    view._lastDragMoveTime = performance.now();
    view._dragIdleReset = false;
    const hit = intersectGround(view);
    if (hit) {
        view._dragOffset.set(
            pick.mesh.position.x - hit.x,
            0,
            pick.mesh.position.z - hit.z
        );
    }
    view._markInteraction();
}

export function handlePointerUp(view) {
    if (!view._inputEnabled) return;
    if (!view._isDragging) return;
    view._isDragging = false;
    view._activeCurb = null;
    view._dragOffset.set(0, 0, 0);
    view._lastInteractionTime = performance.now();
    view._requestHardReset();
}

export function handleKeyDown(view, e) {
    const tag = e.target?.tagName?.toLowerCase?.();
    if (tag === 'input' || tag === 'textarea') return;
    const code = e.code;
    if (code === 'KeyT') {
        e.preventDefault();
        if (!view._tourActive) view._startTour();
        return;
    }
    if (!view._inputEnabled) return;
    if (code in view._keys) {
        e.preventDefault();
        view._keys[code] = true;
    }
    if (!view._rotationModeHold && view._hoveredCurb && (code === 'KeyQ' || code === 'KeyW')) {
        e.preventDefault();
        const dir = code === 'KeyQ' ? 1 : -1;
        view._hoveredCurb.mesh.rotation.y += dir * view._rotationStep;
        view._markInteraction();
        view._requestHardReset();
    }
}

export function handleKeyUp(view, e) {
    const tag = e.target?.tagName?.toLowerCase?.();
    if (tag === 'input' || tag === 'textarea') return;
    if (!view._inputEnabled) return;
    const code = e.code;
    if (code in view._keys) {
        e.preventDefault();
        view._keys[code] = false;
    }
    if (view._rotationModeHold && (code === 'KeyQ' || code === 'KeyW')) {
        view._lastInteractionTime = performance.now();
    }
    if (code === 'KeyQ' || code === 'KeyW') {
        view._requestHardReset();
    }
}

export function updateCamera(view, dt) {
    const cam = view.engine.camera;
    const move = new THREE.Vector3();
    if (view._keys.ArrowUp) move.z -= 1;
    if (view._keys.ArrowDown) move.z += 1;
    if (view._keys.ArrowRight) move.x += 1;
    if (view._keys.ArrowLeft) move.x -= 1;
    if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(view._moveSpeed * dt);
        cam.position.add(move);
    }
    let zoomDir = 0;
    if (view._keys.KeyA && !view._isDragging) zoomDir -= 1;
    if (view._keys.KeyZ) zoomDir += 1;
    if (zoomDir !== 0) {
        view._zoom = clamp(view._zoom + zoomDir * view._zoomSpeed * dt, view._zoomMin, view._zoomMax);
    }
    cam.position.y = view._zoom;
    cam.rotation.order = 'YXZ';
    cam.rotation.set(-Math.PI * 0.5, 0, 0);
}

export function updateRotation(view, dt) {
    let dir = 0;
    if (view._rotationModeHold && view._hoveredCurb) {
        if (view._keys.KeyQ) dir += 1;
        if (view._keys.KeyW) dir -= 1;
        if (dir !== 0) {
            view._hoveredCurb.mesh.rotation.y += dir * view._rotationSpeed * dt;
            view._markInteraction();
        }
    }
    view._isRotating = view._rotationModeHold && view._hoveredCurb && dir !== 0;
}
