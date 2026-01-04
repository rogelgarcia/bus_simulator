// src/app/vehicle/createVehicle.js
// Creates a vehicle wrapper from a selected bus model.
// Design: Models are re-anchored to their bounds center without resetting loader transforms.
import * as THREE from 'three';

const FALLBACK_DIMENSIONS = { width: 2.5, height: 3.0, length: 10.0 };

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

function makeVehicleAnchor(model) {
    const anchor = new THREE.Group();
    anchor.name = `${model.name || 'vehicle'}_anchor`;
    anchor.userData.type = model.userData?.type;
    anchor.userData.id = model.userData?.id;
    anchor.userData.spec = model.userData?.spec ?? null;
    anchor.userData.model = model;
    anchor.userData.origin = 'center';
    anchor.add(model);
    centerModelInAnchor(anchor, model);

    return anchor;
}

function extractVehicleConfig(busModel, api) {
    const spec = busModel.userData?.spec ?? null;
    const specDims = spec?.dimensions ?? null;
    const specTuning = spec?.tuning ?? null;
    busModel.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(busModel);
    const size = box.getSize(new THREE.Vector3());
    let dimensions = isSizeUsable(size)
        ? { width: size.x, height: size.y, length: size.z }
        : { ...FALLBACK_DIMENSIONS };
    if (specDims && Number.isFinite(specDims.width) && Number.isFinite(specDims.height) && Number.isFinite(specDims.length)) {
        dimensions = { width: specDims.width, height: specDims.height, length: specDims.length };
    }

    const wheelRig = api?.wheelRig ?? busModel.userData?.wheelRig ?? null;
    const wheelRadius = clampWheelRadius(spec?.wheel?.radius ?? wheelRig?.wheelRadius ?? 0.55, dimensions);

    const suspensionTuning = api?.getSuspensionTuning?.()
        ?? busModel.userData?.suspensionTuning
        ?? null;

    let wheelbase = 5.5;
    if (wheelRig?.front?.length || wheelRig?.rear?.length) {
        try {
            const pivots = [];
            for (const wheel of wheelRig.front ?? []) {
                const pivot = wheel?.rollPivot ?? wheel?.steerPivot ?? null;
                if (pivot?.getWorldPosition) pivots.push(pivot);
            }
            for (const wheel of wheelRig.rear ?? []) {
                const pivot = wheel?.rollPivot ?? wheel?.steerPivot ?? null;
                if (pivot?.getWorldPosition) pivots.push(pivot);
            }

            if (pivots.length >= 2) {
                busModel.updateMatrixWorld(true);
                let minZ = Infinity;
                let maxZ = -Infinity;
                const worldPos = new THREE.Vector3();
                for (const pivot of pivots) {
                    pivot.getWorldPosition(worldPos);
                    const localPos = busModel.worldToLocal(worldPos.clone());
                    if (!Number.isFinite(localPos.z)) continue;
                    minZ = Math.min(minZ, localPos.z);
                    maxZ = Math.max(maxZ, localPos.z);
                }
                if (Number.isFinite(minZ) && Number.isFinite(maxZ) && maxZ > minZ) {
                    wheelbase = maxZ - minZ;
                }
            }
        } catch {
        }
    }

    return {
        type: 'bus',
        name: busModel.name || busModel.userData?.id || 'Unknown Bus',
        spec,
        tuning: specTuning,
        dimensions,
        wheelbase,
        wheelRadius,
        suspensionTuning,
        wheelCount: Number.isFinite(spec?.wheelCount)
            ? spec.wheelCount
            : (Number.isFinite(wheelRig?.front?.length) ? wheelRig.front.length : 0)
                + (Number.isFinite(wheelRig?.rear?.length) ? wheelRig.rear.length : 0),
        maxSpeedKph: Number.isFinite(spec?.maxSpeedKph) ? spec.maxSpeedKph : 80,
        maxSteerDeg: Number.isFinite(specTuning?.maxSteerDeg) ? specTuning.maxSteerDeg : 55
    };
}

export function createVehicleFromBus(selected, options = {}) {
    const providedAnchor = resolveBusAnchor(selected);

    const model = resolveBusModel(selected);
    if (!model) {
        console.warn('[createVehicleFromBus] No valid bus model provided');
        return null;
    }

    if (providedAnchor) {
        if (providedAnchor.parent) providedAnchor.parent.remove(providedAnchor);
    } else if (model.parent) {
        model.parent.remove(model);
    }

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

    const spec = providedAnchor?.userData?.spec ?? model.userData?.spec ?? null;
    if (spec) {
        model.userData.spec = spec;
        anchor.userData.spec = spec;
    }

    const config = extractVehicleConfig(model, api);

    const id = options.id ?? generateVehicleId();

    return {
        id,
        model,
        anchor,
        api,
        config
    };
}
