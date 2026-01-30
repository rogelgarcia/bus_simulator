// Harness scenario: window mesh interior parallax (atlas load + camera motion).
import { WindowMeshGenerator } from '/src/graphics/assets3d/generators/buildings/WindowMeshGenerator.js';
import { getDefaultWindowMeshSettings, sanitizeWindowMeshSettings, WINDOW_INTERIOR_ATLAS_ID } from '/src/app/buildings/window_mesh/index.js';

function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}

function getUvBounds(attr) {
    const a = attr?.isBufferAttribute ? attr : null;
    const arr = a?.array;
    if (!arr || !Number.isFinite(arr.length) || arr.length < 2) return null;

    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;

    for (let i = 0; i < arr.length; i += 2) {
        const u = Number(arr[i]);
        const v = Number(arr[i + 1]);
        if (!Number.isFinite(u) || !Number.isFinite(v)) continue;
        if (u < minU) minU = u;
        if (u > maxU) maxU = u;
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
    }

    if (!Number.isFinite(minU) || !Number.isFinite(maxU) || !Number.isFinite(minV) || !Number.isFinite(maxV)) return null;
    return { minU, maxU, minV, maxV };
}

export const scenarioWindowMeshInteriorParallax = {
    id: 'window_mesh_interior_parallax',
    async create({ engine, THREE, seed, options }) {
        engine.clearScene();

        const root = new THREE.Group();
        root.name = 'WindowMeshInteriorParallax';
        engine.scene.add(root);

        const hemi = new THREE.HemisphereLight(0xffffff, 0x070a10, 0.75);
        hemi.position.set(0, 6, 0);
        root.add(hemi);

        const sun = new THREE.DirectionalLight(0xffffff, 2.1);
        sun.position.set(6, 10, 8);
        sun.target.position.set(0, 0.8, 0);
        root.add(sun);
        root.add(sun.target);

        const atlasIdRaw = typeof options?.atlasId === 'string' ? options.atlasId : WINDOW_INTERIOR_ATLAS_ID.RESIDENTIAL_4X4;
        const atlasId = atlasIdRaw || WINDOW_INTERIOR_ATLAS_ID.RESIDENTIAL_4X4;

        const base = getDefaultWindowMeshSettings();

        const parallaxDepthMeters = clampNumber(options?.parallaxDepthMeters, 0.0, 50.0, 12.0);
        const uvZoom = clampNumber(options?.uvZoom, 0.25, 20.0, base?.interior?.uvZoom ?? 1.0);
        const imageAspect = clampNumber(options?.imageAspect, 0.25, 4.0, base?.interior?.imageAspect ?? 1.0);
        const parallaxScaleX = clampNumber(options?.parallaxScaleX, 0.0, 10.0, base?.interior?.parallaxScale?.x ?? 1.0);
        const parallaxScaleY = clampNumber(options?.parallaxScaleY, 0.0, 10.0, base?.interior?.parallaxScale?.y ?? 1.0);
        const interiorZOffset = clampNumber(options?.interiorZOffset, -1.0, 1.0, base?.interior?.zOffset ?? 0.0);
        const glassOpacity = clampNumber(options?.glassOpacity, 0.0, 1.0, 0.0);
        const emissiveIntensity = clampNumber(options?.emissiveIntensity, 0.0, 5.0, base?.interior?.emissiveIntensity ?? 0.0);
        const uvPanX = clampNumber(options?.uvPanX, -2.0, 2.0, 0.0);
        const uvPanY = clampNumber(options?.uvPanY, -2.0, 2.0, 0.0);
        const cameraAmplitudeX = clampNumber(options?.cameraAmplitudeX, 0.0, 2.0, 0.45);
        const cameraAmplitudeY = clampNumber(options?.cameraAmplitudeY, 0.0, 2.0, 0.0);
        const cameraSpeed = clampNumber(options?.cameraSpeed, 0.0, 10.0, 1.1);
        const settings = sanitizeWindowMeshSettings({
            ...base,
            glass: { ...base.glass, opacity: glassOpacity, tintHex: 0xffffff },
            shade: { ...base.shade, enabled: false },
            interior: {
                ...base.interior,
                enabled: true,
                atlasId,
                randomizeCell: false,
                cell: { col: 0, row: 0 },
                randomFlipX: false,
                uvPan: { x: uvPanX, y: uvPanY },
                uvZoom,
                imageAspect,
                parallaxDepthMeters,
                parallaxScale: { x: parallaxScaleX, y: parallaxScaleY },
                zOffset: interiorZOffset,
                emissiveIntensity,
                tintVariation: {
                    hueShiftDeg: { min: 0.0, max: 0.0 },
                    saturationMul: { min: 1.0, max: 1.0 },
                    brightnessMul: { min: 1.0, max: 1.0 }
                }
            }
        });

        const cameraBase = {
            x: 0.0,
            y: 0.8,
            z: 3.1
        };

        engine.camera.position.set(cameraBase.x, cameraBase.y, cameraBase.z);
        engine.camera.lookAt(0, cameraBase.y, 0);

        const generator = new WindowMeshGenerator({ renderer: engine.renderer, curveSegments: 28 });
        const instances = Object.freeze([
            { id: 'center', position: { x: 0, y: cameraBase.y, z: 0 }, yaw: 0 }
        ]);
        const windowGroup = generator.createWindowGroup({ settings, seed: String(seed ?? ''), instances });
        root.add(windowGroup);

        const openingGeo = Array.isArray(windowGroup?.userData?.ownedGeometries) ? windowGroup.userData.ownedGeometries[0] : null;
        const openingUvBounds = getUvBounds(openingGeo?.attributes?.uv);

        const layers = windowGroup?.userData?.layers ?? null;
        if (layers) {
            if (layers.frame) layers.frame.visible = false;
            if (layers.muntins) layers.muntins.visible = false;
            if (layers.glass) layers.glass.visible = false;
            if (layers.shade) layers.shade.visible = false;
            if (layers.interior) layers.interior.visible = true;
        }

        const atlasTexture = windowGroup?.userData?.materials?.interiorMat?.map ?? null;
        const getAtlasInfo = () => {
            const tex = atlasTexture;
            const img = tex?.image ?? null;
            const tag = typeof img?.tagName === 'string' ? img.tagName : null;
            const width = Number(img?.naturalWidth ?? img?.videoWidth ?? img?.width) || 0;
            const height = Number(img?.naturalHeight ?? img?.videoHeight ?? img?.height) || 0;
            const complete = img && 'complete' in img ? !!img.complete : null;
            return { tag, width, height, complete };
        };

        const interiorMesh = layers?.interior?.children?.find((m) => !!m && m.isInstancedMesh) ?? null;

        return {
            update(_dt, { nowMs } = {}) {
                const t = (Number(nowMs) || 0) / 1000;
                const sx = Math.sin(t * cameraSpeed);
                const sy = Math.cos(t * cameraSpeed);
                const x = cameraBase.x + sx * cameraAmplitudeX;
                const y = cameraBase.y + sy * cameraAmplitudeY;
                engine.camera.position.set(x, y, cameraBase.z);
                engine.camera.lookAt(0, cameraBase.y, 0);
            },
            getMetrics() {
                return {
                    seed: String(seed ?? ''),
                    params: {
                        atlasId,
                        parallaxDepthMeters,
                        uvZoom,
                        imageAspect,
                        parallaxScaleX,
                        parallaxScaleY,
                        interiorZOffset,
                        glassOpacity,
                        emissiveIntensity,
                        uvPanX,
                        uvPanY,
                        cameraAmplitudeX,
                        cameraAmplitudeY,
                        cameraSpeed
                    },
                    atlas: getAtlasInfo(),
                    uvBounds: openingUvBounds,
                    camera: {
                        x: engine.camera.position.x,
                        y: engine.camera.position.y,
                        z: engine.camera.position.z
                    },
                    objects: {
                        windowGroupChildren: windowGroup.children.length,
                        interiorPlaneLocalZ: interiorMesh ? interiorMesh.position.z : null
                    }
                };
            },
            dispose() {
                root.removeFromParent();
                const ownedGeos = windowGroup?.userData?.ownedGeometries ?? [];
                for (const geo of Array.isArray(ownedGeos) ? ownedGeos : []) geo?.dispose?.();
                const mats = windowGroup?.userData?.materials ?? null;
                if (mats && typeof mats === 'object') {
                    const uniq = new Set(Object.values(mats));
                    for (const mat of uniq) mat?.dispose?.();
                }
                generator.dispose();
            }
        };
    }
};
