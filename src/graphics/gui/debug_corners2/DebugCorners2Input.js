// src/graphics/gui/debug_corners2/DebugCorners2Input.js
// Input + camera controls for Debug Corners 2 (drag roads, drag camera, rotate hovered).
import * as THREE from 'three';

const EPS = 1e-6;

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

function isInteractiveElement(target) {
    const tag = target?.tagName;
    if (!tag) return false;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || target?.isContentEditable;
}

function setPointerFromEvent(view, e) {
    const rect = view.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    view.pointer.set(x * 2 - 1, -(y * 2 - 1));
}

function intersectPlane(view) {
    view.raycaster.setFromCamera(view.pointer, view.engine.camera);
    const hit = new THREE.Vector3();
    const ok = view.raycaster.ray.intersectPlane(view.hoverPlane, hit);
    return ok ? hit : null;
}

function isPointerOverUI(view, target) {
    const roots = [
        view.optionsPanel?.root ?? null,
        view.legendPanel?.root ?? null,
        view.telemetryPanel?.root ?? null
    ].filter(Boolean);
    return roots.some((root) => root.contains(target));
}

function pickRoad(view) {
    view.raycaster.setFromCamera(view.pointer, view.engine.camera);
    const hits = view.raycaster.intersectObjects(view._roadMeshes ?? [], false);
    if (!hits.length) return null;
    const obj = hits[0]?.object ?? null;
    return obj?.userData?.debugRoadKey ?? null;
}

function updateHover(view) {
    view.raycaster.setFromCamera(view.pointer, view.engine.camera);
    const hits = view.raycaster.intersectObjects(view._roadMeshes ?? [], false);
    if (!hits.length) {
        view._hoveredRoadKey = null;
        return;
    }
    view._hoveredRoadKey = hits[0]?.object?.userData?.debugRoadKey ?? null;
}

export function setupCamera(view) {
    const cam = view.engine.camera;
    const size = 220;
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
    view.canvas?.addEventListener('wheel', view._onWheel, { passive: false });
    window.addEventListener('pointermove', view._onPointerMove, { passive: true });
    window.addEventListener('pointerup', view._onPointerUp, { passive: true });
    window.addEventListener('keydown', view._onKeyDown, { passive: false });
    window.addEventListener('keyup', view._onKeyUp, { passive: false });
}

export function detachEvents(view) {
    view.canvas?.removeEventListener('pointerdown', view._onPointerDown);
    view.canvas?.removeEventListener('wheel', view._onWheel);
    window.removeEventListener('pointermove', view._onPointerMove);
    window.removeEventListener('pointerup', view._onPointerUp);
    window.removeEventListener('keydown', view._onKeyDown);
    window.removeEventListener('keyup', view._onKeyUp);
}

export function handlePointerMove(view, e) {
    if (!view.canvas) return;
    if (isPointerOverUI(view, e.target)) {
        view._hoveredRoadKey = null;
        return;
    }
    if (isInteractiveElement(document.activeElement)) return;

    setPointerFromEvent(view, e);

    if (view._isDraggingCamera) {
        const hit = intersectPlane(view);
        if (!hit) return;
        const cam = view.engine.camera;
        cam.position.x = view._cameraDragStartCam.x + (view._cameraDragStartWorld.x - hit.x);
        cam.position.z = view._cameraDragStartCam.z + (view._cameraDragStartWorld.z - hit.z);
        view._markInteraction();
        return;
    }

    if (view._isDraggingRoad && view._activeRoadKey) {
        const hit = intersectPlane(view);
        if (hit) {
            view._pivot.x = hit.x + view._dragOffset.x;
            view._pivot.z = hit.z + view._dragOffset.z;
            view._markInteraction();
            view._needsRebuild = true;
        }
        updateHover(view);
        return;
    }

    updateHover(view);
}

