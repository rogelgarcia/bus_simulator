// src/graphics/gui/road_debugger/RoadDebuggerInput.js
// Input + camera controls for the Road Debugger (click to author, pan/zoom, select).
import * as THREE from 'three';

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
    view.raycaster.setFromCamera(view.pointer, view.camera);
    const hit = new THREE.Vector3();
    const ok = view.raycaster.ray.intersectPlane(view.hoverPlane, hit);
    return ok ? hit : null;
}

function isPointerOverUI(view, target) {
    const root = view.ui?.root ?? null;
    if (!root) return false;
    return root.contains(target);
}

function cameraCenter(view) {
    const origin = view?._origin ?? { x: 0, z: 0 };
    const w = view?._mapWidth ?? 1;
    const h = view?._mapHeight ?? 1;
    const tileSize = view?._tileSize ?? 24;
    const x = origin.x + (w - 1) * tileSize * 0.5;
    const z = origin.z + (h - 1) * tileSize * 0.5;
    return { x, z };
}

export function setupCamera(view) {
    const cam = view.camera;
    const size = Number.isFinite(view?._worldSize) ? view._worldSize : 220;
    const fovRad = (cam.fov * Math.PI) / 180;
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
    const center = cameraCenter(view);
    cam.position.set(center.x, view._zoom, center.z);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(-Math.PI * 0.5, 0, 0);
}

export function attachEvents(view) {
    view.canvas?.addEventListener('pointerdown', view._onPointerDown);
    view.canvas?.addEventListener('wheel', view._onWheel, { passive: false });
    view.canvas?.addEventListener('contextmenu', view._onContextMenu);
    window.addEventListener('pointermove', view._onPointerMove, { passive: true });
    window.addEventListener('pointerup', view._onPointerUp, { passive: true });
    window.addEventListener('pointercancel', view._onPointerUp, { passive: true });
    window.addEventListener('keydown', view._onKeyDown, { passive: false });
    window.addEventListener('keyup', view._onKeyUp, { passive: false });
}

export function detachEvents(view) {
    view.canvas?.removeEventListener('pointerdown', view._onPointerDown);
    view.canvas?.removeEventListener('wheel', view._onWheel);
    view.canvas?.removeEventListener('contextmenu', view._onContextMenu);
    window.removeEventListener('pointermove', view._onPointerMove);
    window.removeEventListener('pointerup', view._onPointerUp);
    window.removeEventListener('pointercancel', view._onPointerUp);
    window.removeEventListener('keydown', view._onKeyDown);
    window.removeEventListener('keyup', view._onKeyUp);
}

export function handlePointerMove(view, e) {
    if (!view.canvas) return;
    if (view.isPointDragActive?.()) {
        setPointerFromEvent(view, e);
        const hit = intersectPlane(view);
        if (!hit) return;
        view.updatePointDrag?.(hit, { altKey: !!e.altKey, shiftKey: !!e.shiftKey });
        return;
    }
    if (!view._isDraggingCamera && !view._pendingClick && isPointerOverUI(view, e.target)) return;
    if (isInteractiveElement(document.activeElement)) return;

    setPointerFromEvent(view, e);

    const hit = intersectPlane(view);
    if (!hit) return;

    if (view._pendingClick) {
        const dx = (e.clientX ?? 0) - (view._pointerDownClient?.x ?? 0);
        const dy = (e.clientY ?? 0) - (view._pointerDownClient?.y ?? 0);
        const threshold = Number.isFinite(view._dragThresholdPx) ? view._dragThresholdPx : 6;
        if (Math.hypot(dx, dy) >= threshold) {
            view._pendingClick = false;
            view._isDraggingCamera = true;
            view._cameraDragStartWorld.copy(view._pointerDownWorld);
            view._cameraDragStartCam.copy(view._pointerDownCam);
        } else {
            return;
        }
    }

    if (!view._isDraggingCamera) return;
    const cam = view.camera;
    cam.position.x = view._cameraDragStartCam.x + (view._cameraDragStartWorld.x - hit.x);
    cam.position.z = view._cameraDragStartCam.z + (view._cameraDragStartWorld.z - hit.z);
}

