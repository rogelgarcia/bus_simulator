// src/app/vehicle/createVehicle.js
/**
 * Factory function to create a Vehicle from a bus model.
 * 
 * This bridges the old bus model system (BusSkeleton) to the new
 * vehicle abstraction layer.
 * 
 * Usage:
 *   const vehicle = createVehicleFromBus(busModel);
 *   scene.add(vehicle.anchor);
 *   controller.setVehicleApi(vehicle.api, vehicle.anchor);
 */
import * as THREE from 'three';

const FALLBACK_DIMENSIONS = { width: 2.5, height: 3.0, length: 10.0 };

/**
 * Generate a unique vehicle ID.
 * @returns {string}
 */
function generateVehicleId() {
    return `vehicle_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function isSizeUsable(size) {
    return size && size.x > 0.5 && size.y > 0.5 && size.z > 0.5;
}

function clampWheelRadius(radius, dimensions) {
    const r = Number.isFinite(radius) ? radius : NaN;
    const height = Number.isFinite(dimensions?.height) ? dimensions.height : FALLBACK_DIMENSIONS.height;
    const max = Math.min(1.2, Math.max(0.55, height * 0.45));
    if (!Number.isFinite(r)) return 0.55;
    return Math.max(0.2, Math.min(max, r));
}

/**
 * Resolve the actual bus model from a selected object.
 * Handles cases where the model is nested in userData.
 * @param {THREE.Object3D} selected
 * @returns {THREE.Object3D|null}
 */
function resolveBusModel(selected) {
    if (!selected) return null;
    if (selected.userData?.model?.isObject3D) return selected.userData.model;
    return selected;
}

function resolveBusAnchor(selected) {
    if (!selected?.isObject3D) return null;
    const model = selected.userData?.model;
    if (!model?.isObject3D) return null;
    if (selected === model) return null;
    return selected;
}

/**
 * Resolve the BusSkeleton API from a bus model.
 * @param {THREE.Object3D} busModel
 * @returns {import('../buses/BusSkeleton.js').BusSkeleton|null}
 */
function resolveBusApi(busModel) {
    if (!busModel) return null;
    return busModel.userData?.bus ?? busModel.userData?.api ?? null;
}

function resolveBoundsTarget(model) {
    const api = model?.userData?.bus ?? model?.userData?.api ?? null;
    if (api?.tiltPivot?.isObject3D) return api.tiltPivot;
    if (api?.bodyRoot?.isObject3D) return api.bodyRoot;
    return model;
}

function centerModelInAnchor(anchor, model) {
    const boundsTarget = resolveBoundsTarget(model);
    if (!boundsTarget) return;
    anchor.updateMatrixWorld(true);
    boundsTarget.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(boundsTarget);
    if (box.isEmpty()) return;
    const centerWorld = box.getCenter(new THREE.Vector3());
    const centerLocal = anchor.worldToLocal(centerWorld.clone());
    model.position.sub(centerLocal);
}

/**
 * Create a vehicle anchor for the model.
 * The anchor origin is at the vehicle's visual center (bounds center).
 * @param {THREE.Object3D} model
 * @returns {THREE.Group}
 */
function makeVehicleAnchor(model) {
    const anchor = new THREE.Group();
    anchor.name = `${model.name || 'vehicle'}_anchor`;
    anchor.userData.type = model.userData?.type;
    anchor.userData.id = model.userData?.id;
    anchor.userData.model = model;
    anchor.userData.origin = 'center';
    anchor.add(model);

    // Center model so its bounds center aligns with the anchor origin.
    // Do not reset transforms here: buses may already be centered by their loader,
    // and resetting would re-introduce offsets when moving between scenes.
    centerModelInAnchor(anchor, model);

    return anchor;
}

/**
 * Extract vehicle configuration from bus model.
 * @param {THREE.Object3D} busModel
 * @param {object} api - BusSkeleton API
 * @returns {object}
 */
function extractVehicleConfig(busModel, api) {
    busModel.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(busModel);
    const size = box.getSize(new THREE.Vector3());
    const dimensions = isSizeUsable(size)
        ? { width: size.x, height: size.y, length: size.z }
        : { ...FALLBACK_DIMENSIONS };

    // Get wheel rig info
    const wheelRig = api?.wheelRig ?? busModel.userData?.wheelRig ?? null;
    const wheelRadius = clampWheelRadius(wheelRig?.wheelRadius ?? 0.55, dimensions);

    // Get suspension tuning
    const suspensionTuning = api?.getSuspensionTuning?.() ?? 
                             busModel.userData?.suspensionTuning ?? 
                             null;

    // Estimate wheelbase from wheel positions
    let wheelbase = 5.5; // default
    if (wheelRig?.front?.length && wheelRig?.rear?.length) {
        try {
            const frontWheel = wheelRig.front[0];
            const rearWheel = wheelRig.rear[0];
            const frontPivot = frontWheel?.rollPivot ?? frontWheel?.steerPivot;
            const rearPivot = rearWheel?.rollPivot;
            
            if (frontPivot && rearPivot) {
                const frontPos = new THREE.Vector3();
                const rearPos = new THREE.Vector3();
                frontPivot.getWorldPosition(frontPos);
                rearPivot.getWorldPosition(rearPos);
                wheelbase = Math.abs(frontPos.z - rearPos.z);
            }
        } catch (e) {
            // Use default
        }
    }

    return {
        type: 'bus',
        name: busModel.name || busModel.userData?.id || 'Unknown Bus',
        dimensions,
        wheelbase,
        wheelRadius,
        suspensionTuning,
        maxSpeedKph: 80,
        maxSteerDeg: 55
    };
}

/**
 * Create a Vehicle object from a bus model.
 * 
 * @param {THREE.Object3D} selected - The selected bus from BusSelectState
 * @param {object} [options]
 * @param {string} [options.id] - Custom vehicle ID
 * @returns {object|null} Vehicle object with { id, model, anchor, api, config }
 */
export function createVehicleFromBus(selected, options = {}) {
    const providedAnchor = resolveBusAnchor(selected);

    // Resolve the actual model
    const model = resolveBusModel(selected);
    if (!model) {
        console.warn('[createVehicleFromBus] No valid bus model provided');
        return null;
    }

    // Remove from previous parent (e.g., garage scene)
    if (providedAnchor) {
        if (providedAnchor.parent) providedAnchor.parent.remove(providedAnchor);
    } else if (model.parent) {
        model.parent.remove(model);
    }

    // Get the BusSkeleton API
    const api = resolveBusApi(model);
    if (!api) {
        console.warn('[createVehicleFromBus] Bus model has no BusSkeleton API');
    }

    const anchor = providedAnchor ?? makeVehicleAnchor(model);
    if (providedAnchor) {
        anchor.userData.type ??= model.userData?.type;
        anchor.userData.id ??= model.userData?.id;
        anchor.userData.model = model;
        anchor.userData.origin ??= 'center';
        if (model.parent !== anchor) anchor.add(model);
    }

    // Extract configuration
    const config = extractVehicleConfig(model, api);

    // Generate ID
    const id = options.id ?? generateVehicleId();

    return {
        id,
        model,
        anchor,
        api,
        config
    };
}