export function handlePointerDown(view, e) {
    if (!view.canvas) return;
    if (e.button !== 0) return;
    if (isPointerOverUI(view, e.target)) return;
    if (isInteractiveElement(document.activeElement)) return;

    setPointerFromEvent(view, e);
    const pickedRoadKey = pickRoad(view);
    const hit = intersectPlane(view);
    if (!hit) return;

    if (pickedRoadKey) {
        view._activeRoadKey = pickedRoadKey;
        view._isDraggingRoad = true;
        view._dragOffset.set(view._pivot.x - hit.x, 0, view._pivot.z - hit.z);
        view._markInteraction();
        view._needsRebuild = true;
        return;
    }

    view._isDraggingCamera = true;
    view._cameraDragPointerId = Number.isFinite(e.pointerId) ? e.pointerId : null;
    view._cameraDragStartWorld.copy(hit);
    view._cameraDragStartCam.copy(view.engine.camera.position);
    if (view._cameraDragPointerId !== null) {
        try {
            view.canvas.setPointerCapture(view._cameraDragPointerId);
        } catch (err) {
            // Ignore capture failures.
        }
    }
    view._markInteraction();
}

export function handlePointerUp(view, e) {
    if (view._isDraggingRoad) {
        view._isDraggingRoad = false;
        view._activeRoadKey = null;
        view._dragOffset.set(0, 0, 0);
        view._markInteraction();
        view._needsRebuild = true;
    }

    if (view._isDraggingCamera) {
        const id = view._cameraDragPointerId;
        view._isDraggingCamera = false;
        view._cameraDragPointerId = null;
        if (view.canvas && id !== null) {
            try {
                view.canvas.releasePointerCapture(id);
            } catch (err) {
                // Ignore release failures.
            }
        }
        view._markInteraction();
    }
}

export function handleWheel(view, e) {
    if (!view.canvas) return;
    if (isPointerOverUI(view, e.target)) return;
    if (isInteractiveElement(document.activeElement)) return;
    if (!e) return;
    e.preventDefault();

    const mode = e.deltaMode ?? 0;
    const scale = mode === 1 ? 16 : (mode === 2 ? 400 : 1);
    const delta = (Number(e.deltaY) || 0) * scale;
    if (!Number.isFinite(delta) || delta === 0) return;

    const zoomSpeed = Number.isFinite(view._zoomSpeed) ? view._zoomSpeed : 1;
    const amount = delta * (zoomSpeed / 12000);
    view._zoom = clamp(view._zoom + amount, view._zoomMin, view._zoomMax);

    const cam = view.engine.camera;
    cam.position.y = view._zoom;
    cam.rotation.order = 'YXZ';
    cam.rotation.set(-Math.PI * 0.5, 0, 0);
    view._markInteraction();
}

export function handleKeyDown(view, e) {
    const tag = e.target?.tagName?.toLowerCase?.();
    if (tag === 'input' || tag === 'textarea') return;
    const code = e.code;
    if (code in view._keys) {
        e.preventDefault();
        view._keys[code] = true;
    }
}

export function handleKeyUp(view, e) {
    const tag = e.target?.tagName?.toLowerCase?.();
    if (tag === 'input' || tag === 'textarea') return;
    const code = e.code;
    if (code in view._keys) {
        e.preventDefault();
        view._keys[code] = false;
    }
    if (code === 'KeyQ' || code === 'KeyW') {
        view._markInteraction();
        view._needsRebuild = true;
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
    if (view._keys.KeyA && !view._isDraggingRoad && !view._isDraggingCamera) zoomDir -= 1;
    if (view._keys.KeyZ) zoomDir += 1;
    if (zoomDir !== 0) {
        view._zoom = clamp(view._zoom + zoomDir * view._zoomSpeed * dt, view._zoomMin, view._zoomMax);
    }
    cam.position.y = view._zoom;
    cam.rotation.order = 'YXZ';
    cam.rotation.set(-Math.PI * 0.5, 0, 0);
}

export function updateRotation(view, dt) {
    const key = view._hoveredRoadKey;
    if (!key) return;
    if (view._isDraggingRoad || view._isDraggingCamera) return;

    let dir = 0;
    if (view._keys.KeyQ) dir += 1;
    if (view._keys.KeyW) dir -= 1;
    if (dir === 0) return;

    const road = view._roadsByKey.get(key) ?? null;
    if (!road) return;
    road.yaw += dir * (Number.isFinite(view._rotationSpeed) ? view._rotationSpeed : Math.PI) * dt;
    if (Math.abs(dir) > EPS) {
        view._markInteraction();
        view._needsRebuild = true;
    }
}
