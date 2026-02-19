// Harness scenario: deterministic material-calibration capture rig for texture QA.
import { MaterialCalibrationScene } from '/src/graphics/gui/material_calibration/MaterialCalibrationScene.js';

function clamp(value, min, max, fallback = min) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    if (n < min) return min;
    if (n > max) return max;
    return n;
}

function sanitizeLayoutMode(value) {
    const id = typeof value === 'string' ? value.trim() : '';
    if (id === 'panel' || id === 'sphere' || id === 'full') return id;
    return 'full';
}

function sanitizeViewId(value, layoutMode) {
    const id = typeof value === 'string' ? value.trim() : '';
    if (layoutMode === 'panel') return id === 'panel_perpendicular' ? id : 'panel_perpendicular';
    if (id === 'left_oblique' || id === 'right_oblique' || id === 'top' || id === 'front') return id;
    return 'front';
}

function isTextureReady(tex) {
    if (!tex) return true;
    const image = tex.image ?? tex.source?.data ?? null;
    if (!image) return false;
    const width = Number(image.naturalWidth ?? image.width ?? image.videoWidth ?? 0);
    const height = Number(image.naturalHeight ?? image.height ?? image.videoHeight ?? 0);
    const complete = image.complete === true || image.readyState === 4;
    return complete || (width > 0 && height > 0);
}

function isSlotMaterialReady(scene, slotIndex) {
    const mats = scene?._slotMaterials ?? [];
    const material = mats[slotIndex] ?? null;
    if (!material) return false;
    return isTextureReady(material.map)
        && isTextureReady(material.normalMap)
        && isTextureReady(material.roughnessMap)
        && isTextureReady(material.aoMap)
        && isTextureReady(material.metalnessMap);
}

function applyCapturePose(scene, viewId) {
    const controls = scene?.controls ?? null;
    if (!controls) return;

    if (viewId === 'panel_perpendicular') {
        const pose = scene.getSlotPanelCapturePose?.(0, { framing: 1.0, fit: 'cover' }) ?? null;
        if (pose?.position && pose?.target) {
            controls.setLookAt?.({ position: pose.position, target: pose.target });
            controls.update?.(0);
        }
        return;
    }

    const base = scene.getSlotCapturePose?.(0, { distanceScale: 1.15 }) ?? null;
    const orbit = base?.orbit && typeof base.orbit === 'object' ? { ...base.orbit } : null;
    if (orbit) {
        if (viewId === 'left_oblique') orbit.theta += 0.34;
        else if (viewId === 'right_oblique') orbit.theta -= 0.34;
        else if (viewId === 'top') orbit.phi = clamp(orbit.phi - 0.34, 0.2, Math.PI - 0.2, orbit.phi);
        controls.setOrbit?.(orbit, { immediate: true });
        controls.update?.(0);
        return;
    }

    if (base?.position && base?.target) {
        controls.setLookAt?.({ position: base.position, target: base.target });
        controls.update?.(0);
    }
}

export const scenarioMaterialCalibrationCapture = {
    id: 'material_calibration_capture',
    async create({ engine, options }) {
        engine.clearScene();

        const calibration = new MaterialCalibrationScene(engine);
        calibration.enter();

        const materialId = typeof options?.materialId === 'string' ? options.materialId.trim() : '';
        const presetId = typeof options?.presetId === 'string' ? options.presetId.trim() : 'neutral';
        const layoutMode = sanitizeLayoutMode(options?.layoutMode);
        const viewId = sanitizeViewId(options?.viewId, layoutMode);
        const tilingMultiplier = clamp(options?.tilingMultiplier, 0.1, 8.0, 1.0);
        const overrides = options?.overrides && typeof options.overrides === 'object' ? options.overrides : null;

        calibration.setLayoutMode(layoutMode);
        calibration.setTilingMultiplier(tilingMultiplier);
        calibration.setPlateVisible(options?.plateVisible !== false);

        calibration.setSlotMaterial(0, materialId, { overrides });
        calibration.setSlotMaterial(1, null);
        calibration.setSlotMaterial(2, null);
        calibration.setActiveSlotIndex(0);
        calibration.setIsolatedSlotIndex(0);
        calibration.setCenteredCaptureSlot(0);

        const illumination = calibration.applyIlluminationPreset(presetId);
        applyCapturePose(calibration, viewId);
        engine.renderFrame();

        return {
            update(dt) {
                calibration.update(dt);
            },
            getMetrics() {
                return {
                    scenario: 'material_calibration_capture',
                    materialId,
                    presetId,
                    layoutMode,
                    viewId,
                    tilingMultiplier,
                    illumination,
                    textureReady: isSlotMaterialReady(calibration, 0)
                };
            },
            dispose() {
                calibration.exit();
            }
        };
    }
};

