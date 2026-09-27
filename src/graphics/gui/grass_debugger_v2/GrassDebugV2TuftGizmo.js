// Constrained transform handles for grass tuft authoring.
// @ts-check
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

const TOOLS = Object.freeze({
    move: { mode: 'translate', space: 'world', axes: ['X', 'Y', 'Z'], handles: ['X', 'Y', 'Z', 'XZ'] },
    rotate: { mode: 'rotate', space: 'local', axes: ['X', 'Y'], handles: ['X', 'Y'] },
    size: { mode: 'scale', space: 'local', axes: ['X', 'Y', 'Z'], handles: ['XYZ'] }
});

/**
 * @typedef {Object} TuftRecord
 * @property {string} id
 * @property {{x:number,z:number}} position
 * @property {number} rotationDegrees
 * @property {number} inclinationDegrees
 * @property {number} burialMeters
 * @property {number} scale
 */

/** @param {TuftRecord} record */
function copyRecord(record) {
    const values = [record?.position?.x, record?.position?.z, record?.rotationDegrees,
        record?.inclinationDegrees, record?.burialMeters, record?.scale];
    if (typeof record?.id !== 'string' || values.some(value => !Number.isFinite(value))) {
        throw new Error('Tuft gizmo requires a placement record with finite transforms.');
    }
    return { ...record, position: { ...record.position } };
}

/**
 * @param {{
 * scene:THREE.Scene, camera:THREE.Camera, domElement:HTMLElement,
 * orbitControls:{enabled:boolean}, exposure?:number,
 * onChange:(patch:Partial<TuftRecord>)=>void, onRender:()=>void
 * }} options
 */
