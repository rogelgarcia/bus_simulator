// src/assets3d/factories/tuneBusMaterials.js
import * as THREE from 'three';

function isNonBlack(c) {
    return !!c && (c.r > 0.0001 || c.g > 0.0001 || c.b > 0.0001);
}

export function tuneBusMaterials(bus, {
    colorScale = 0.78,
    roughness = 0.90,
    metalness = 0.00,
    envMapIntensity = 0.25
} = {}) {
    bus.traverse((o) => {
        if (!o.isMesh || !o.material) return;

        const mats = Array.isArray(o.material) ? o.material : [o.material];

        for (const m of mats) {
            if (!m) continue;

            // ✅ Don’t touch glass/decal/transparent
            if (m.transparent || (typeof m.opacity === 'number' && m.opacity < 1)) continue;
            if (m.userData?.noTune) continue;

            // Don’t touch emissive (lights)
            if (isNonBlack(m.emissive)) continue;
            if (m.isMeshBasicMaterial) continue;

            if (!m.userData) m.userData = {};
            if (!m.userData._baseColor && m.color) m.userData._baseColor = m.color.clone();

            if (m.color && m.userData._baseColor) {
                m.color.copy(m.userData._baseColor).multiplyScalar(colorScale);
            }

            if ('roughness' in m) m.roughness = THREE.MathUtils.clamp(roughness, 0, 1);
            if ('metalness' in m) m.metalness = THREE.MathUtils.clamp(metalness, 0, 1);
            if ('envMapIntensity' in m) m.envMapIntensity = envMapIntensity;

            m.needsUpdate = true;
        }
    });
}
