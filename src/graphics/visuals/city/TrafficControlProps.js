// src/graphics/visuals/city/TrafficControlProps.js
// Renders traffic control props (traffic lights / stop signs) from placement data.
import * as THREE from 'three';
import {
    STATIC_VISIBILITY_CATEGORY,
    createTrafficControlVisibilityId
} from '../../../app/city/visibility/index.js';
import { mergeCompatibleMaterialGroups } from '../../engine3d/procedural_meshes/SmartMaterialGroupMerger.js';
import { createTrafficControlVisualAsset } from './TrafficControlVisualRegistry.js';

export function createTrafficControlProps({
    placements = [],
    useSolidMaterials = true,
    mergeMaterialGroups = useSolidMaterials
} = {}) {
    const group = new THREE.Group();
    group.name = 'TrafficControls';
    const materialGroupMerge = {
        candidates: 0,
        merged: 0,
        sourceMaterials: 0,
        outputMaterials: 0,
        addedAttributeBytes: 0,
        geometryByteDelta: 0,
        expandedToNonIndexed: 0,
        skipped: {}
    };

    const list = Array.isArray(placements) ? placements : [];
    for (let placementIndex = 0; placementIndex < list.length; placementIndex += 1) {
        const placement = list[placementIndex];
        const kind = placement?.kind ?? null;
        const entry = createTrafficControlVisualAsset(kind, { useSolidMaterials });
        const asset = entry?.asset ?? null;
        const mesh = asset?.mesh ?? null;
        if (!mesh) continue;

        entry?.spec?.applyPlacement?.(asset, placement);
        if (mergeMaterialGroups) {
            materialGroupMerge.candidates += 1;
            const merge = mergeCompatibleMaterialGroups(mesh, { disposeSourceGeometry: true });
            if (merge.merged) {
                materialGroupMerge.merged += 1;
                materialGroupMerge.sourceMaterials += merge.sourceMaterialCount ?? 0;
                materialGroupMerge.outputMaterials += merge.outputMaterialCount ?? 0;
                materialGroupMerge.addedAttributeBytes += merge.addedAttributeBytes ?? 0;
                materialGroupMerge.geometryByteDelta += merge.geometryByteDelta ?? 0;
                if (merge.expandedToNonIndexed) materialGroupMerge.expandedToNonIndexed += 1;
            } else {
                const reason = merge.reason ?? 'unknown';
                materialGroupMerge.skipped[reason] = (materialGroupMerge.skipped[reason] ?? 0) + 1;
            }
        }

        const instance = new THREE.Group();
        instance.name = entry?.spec?.instanceName ?? 'TrafficControl';

        const p = placement?.position ?? null;
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)) {
            instance.position.set(p.x, p.y, p.z);
        }

        const yaw = placement?.rotationY;
        if (Number.isFinite(yaw)) instance.rotation.y = yaw;

        const scale = placement?.scale;
        if (Number.isFinite(scale) && scale > 0) instance.scale.setScalar(scale);

        instance.userData.trafficControl = {
            kind,
            tile: placement?.tile ?? null,
            corner: placement?.corner ?? null,
            approach: placement?.approach ?? null
        };
        const category = instance.name === 'TrafficLight'
            ? STATIC_VISIBILITY_CATEGORY.TRAFFIC_LIGHTS
            : STATIC_VISIBILITY_CATEGORY.TRAFFIC_SIGNS;
        instance.userData.staticVisibility = {
            id: createTrafficControlVisibilityId(category, placementIndex),
            category
        };

        instance.add(mesh);
        group.add(instance);
    }

    return { group, placements: list, materialGroupMerge };
}