export function createGrassDebugV2TuftGizmo({ scene, camera, domElement, orbitControls, onChange, onRender, exposure = 1 }) {
    if (!scene?.isScene || !camera?.isCamera || !domElement || !orbitControls
        || typeof onChange !== 'function' || typeof onRender !== 'function') {
        throw new Error('Tuft gizmo requires a scene, camera, canvas, orbit controls and callbacks.');
    }
    if (!Number.isFinite(exposure) || exposure <= 0) throw new Error('Tuft gizmo exposure must be positive.');
    const initialTouchAction = domElement.style.touchAction;
    const controls = new TransformControls(camera, domElement);
    controls.disconnect();
    domElement.style.touchAction = initialTouchAction;
    controls.enabled = false;
    controls.setSize(0.48);
    const helper = controls.getHelper();
    helper.name = 'GrassTuftEditHandles';
    const proxy = new THREE.Object3D();
    proxy.name = 'GrassTuftEditTransform';
    scene.add(proxy, helper);

    // r183 has only showX/Y/Z. Remove free rotation and non-uniform scale pickers as well as visuals.
    const gizmo = /** @type {any} */ (helper.children.find(child => child.type === 'TransformControlsGizmo'));
    const materials = new Set(Object.values(gizmo.materialLib));
    helper.traverse(child => {
        const material = /** @type {any} */ (child).material;
        if (material) for (const entry of Array.isArray(material) ? material : [material]) materials.add(entry);
    });
    for (const material of materials) {
        material.toneMapped = false;
        material.color.multiplyScalar(1 / exposure);
        material._color = material.color.clone();
    }
    const inactiveHandles = new THREE.Group();
    inactiveHandles.visible = false;
    helper.add(inactiveHandles);
    for (const group of [gizmo.gizmo.translate, gizmo.picker.translate]) {
        for (const child of [...group.children]) if (!TOOLS.move.handles.includes(child.name)) inactiveHandles.add(child);
    }
    for (const group of [gizmo.gizmo.scale, gizmo.picker.scale, gizmo.helper.scale]) {
        for (const child of [...group.children]) if (child.name !== 'XYZ') inactiveHandles.add(child);
    }
    for (const group of [gizmo.gizmo.rotate, gizmo.picker.rotate]) {
        for (const child of [...group.children]) if (['E', 'XYZE'].includes(child.name)) inactiveHandles.add(child);
    }
    helper.visible = false;
    let tool = 'move';
    /** @type {TuftRecord|null} */
    let record = null;
    /** @type {THREE.Object3D|null} */
    let target = null;
    let connected = false;
    let disposed = false;
    /** @type {boolean|null} */
    let savedOrbitEnabled = null;
    /** @type {number|null} */
    let pointerId = null;
    const dragPointer = { x: 0, y: 0, scale: 1, rotationDegrees: 0, inclinationDegrees: 0 };
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');

    function updateProxy() {
        if (!record) return;
        proxy.position.set(record.position.x, -record.burialMeters, record.position.z);
        // A yaw-only handle frame keeps the turn ring vertical while X follows the plant's heading.
        proxy.quaternion.setFromEuler(euler.set(0, THREE.MathUtils.degToRad(record.rotationDegrees), 0, 'YXZ'));
        proxy.scale.setScalar(record.scale);
        proxy.updateMatrixWorld(true);
        helper.updateMatrixWorld(true);
    }

    function restoreOrbit() {
        if (savedOrbitEnabled !== null) orbitControls.enabled = savedOrbitEnabled;
        savedOrbitEnabled = null;
    }

    function pauseOrbit() {
        if (savedOrbitEnabled === null) savedOrbitEnabled = orbitControls.enabled;
        orbitControls.enabled = false;
    }

    function stopDrag() {
        controls.pointerUp(null);
        if (pointerId !== null && domElement.hasPointerCapture(pointerId)) domElement.releasePointerCapture(pointerId);
        pointerId = null;
        restoreOrbit();
    }

    function disconnect() {
        stopDrag();
        if (connected) controls.disconnect();
        connected = false;
        domElement.style.touchAction = initialTouchAction;
    }

    function configureTool() {
        const definition = TOOLS[tool];
        controls.axis = null;
        controls.setMode(definition.mode);
        controls.setSpace(definition.space);
        controls.showX = definition.axes.includes('X');
        controls.showY = definition.axes.includes('Y');
        controls.showZ = definition.axes.includes('Z');
        updateProxy();
    }

    function onDraggingChanged(event) {
        if (event.value) pauseOrbit();
        else restoreOrbit();
    }

    function onObjectChange() {
        if (!record) return;
        /** @type {Partial<TuftRecord>} */
        let patch;
        if (tool === 'move') patch = controls.axis === 'Y'
            ? { burialMeters: THREE.MathUtils.clamp(-proxy.position.y, 0, 0.06) }
            : { position: { x: proxy.position.x, z: proxy.position.z } };
        else if (tool === 'rotate') patch = controls.axis === 'Y'
            ? { rotationDegrees: THREE.MathUtils.euclideanModulo(dragPointer.rotationDegrees
                + THREE.MathUtils.radToDeg(controls.rotationAngle) * controls.rotationAxis.y, 360) }
            : { inclinationDegrees: THREE.MathUtils.clamp(dragPointer.inclinationDegrees
                - THREE.MathUtils.radToDeg(controls.rotationAngle), -45, 75) };
        else patch = { scale: THREE.MathUtils.clamp(proxy.scale.x, 0.25, 2) };
        record = { ...record, ...patch };
        onChange(patch);
        updateProxy();
        onRender();
    }

    function onPointerDownCapture(event) {
        if (!controls.enabled || event.button !== 0) return;
        helper.updateMatrixWorld(true);
        const bounds = domElement.getBoundingClientRect();
        controls.pointerHover({
            x: (event.clientX - bounds.left) / bounds.width * 2 - 1,
            y: 1 - (event.clientY - bounds.top) / bounds.height * 2,
            button: event.button
        });
        if (controls.axis !== null) {
            pointerId = event.pointerId;
            dragPointer.x = event.clientX;
            dragPointer.y = event.clientY;
            dragPointer.scale = record.scale;
            dragPointer.rotationDegrees = record.rotationDegrees;
            dragPointer.inclinationDegrees = record.inclinationDegrees;
            pauseOrbit();
        }
    }

    // The central uniform handle has a zero-length geometric scale baseline; use a pixel gesture instead.
    function onPointerMoveCapture(event) {
        if (!record || !controls.dragging || tool !== 'size' || event.pointerId !== pointerId) return;
        const amount = (event.clientX - dragPointer.x) - (event.clientY - dragPointer.y);
        const scale = THREE.MathUtils.clamp(dragPointer.scale * Math.exp(amount * 0.008), 0.25, 2);
        proxy.scale.setScalar(scale);
        record = { ...record, scale };
        onChange({ scale });
        onRender();
        event.stopImmediatePropagation();
    }

    function onPointerUp(event) {
        if (event.pointerId !== pointerId) return;
        pointerId = null;
        restoreOrbit();
        updateProxy();
        onRender();
    }

    function onPointerCancel(event) {
        if (event.pointerId !== pointerId) return;
        disconnect();
        if (record) {
            controls.connect(domElement);
            connected = true;
        }
        updateProxy();
        onRender();
    }

    function onControlChange() {
        if (!disposed) onRender();
    }

    controls.addEventListener('objectChange', onObjectChange);
    controls.addEventListener('dragging-changed', onDraggingChanged);
    controls.addEventListener('change', onControlChange);
    domElement.addEventListener('pointerdown', onPointerDownCapture, true);
    domElement.addEventListener('pointermove', onPointerMoveCapture, true);
    domElement.addEventListener('pointerup', onPointerUp);
    domElement.addEventListener('pointercancel', onPointerCancel);

    function detach() {
        disconnect();
        controls.enabled = false;
        controls.detach();
        target = null;
        record = null;
        onRender();
    }

    return Object.freeze({
        /** @param {THREE.Object3D} object @param {TuftRecord} value */
        attach(object, value) {
            if (disposed) throw new Error('Cannot attach a disposed tuft gizmo.');
            if (!object?.isObject3D) throw new Error('Tuft gizmo attachment must be an Object3D.');
            const next = copyRecord(value);
            disconnect();
            target = object;
            record = next;
            configureTool();
            controls.attach(proxy);
            controls.connect(domElement);
            connected = true;
            controls.enabled = true;
            onRender();
        },
        detach,
        /** @param {string} id */
        setTool(id) {
            if (!Object.hasOwn(TOOLS, id)) throw new Error('Unknown tuft edit tool: ' + id);
            stopDrag();
            tool = id;
            configureTool();
            onRender();
        },
        /** @param {TuftRecord} value */
        sync(value) {
            const next = copyRecord(value);
            if (!record || next.id !== record.id) throw new Error('Tuft gizmo sync must match the attached placement.');
            record = next;
            if (!controls.dragging) updateProxy();
        },
        isDragging: () => controls.dragging,
        isHovered: () => controls.enabled && controls.axis !== null,
        getSnapshot() {
            helper.updateMatrixWorld(true);
            const bounds = domElement.getBoundingClientRect();
            const handleSamples = [];
            const raycaster = new THREE.Raycaster();
            if (record) for (const child of gizmo.picker[TOOLS[tool].mode].children) {
                if (!child.visible || !TOOLS[tool].handles.includes(child.name)) continue;
                const positions = child.geometry.getAttribute('position');
                child.geometry.computeBoundingBox();
                const candidates = [child.geometry.boundingBox.getCenter(new THREE.Vector3())];
                for (let index = 0; index < positions.count; index += Math.max(1, Math.floor(positions.count / 12))) {
                    candidates.push(new THREE.Vector3().fromBufferAttribute(positions, index));
                }
                for (const point of candidates) {
                    point.applyMatrix4(child.matrixWorld).project(camera);
                    if (Math.abs(point.x) > 1 || Math.abs(point.y) > 1 || point.z < -1 || point.z > 1) continue;
                    raycaster.setFromCamera(new THREE.Vector2(point.x, point.y), camera);
                    const hit = raycaster.intersectObject(gizmo.picker[TOOLS[tool].mode], true).find(hit => hit.object.visible);
                    if (hit?.object.name !== child.name) continue;
                    handleSamples.push({ axis: child.name, x: bounds.left + (point.x + 1) * bounds.width / 2,
                        y: bounds.top + (1 - point.y) * bounds.height / 2 });
                }
            }
            return { tool, selectedId: record?.id ?? null, objectName: target?.name ?? null,
                enabled: controls.enabled, dragging: controls.dragging, axis: controls.axis,
                handles: record ? [...TOOLS[tool].handles] : [], handleSamples,
                record: record ? copyRecord(record) : null };
        },
        dispose() {
            if (disposed) return;
            detach();
            disposed = true;
            controls.removeEventListener('objectChange', onObjectChange);
            controls.removeEventListener('dragging-changed', onDraggingChanged);
            controls.removeEventListener('change', onControlChange);
            domElement.removeEventListener('pointerdown', onPointerDownCapture, true);
            domElement.removeEventListener('pointermove', onPointerMoveCapture, true);
            domElement.removeEventListener('pointerup', onPointerUp);
            domElement.removeEventListener('pointercancel', onPointerCancel);
            controls.dispose();
            domElement.style.touchAction = initialTouchAction;
            scene.remove(helper, proxy);
        }
    });
}
