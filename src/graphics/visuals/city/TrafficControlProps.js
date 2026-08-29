// src/graphics/visuals/city/TrafficControlProps.js
// Renders traffic control props (traffic lights / stop signs) from placement data.
import * as THREE from 'three';
import {
    STATIC_VISIBILITY_CATEGORY,
    createTrafficControlVisibilityId
} from '../../../app/city/visibility/index.js';
import { createTrafficControlVisualAsset } from './TrafficControlVisualRegistry.js';

export function createTrafficControlProps({ placements = [], useSolidMaterials = true } = {}) {
    const group = new THREE.Group();
    group.name = 'TrafficControls';

    const list = Array.isArray(placements) ? placements : [];
    for (let placementIndex = 0; placementIndex < list.length; placementIndex += 1) {
        const placement = list[placementIndex];
        const kind = placement?.kind ?? null;
        const entry = createTrafficControlVisualAsset(kind, { useSolidMaterials });
        const asset = entry?.asset ?? null;
        const mesh = asset?.mesh ?? null;
        if (!mesh) continue;

        entry?.spec?.applyPlacement?.(asset, placement);

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

    return { group, placements: list };
}
