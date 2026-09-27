// Manage editable tuft instances, ground placement previews, selection and clipboard layout export.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2TuftCatalog } from './GrassDebugV2TuftCatalog.js';
import { createGrassDebugV2TuftThumbnails } from './GrassDebugV2TuftThumbnails.js';
import { createGrassDebugV2AuthoringPanel } from './GrassDebugV2AuthoringPanel.js';
import { createGrassDebugV2TuftGizmo } from './GrassDebugV2TuftGizmo.js';

const MIME = 'application/x-grass-tuft';
const LIMITS = Object.freeze({ inclinationDegrees: [-45, 75], burialMeters: [0, 0.06], scale: [0.25, 2] });
const round = value => Number(value.toFixed(6));

/** @param {{scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer,
 * controls: any, plant: any, cards: any, squareBounds: THREE.Object3D,
 * sourceObjects: THREE.Object3D[], render: () => void, onChange: () => void,
 * onOpen: () => void}} options */
export function createGrassDebugV2Authoring({ scene, camera, renderer, controls, plant, cards, squareBounds, sourceObjects, render, onChange, onOpen }) {
    const catalog = createGrassDebugV2TuftCatalog({ plant, cards });
    const thumbnails = createGrassDebugV2TuftThumbnails(renderer, catalog);
    const definitions = new Map(catalog.definitions.map(definition => [definition.id, definition]));
    const group = new THREE.Group(); group.name = 'GrassAuthoringInstances'; scene.add(group); group.visible = false;
    const instances = new Map(), listeners = [], raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const toolbarPoint = new THREE.Vector3();
    const bounds = { minX: squareBounds.position.x - 0.5, maxX: squareBounds.position.x + 0.5,
        minZ: squareBounds.position.z - 0.5, maxZ: squareBounds.position.z + 0.5 };
    let opened = false, started = false, mode = 'LOD0', boundaries = false, selectedId = null, serial = 0;
    let armedId = null, draggedId = null, preview = null, pointerDown = null, previewValid = false;
    const overlayScale = 1 / renderer.toneMappingExposure;
    const selectionBox = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color('#9ee6b7').multiplyScalar(overlayScale));
    selectionBox.name = 'GrassAuthoringSelection'; selectionBox.visible = false;
    selectionBox.material.depthTest = false; selectionBox.material.toneMapped = false; selectionBox.renderOrder = 12; scene.add(selectionBox);
    const marker = new THREE.Mesh(new THREE.RingGeometry(0.012, 0.017, 32),
        new THREE.MeshBasicMaterial({ color: '#9af0b8', depthTest: false, toneMapped: false, side: THREE.DoubleSide }));
    marker.rotation.x = -Math.PI / 2; marker.renderOrder = 13; marker.visible = false; scene.add(marker);
    const ghostMaterial = new THREE.MeshBasicMaterial({ color: '#8fe6b0', transparent: true, opacity: 0.48, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const invalidate = () => { renderer.shadowMap.needsUpdate = true; render(); };
    const listen = (target, type, handler, options) => {
        target.addEventListener(type, handler, options); listeners.push(() => target.removeEventListener(type, handler, options));
    };
    const recordFor = instance => ({ ...instance.record, position: { ...instance.record.position } });
    const selection = () => selectedId ? instances.get(selectedId) : null;
    const updateSelectionBox = () => {
        const instance = selection(); selectionBox.visible = opened && !!instance;
        if (instance) { instance.tuft.group.updateMatrixWorld(true); selectionBox.box.setFromObject(instance.tuft.group); }
    };
    const apply = instance => {
        const { position, rotationDegrees, inclinationDegrees, burialMeters, scale } = instance.record;
        instance.tuft.group.position.set(position.x, -burialMeters, position.z);
        instance.tuft.group.quaternion.setFromEuler(new THREE.Euler(
            -THREE.MathUtils.degToRad(inclinationDegrees), THREE.MathUtils.degToRad(rotationDegrees), 0, 'YXZ'));
        instance.tuft.group.scale.setScalar(scale); instance.tuft.group.updateMatrixWorld(true);
    };
    const change = patch => {
        const instance = selection(); if (!instance) return;
        const record = instance.record;
        for (const [name, value] of Object.entries(patch)) {
            if (!Number.isFinite(value)) throw new Error('Tuft transform values must be finite.');
            if (name === 'x') record.position.x = THREE.MathUtils.clamp(value, bounds.minX, bounds.maxX);
            else if (name === 'z') record.position.z = THREE.MathUtils.clamp(value, bounds.minZ, bounds.maxZ);
            else if (name === 'rotationDegrees') record.rotationDegrees = ((value + 180) % 360 + 360) % 360 - 180;
            else if (Object.hasOwn(LIMITS, name)) record[name] = THREE.MathUtils.clamp(value, ...LIMITS[name]);
            else throw new Error('Unknown tuft transform.');
        }
        apply(instance); updateSelectionBox(); panel.setSelection(recordFor(instance)); onChange(); invalidate();
    };
    const gizmo = createGrassDebugV2TuftGizmo({ scene, camera, domElement: renderer.domElement, orbitControls: controls,
        exposure: renderer.toneMappingExposure,
        onChange: patch => { change(patch.position ? { x: patch.position.x, z: patch.position.z } : patch); const instance = selection(); if (instance) gizmo.sync(recordFor(instance)); }, onRender: render });
    const select = id => {
        if (id !== null && !instances.has(id)) throw new Error('Unknown authored tuft.');
        selectedId = id; const instance = selection();
        if (opened && instance && !armedId && !draggedId) gizmo.attach(instance.tuft.group, recordFor(instance));
        else gizmo.detach();
        panel.setSelection(instance ? recordFor(instance) : null); updateSelectionBox(); render();
    };
    const add = (catalogId, point) => {
        if (!definitions.has(catalogId)) throw new Error('Unknown catalog tuft.');
        const id = 'tuft-' + (++serial), definition = definitions.get(catalogId);
        const record = { id, catalogId, label: definition.label, position: {
            x: THREE.MathUtils.clamp(point.x, bounds.minX, bounds.maxX), z: THREE.MathUtils.clamp(point.z, bounds.minZ, bounds.maxZ) },
            rotationDegrees: 0, inclinationDegrees: 0, burialMeters: 0, scale: 1 };
        const tuft = catalog.createTuft(catalogId); tuft.group.name = id; tuft.group.userData.tuftId = id;
        tuft.setMode(mode); tuft.setBoundaries(boundaries); group.add(tuft.group);
        const pickMeshes = [];
        tuft.group.traverse(object => {
            if (object.isMesh && (['GrassV2PlantLeaf', 'GrassV2SingleLeaf'].includes(object.geometry.name) || ['GrassV2PlantCrown', 'GrassV2CentralShoot'].includes(object.name))) pickMeshes.push(object);
        });
        instances.set(id, { record, tuft, pickMeshes }); apply(instances.get(id));
        select(id); onChange(); invalidate(); return id;
    };
    const clearPreview = () => {
        if (preview) { scene.remove(preview.group); preview.dispose(); preview = null; }
        marker.visible = false; previewValid = false;
    };
    const cancelPlacement = () => {
        armedId = draggedId = null; clearPreview(); select(selectedId); panel.setStatus('');
    };
    const pointAt = event => {
        const rect = renderer.domElement.getBoundingClientRect();
        ndc.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
        raycaster.setFromCamera(ndc, camera);
        return raycaster.ray.intersectPlane(ground, new THREE.Vector3());
    };
    const validPoint = point => point && point.x >= bounds.minX && point.x <= bounds.maxX && point.z >= bounds.minZ && point.z <= bounds.maxZ;
    const showPreview = (id, event) => {
        const point = pointAt(event), valid = !!validPoint(point);
        if (!preview || preview.group.userData.catalogId !== id) {
            clearPreview(); preview = catalog.createTuft(id); preview.setMode('LOD0');
            preview.group.userData.catalogId = id;
            preview.group.traverse(object => {
                if (object.isMesh) { object.material = ghostMaterial; object.castShadow = object.receiveShadow = false; }
            });
            scene.add(preview.group);
        }
        preview.group.visible = !!point; marker.visible = !!point; previewValid = valid;
        if (point) {
            preview.group.position.copy(point); marker.position.set(point.x, 0.001, point.z);
            ghostMaterial.color.set(valid ? '#8fe6b0' : '#ef7d76').multiplyScalar(overlayScale); marker.material.color.copy(ghostMaterial.color);
        }
        render(); return valid ? point : null;
    };
    const exportConfiguration = () => ({
        version: 1, type: 'grass-tuft-layout', units: 'meters', angleUnits: 'degrees',
        area: { center: [round(squareBounds.position.x), 0, round(squareBounds.position.z)], width: 1, depth: 1 },
        catalog: catalog.definitions.map(({ id, label, metrics }) => ({ id, label, metrics })),
        tufts: [...instances.values()].map(({ record }) => ({
            id: record.id, catalogId: record.catalogId, position: [round(record.position.x), 0, round(record.position.z)],
            rotationDegrees: round(record.rotationDegrees), inclinationDegrees: round(record.inclinationDegrees),
            burialMeters: round(record.burialMeters), scale: round(record.scale)
        }))
    });
    const deleteSelected = () => {
        const instance = selection(); if (!instance) return;
        gizmo.detach(); group.remove(instance.tuft.group); instance.tuft.dispose(); instances.delete(selectedId);
        select(null); panel.setStatus(''); onChange(); invalidate();
    };
    const open = value => {
        opened = !!value;
        if (opened && !started) {
            started = true; group.visible = true; sourceObjects.forEach(object => { object.visible = false; });
            add(catalog.definitions[0].id, { x: 0, z: 0 });
        }
        if (opened) { squareBounds.visible = true; document.querySelector('#square-bounds').checked = true; onOpen(); select(selectedId); }
        else { cancelPlacement(); gizmo.detach(); selectionBox.visible = false; }
        onChange(); render();
    };
    const panel = createGrassDebugV2AuthoringPanel({
        catalog: catalog.definitions.map(definition => ({ ...definition, thumbnail: thumbnails.get(definition.id) })),
        onToggle: open, onTool: tool => { cancelPlacement(); gizmo.setTool(tool); },
        onDelete: deleteSelected,
        onExport: async () => {
            try { await navigator.clipboard.writeText(JSON.stringify(exportConfiguration(), null, 2)); panel.setStatus('Configuration copied to clipboard.'); }
            catch { panel.setStatus('Clipboard unavailable. Allow clipboard access and try Export again.'); }
        },
        onCatalogSelect: id => {
            armedId = id; draggedId = null; clearPreview(); gizmo.detach();
            panel.setStatus(''); render();
        }
    });
    listen(document, 'dragstart', event => {
        if (!opened) return;
        const id = event.dataTransfer?.getData(MIME);
        if (!definitions.has(id)) return;
        draggedId = id; armedId = null; gizmo.detach();
    });
    listen(renderer.domElement, 'dragover', event => {
        if (!opened || !draggedId) return;
        event.preventDefault(); event.dataTransfer.dropEffect = showPreview(draggedId, event) ? 'copy' : 'none';
    });
    listen(renderer.domElement, 'drop', event => {
        const id = draggedId || event.dataTransfer?.getData(MIME);
        if (!opened || !definitions.has(id)) return;
        event.preventDefault(); const point = pointAt(event);
        if (validPoint(point)) add(id, point);
        cancelPlacement();
    });
    listen(document, 'dragend', () => { if (draggedId) cancelPlacement(); });
    listen(renderer.domElement, 'dragleave', event => { if (!renderer.domElement.contains(event.relatedTarget)) { clearPreview(); render(); } });
    listen(renderer.domElement, 'pointermove', event => { if (opened && armedId) showPreview(armedId, event); });
    listen(renderer.domElement, 'pointerleave', () => { if (armedId) { clearPreview(); render(); } });
    listen(renderer.domElement, 'pointerdown', event => {
        pointerDown = { x: event.clientX, y: event.clientY, gizmo: gizmo.isHovered() || gizmo.isDragging() };
    });
    listen(renderer.domElement, 'pointerup', event => {
        if (!opened || event.button !== 0 || !pointerDown || pointerDown.gizmo || gizmo.isDragging()
            || Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 5) return;
        if (armedId) {
            const point = pointAt(event); if (validPoint(point)) { add(armedId, point); cancelPlacement(); }
            return;
        }
        pointAt(event);
        // Pick the leaf surfaces even in card LODs so transparent card areas do not intercept clicks.
        const hit = raycaster.intersectObjects([...instances.values()].flatMap(instance => instance.pickMeshes), false)
            .find(hit => hit.point.y >= -0.0001);
        let object = hit?.object;
        while (object && !object.userData.tuftId) object = object.parent;
        select(object?.userData.tuftId ?? null);
    });
    listen(window, 'keydown', event => {
        if (!opened || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName ?? '')) return;
        if (event.key === 'Escape') cancelPlacement();
        if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelected(); }
    });
    const setMode = value => {
        mode = value; for (const instance of instances.values()) instance.tuft.setMode(mode);
        updateSelectionBox();
    };
    const setBoundaries = value => {
        boundaries = !!value; for (const instance of instances.values()) instance.tuft.setBoundaries(boundaries);
    };
    return Object.freeze({
        setOpen: value => panel.setOpen(value), setMode, setBoundaries, hasStarted: () => started,
        updateOverlay() {
            const instance = selection();
            if (!opened || !instance || armedId || draggedId || gizmo.isDragging()) { panel.setAnchor(null); return; }
            const bounds = renderer.domElement.getBoundingClientRect();
            toolbarPoint.copy(instance.tuft.group.position).project(camera);
            panel.setAnchor(toolbarPoint.z < -1 || toolbarPoint.z > 1 || Math.abs(toolbarPoint.x) > 1 || Math.abs(toolbarPoint.y) > 1 ? null : {
                x: bounds.left + (toolbarPoint.x + 1) * bounds.width / 2,
                y: bounds.top + (1 - toolbarPoint.y) * bounds.height / 2, bounds
            });
        },
        getCounts: () => started ? [...instances.values()].reduce((totals, instance) => {
            const counts = instance.tuft.getCounts(mode);
            for (const key of ['leaves', 'cards', 'triangles']) totals[key] += counts[key]; return totals;
        }, { leaves: 0, cards: 0, triangles: 0 }) : null,
        exportConfiguration,
        getSnapshot: () => ({ open: opened, started, selectedId, catalog: catalog.definitions, bounds,
            tufts: [...instances.values()].map(recordFor), placement: { catalogId: draggedId || armedId,
                visible: !!preview?.group.visible, valid: marker.visible && previewValid },
            gizmo: gizmo.getSnapshot() }),
        dispose: () => {
            listeners.forEach(remove => remove()); clearPreview(); gizmo.dispose(); panel.dispose();
            for (const instance of instances.values()) instance.tuft.dispose();
            scene.remove(group, selectionBox, marker); selectionBox.geometry.dispose(); selectionBox.material.dispose();
            marker.geometry.dispose(); marker.material.dispose(); ghostMaterial.dispose();
        }
    });
}