export function handlePointerDown(view, e) {
    if (!view.canvas) return;
    if (!e) return;
    const button = e.button ?? 0;
    if (button !== 0 && button !== 1 && button !== 2) return;
    if (isPointerOverUI(view, e.target)) return;
    if (isInteractiveElement(document.activeElement)) return;

    setPointerFromEvent(view, e);
    const hit = intersectPlane(view);
    if (!hit) return;

    view._pointerDownButton = button;
    view._pointerDownClient = { x: e.clientX ?? 0, y: e.clientY ?? 0 };
    view._pointerDownWorld.copy(hit);
    view._pointerDownCam.copy(view.camera.position);

    const pointerId = Number.isFinite(e.pointerId) ? e.pointerId : null;
    view._cameraDragPointerId = pointerId;

    if (button === 0) {
        const pick = view._pickAtPointer?.() ?? null;
        if (pick?.type === 'point') {
            e.preventDefault?.();
            view._pendingClick = false;
            view._isDraggingCamera = false;
            view.beginPointDrag?.({ roadId: pick.roadId, pointId: pick.pointId, hitWorld: hit, pointerId });
            if (pointerId !== null) {
                try {
                    view.canvas.setPointerCapture(pointerId);
                } catch (err) {}
            }
            return;
        }
        view._pendingClick = true;
        view._isDraggingCamera = false;
    } else {
        e.preventDefault?.();
        view._pendingClick = false;
        view._isDraggingCamera = true;
        view._cameraDragStartWorld.copy(hit);
        view._cameraDragStartCam.copy(view.camera.position);
    }

    if (pointerId !== null) {
        try {
            view.canvas.setPointerCapture(pointerId);
        } catch (err) {}
    }
}

export function handlePointerUp(view, e) {
    if (view.isPointDragActive?.()) view.endPointDrag?.();
    const id = view._cameraDragPointerId;

    if (view._pendingClick && view._pointerDownButton === 0 && e) {
        view._pendingClick = false;
        if (e && view.canvas) setPointerFromEvent(view, e);
        const hit = view.canvas ? intersectPlane(view) : null;
        if (hit) view.handleCanvasClick?.(hit);
    }

    view._pendingClick = false;
    view._isDraggingCamera = false;
    view._cameraDragPointerId = null;
    view._pointerDownButton = null;
    if (view.canvas && id !== null) {
        try {
            view.canvas.releasePointerCapture(id);
        } catch (err) {}
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

    const cam = view.camera;
    cam.position.y = view._zoom;
    cam.rotation.order = 'YXZ';
    cam.rotation.set(-Math.PI * 0.5, 0, 0);
}

export function handleKeyDown(view, e) {
    const code = e.code;
    if (isInteractiveElement(e.target) || isInteractiveElement(document.activeElement)) return;
    const ctrl = !!(e.ctrlKey || e.metaKey);
    if (ctrl && code === 'KeyZ' && !e.shiftKey) {
        e.preventDefault();
        view.undo?.();
        return;
    }
    if (ctrl && ((code === 'KeyZ' && e.shiftKey) || code === 'KeyY')) {
        e.preventDefault();
        view.redo?.();
        return;
    }
    if (code in view._keys) {
        e.preventDefault();
        view._keys[code] = true;
    }
}

export function handleKeyUp(view, e) {
    const code = e.code;
    if (code in view._keys) {
        e.preventDefault();
        view._keys[code] = false;
    }
}

export function updateCamera(view, dt) {
    const cam = view.camera;
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
    if (view._keys.KeyA && !view._isDraggingCamera) zoomDir -= 1;
    if (view._keys.KeyZ) zoomDir += 1;
    if (zoomDir !== 0) {
        view._zoom = clamp(view._zoom + zoomDir * view._zoomSpeed * dt, view._zoomMin, view._zoomMax);
    }

    cam.position.y = view._zoom;
    cam.rotation.order = 'YXZ';
    cam.rotation.set(-Math.PI * 0.5, 0, 0);
}
