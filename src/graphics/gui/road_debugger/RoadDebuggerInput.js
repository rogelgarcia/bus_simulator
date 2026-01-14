// src/graphics/gui/road_debugger/RoadDebuggerInput.js
// Input + camera controls for the Road Debugger (click to author, pan/zoom, select).
import * as THREE from 'three';

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

export const ROAD_DEBUGGER_WHEEL_ZOOM_DIVISOR = 4000;

function isInteractiveElement(target) {
    const tag = target?.tagName;
    if (!tag) return false;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || target?.isContentEditable;
}

function isTextEntryElement(target) {
    const tag = target?.tagName;
    if (!tag) return false;
    if (target?.isContentEditable) return true;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag !== 'INPUT') return false;
    const type = String(target.type ?? '').toLowerCase();
    if (!type || type === 'text') return true;
    return type === 'search'
        || type === 'email'
        || type === 'url'
        || type === 'tel'
        || type === 'password'
        || type === 'number'
        || type === 'date'
        || type === 'time'
        || type === 'datetime-local'
        || type === 'month'
        || type === 'week';
}

function setPointerFromEvent(view, e) {
    const rect = view.canvas.getBoundingClientRect?.() ?? null;
    const left = Number(rect?.left) || 0;
    const top = Number(rect?.top) || 0;
    const w = Number(rect?.width) || view.canvas.width || 1;
    const h = Number(rect?.height) || view.canvas.height || 1;
    const clientX = Number(e?.clientX);
    const clientY = Number(e?.clientY);
    const x = Number.isFinite(clientX) ? (clientX - left) / w : 0.5;
    const y = Number.isFinite(clientY) ? (clientY - top) / h : 0.5;
    view.pointer.set(x * 2 - 1, -(y * 2 - 1));
}

function intersectPlane(view) {
    const cam = view.camera ?? null;
    if (!cam || !view.hoverPlane) return null;
    cam.updateMatrixWorld?.(true);
    view.raycaster.setFromCamera(view.pointer, cam);
    const hit = new THREE.Vector3();
    const ok = view.raycaster.ray.intersectPlane(view.hoverPlane, hit);
    if (!ok) return null;
    if (!Number.isFinite(hit.x) || !Number.isFinite(hit.y) || !Number.isFinite(hit.z)) return null;
    return hit;
}

function isPointerOverUI(view, target) {
    const root = view.ui?.root ?? null;
    if (!root) return false;
    return root.contains(target);
}

