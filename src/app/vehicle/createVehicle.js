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

/**
 * Resolve the BusSkeleton API from a bus model.
 * @param {THREE.Object3D} busModel
 * @returns {import('../buses/BusSkeleton.js').BusSkeleton|null}
 */
function resolveBusApi(busModel) {
    if (!busModel) return null;
    return busModel.userData?.bus ?? busModel.userData?.api ?? null;
}

/**
 * Create a floor anchor for the bus model.
 * The anchor is positioned so the bus sits on the ground (Y=0).
 * @param {THREE.Object3D} model
 * @returns {THREE.Group}
 */
function makeFloorAnchor(model) {
    const anchor = new THREE.Group();
    anchor.name = `${model.name || 'vehicle'}_anchor`;
    anchor.userData.type = model.userData?.type;
    anchor.userData.id = model.userData?.id;
    anchor.userData.model = model;
    anchor.add(model);

    // Reset model transforms
    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.scale.set(1, 1, 1);

    // Adjust Y so bottom of model sits at Y=0
    const box = new THREE.Box3().setFromObject(model);
    model.position.y -= box.min.y;

    return anchor;
}

/**
 * Extract vehicle configuration from bus model.
 * @param {THREE.Object3D} busModel
 * @param {object} api - BusSkeleton API
 * @returns {object}
 */
function extractVehicleConfig(busModel, api) {
    const box = new THREE.Box3().setFromObject(busModel);
    const size = box.getSize(new THREE.Vector3());
    const dimensions = isSizeUsable(size)
        ? { width: size.x, height: size.y, length: size.z }
        : { ...FALLBACK_DIMENSIONS };

    // Get wheel rig info
    const wheelRig = api?.wheelRig ?? busModel.userData?.wheelRig ?? null;
    const wheelRadius = wheelRig?.wheelRadius ?? 0.55;

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
    // Resolve the actual model
    const model = resolveBusModel(selected);
    if (!model) {
        console.warn('[createVehicleFromBus] No valid bus model provided');
        return null;
    }

    // Remove from previous parent (e.g., garage scene)
    if (model.parent) {
        model.parent.remove(model);
    }

    // Get the BusSkeleton API
    const api = resolveBusApi(model);
    if (!api) {
        console.warn('[createVehicleFromBus] Bus model has no BusSkeleton API');
    }

    // Create floor anchor
    const anchor = makeFloorAnchor(model);

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