function isPointerOverUIByClientXY(view, e) {
    const root = view.ui?.root ?? null;
    if (!root) return false;
    const x = Number(e?.clientX);
    const y = Number(e?.clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const el = document.elementFromPoint?.(x, y) ?? null;
    if (!el) return false;
    return root.contains(el);
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
    if (view._orbitTarget?.set) view._orbitTarget.set(center.x, view._groundY ?? 0, center.z);
    else view._orbitTarget = new THREE.Vector3(center.x, view._groundY ?? 0, center.z);
    view._orbitYaw = 0;
    view._orbitPitch = 0;
    view._syncOrbitCamera?.();
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
    if (view._cameraDragPointerId !== null && Number.isFinite(e?.pointerId) && e.pointerId !== view._cameraDragPointerId) return;
    if (view.isPointDragActive?.()) {
        setPointerFromEvent(view, e);
        const hit = intersectPlane(view);
        if (!hit) return;
        view.updatePointDrag?.(hit, { altKey: !!e.altKey, shiftKey: !!e.shiftKey });
        view.clearDraftPreview?.();
        return;
    }
    if (view._junctionSelectDrag?.active) {
        const drag = view._junctionSelectDrag;
        if (drag.pointerId !== null && Number.isFinite(e?.pointerId) && e.pointerId !== drag.pointerId) return;
        view.ui?.setSelectionRect?.({ x0: drag.startX, y0: drag.startY, x1: e.clientX ?? drag.startX, y1: e.clientY ?? drag.startY });
        const mode = e.shiftKey ? 'add' : 'replace';
        view.selectJunctionToolCandidatesInScreenRect?.({
            x0: drag.startX,
            y0: drag.startY,
            x1: e.clientX ?? drag.startX,
            y1: e.clientY ?? drag.startY,
            mode,
            baseSelected: drag.baseSelected
        });
        return;
    }
    if (view._isDraggingCamera && isPointerOverUIByClientXY(view, e)) {
        view._pendingClick = false;
        view._isDraggingCamera = false;
        const pid = view._cameraDragPointerId;
        view._cameraDragPointerId = null;
        if (pid !== null && view.canvas?.releasePointerCapture) {
            try {
                view.canvas.releasePointerCapture(pid);
            } catch (err) {}
        }
        return;
    }
    if (!view._isDraggingCamera && !view._pendingClick && isPointerOverUI(view, e.target)) return;

    setPointerFromEvent(view, e);

    if (!view._pendingClick && !view._isDraggingCamera) {
        const draft = view.getDraftRoad?.() ?? view._draft ?? null;
        if (draft) {
            const hit = intersectPlane(view);
            view.updateDraftPreviewFromWorld?.(hit, { altKey: !!e.altKey });
        } else {
            view.clearDraftPreview?.();
        }
        view.updateHoverFromPointer?.();
        return;
    }

    const hit = intersectPlane(view);
    if (!hit) return;

    if (view._pendingClick) {
        const dx = (e.clientX ?? 0) - (view._pointerDownClient?.x ?? 0);
        const dy = (e.clientY ?? 0) - (view._pointerDownClient?.y ?? 0);
        const threshold = Number.isFinite(view._dragThresholdPx) ? view._dragThresholdPx : 6;
        if (Math.hypot(dx, dy) >= threshold) {
            view._pendingClick = false;
            const junctionToolEnabled = view.getJunctionToolEnabled?.() ?? view._junctionToolEnabled === true;
            if (junctionToolEnabled) {
                const startX = view._pointerDownClient?.x ?? 0;
                const startY = view._pointerDownClient?.y ?? 0;
                view._junctionSelectDrag = {
                    active: true,
                    pointerId: view._cameraDragPointerId,
                    startX,
                    startY,
                    baseSelected: new Set(view._junctionToolSelectedCandidateIds ?? [])
                };
                view.ui?.setSelectionRect?.({ x0: startX, y0: startY, x1: e.clientX ?? startX, y1: e.clientY ?? startY });
                const mode = e.shiftKey ? 'add' : 'replace';
                view.selectJunctionToolCandidatesInScreenRect?.({
                    x0: startX,
                    y0: startY,
                    x1: e.clientX ?? startX,
                    y1: e.clientY ?? startY,
                    mode,
                    baseSelected: view._junctionSelectDrag.baseSelected
                });
                return;
            }
            view._isDraggingCamera = true;
            view._cameraDragStartWorld.copy(view._pointerDownWorld);
            view._cameraDragStartCam.copy(view._pointerDownCam);
            view._cameraDragStartTarget.copy(view._orbitTarget ?? new THREE.Vector3());
        } else {
            return;
        }
    }

    if (!view._isDraggingCamera) return;
    const dx = view._cameraDragStartWorld.x - hit.x;
    const dz = view._cameraDragStartWorld.z - hit.z;
    if (view._orbitTarget) {
        view._orbitTarget.x += dx;
        view._orbitTarget.z += dz;
        view._orbitTarget.y = view._groundY ?? view._orbitTarget.y;
    }
    view._syncOrbitCamera?.();
}

export function handlePointerDown(view, e) {
    if (!view.canvas) return;
    if (!e) return;
    const button = e.button ?? 0;
    if (button !== 0 && button !== 1 && button !== 2) return;
    if (isPointerOverUI(view, e.target)) return;

    setPointerFromEvent(view, e);
    const hit = intersectPlane(view);
    if (!hit) return;

    view._junctionSelectDrag = null;
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
        view._cameraDragStartTarget.copy(view._orbitTarget ?? new THREE.Vector3());
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

    if (view._junctionSelectDrag?.active) {
        const drag = view._junctionSelectDrag;
        if (e) {
            const mode = e.shiftKey ? 'add' : 'replace';
            view.selectJunctionToolCandidatesInScreenRect?.({
                x0: drag.startX,
                y0: drag.startY,
                x1: e.clientX ?? drag.startX,
                y1: e.clientY ?? drag.startY,
                mode,
                baseSelected: drag.baseSelected
            });
        }
        view._junctionSelectDrag = null;
        view.ui?.hideSelectionRect?.();
        view._pendingClick = false;
    }

    if (view._pendingClick && view._pointerDownButton === 0 && e) {
        view._pendingClick = false;
        if (e && view.canvas) setPointerFromEvent(view, e);
        const hit = view.canvas ? intersectPlane(view) : null;
        if (hit) view.handleCanvasClick?.(hit, { altKey: !!e.altKey });
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
    if (!e) return;
    e.preventDefault();

    const mode = e.deltaMode ?? 0;
    const scale = mode === 1 ? 16 : (mode === 2 ? 400 : 1);
    const delta = (Number(e.deltaY) || 0) * scale;
    if (!Number.isFinite(delta) || delta === 0) return;

    const zoomSpeed = Number.isFinite(view._zoomSpeed) ? view._zoomSpeed : 1;
    const amount = delta * (zoomSpeed / ROAD_DEBUGGER_WHEEL_ZOOM_DIVISOR);
    view._zoom = clamp(view._zoom + amount, view._zoomMin, view._zoomMax);
    view._syncOrbitCamera?.();
}

export function handleKeyDown(view, e) {
    if (!e) return;
    const code = e.code;
    const key = e.key;

    if (code === 'Escape' || key === 'Escape') {
        const exitConfirmOpen = view?.isExitConfirmOpen?.() ?? false;
        if (!exitConfirmOpen && (isTextEntryElement(e.target) || isTextEntryElement(document.activeElement))) return;
        const handled = view.handleEscape?.();
        if (handled) {
            e.preventDefault();
            e.stopImmediatePropagation?.();
        }
        return;
    }

    if (code === 'Enter' || code === 'NumpadEnter' || key === 'Enter') {
        if (isTextEntryElement(e.target) || isTextEntryElement(document.activeElement)) return;
        const handled = view.handleEnter?.();
        if (handled) {
            e.preventDefault();
            e.stopImmediatePropagation?.();
            return;
        }
    }

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
    const move = new THREE.Vector3();
    if (view._keys.ArrowUp) move.z -= 1;
    if (view._keys.ArrowDown) move.z += 1;
    if (view._keys.ArrowRight) move.x += 1;
    if (view._keys.ArrowLeft) move.x -= 1;
    let changed = false;
    if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(view._moveSpeed * dt);
        if (view._orbitTarget) {
            view._orbitTarget.x += move.x;
            view._orbitTarget.z += move.z;
            view._orbitTarget.y = view._groundY ?? view._orbitTarget.y;
        }
        changed = true;
    }

    let zoomDir = 0;
    if (view._keys.KeyA && !view._isDraggingCamera) zoomDir -= 1;
    if (view._keys.KeyZ) zoomDir += 1;
    if (zoomDir !== 0) {
        view._zoom = clamp(view._zoom + zoomDir * view._zoomSpeed * dt, view._zoomMin, view._zoomMax);
        changed = true;
    }

    if (changed) view._syncOrbitCamera?.();
}
