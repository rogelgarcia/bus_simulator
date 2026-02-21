// src/graphics/assets3d/generators/TerrainGenerator.js
// Builds the city ground and world tiles
import * as THREE from 'three';
import { TILE } from '../../../app/city/CityMap.js';
import { PbrTextureLoaderService } from '../../content3d/materials/PbrTexturePipeline.js';
import { GROUND_DEFAULTS, ROAD_DEFAULTS } from './GeneratorParams.js';
import { createTreeField } from './TreeGenerator.js';

const EPS = 1e-6;

function ensureUv2(geo) {
    if (!geo?.attributes?.uv || geo.attributes.uv2) return;
    geo.setAttribute('uv2', new THREE.BufferAttribute(geo.attributes.uv.array, 2));
}

function clamp(value, min, max, fallback = min) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function normalizeRoughnessRemap(value) {
    const src = value && typeof value === 'object' ? value : null;
    if (!src) return null;
    const minRaw = Number(src.min);
    const maxRaw = Number(src.max);
    if (!(Number.isFinite(minRaw) && Number.isFinite(maxRaw))) return null;
    const lo = clamp(minRaw, 0.0, 1.0, 0.0);
    const hi = clamp(Math.max(minRaw, maxRaw), 0.0, 1.0, 1.0);
    return { min: lo, max: hi };
}

function applyResolvedPayloadToGroundMaterial(material, payload) {
    if (!material?.isMeshStandardMaterial) return;
    const tex = payload?.textures ?? {};
    const effective = payload?.overrides?.effective ?? {};
    const orm = tex.orm ?? null;

    material.map = tex.baseColor ?? null;
    material.normalMap = tex.normal ?? null;
    material.aoMap = orm ?? tex.ao ?? null;
    material.metalnessMap = orm ?? tex.metalness ?? null;

    const remap = normalizeRoughnessRemap(effective.roughnessRemap);
    const constantRoughness = remap && Math.abs(remap.max - remap.min) <= EPS
        ? clamp(remap.min, 0.0, 1.0, 1.0)
        : null;

    if (constantRoughness !== null) {
        // Without a remap shader in TerrainGenerator materials, a degenerate remap
        // should still force a deterministic roughness value.
        material.roughnessMap = null;
        material.roughness = constantRoughness;
    } else {
        material.roughnessMap = orm ?? tex.roughness ?? null;
        material.roughness = clamp(effective.roughness, 0.0, 1.0, 1.0);
    }

    material.metalness = orm
        ? clamp(effective.metalness, 0.0, 1.0, 1.0)
        : clamp(effective.metalness, 0.0, 1.0, 0.0);
    material.needsUpdate = true;
}

export function createCityWorld({
    size = 800,
    tileMeters = 2,
    map = null,
    config = null,
    groundY = null,
    rng = null
} = {}) {
    const group = new THREE.Group();
    group.name = 'CityWorld';

    const roadSurfaceY = (config?.road?.surfaceY ?? ROAD_DEFAULTS.surfaceY ?? 0);
    let computedGroundY = groundY;
    if (!Number.isFinite(computedGroundY)) {
        const cfgGround = config?.ground?.surfaceY;
        computedGroundY = Number.isFinite(cfgGround) ? cfgGround : roadSurfaceY;
    }

    const FLOOR_EPS = 0.001;

    const floorGeo = new THREE.PlaneGeometry(size, size, 1, 1);
    floorGeo.rotateX(-Math.PI / 2);

    const floorMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 1.0,
        metalness: 0.0
    });
    floorMat.polygonOffset = true;
    floorMat.polygonOffsetFactor = 1;
    floorMat.polygonOffsetUnits = 1;

    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.name = 'CityFloor';
    floor.position.y = computedGroundY - FLOOR_EPS;
    floor.receiveShadow = true;
    floor.renderOrder = -30;
    group.add(floor);

    let groundTiles = null;
    let tilesMat = null;
    let gridLines = null;
    let tileGeo = null;

    if (map) {
        tileGeo = new THREE.PlaneGeometry(map.tileSize, map.tileSize, 1, 1);
        tileGeo.rotateX(-Math.PI / 2);

        tilesMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 1.0,
            metalness: 0.0
        });
        tilesMat.polygonOffset = true;
        tilesMat.polygonOffsetFactor = 1;
        tilesMat.polygonOffsetUnits = 1;

        groundTiles = new THREE.InstancedMesh(tileGeo, tilesMat, map.width * map.height);
        groundTiles.name = 'GroundTiles';
        groundTiles.receiveShadow = true;
        groundTiles.renderOrder = -29;

        const dummy = new THREE.Object3D();
        let k = 0;

        for (let y = 0; y < map.height; y++) {
            for (let x = 0; x < map.width; x++) {
                const idx = map.index(x, y);
                if (map.kind[idx] === TILE.ROAD) continue;

                const p = map.tileToWorldCenter(x, y);
                dummy.position.set(p.x, computedGroundY, p.z);
                dummy.rotation.set(0, 0, 0);
                dummy.scale.set(1, 1, 1);
                dummy.updateMatrix();

                groundTiles.setMatrixAt(k++, dummy.matrix);
            }
        }

        groundTiles.count = k;
        groundTiles.instanceMatrix.needsUpdate = true;

        group.add(groundTiles);
    }

    let trees = null;
    const treesEnabled = config?.render?.treesEnabled;
    if (map && rng && treesEnabled !== false) {
        trees = createTreeField({ map, rng, groundY: computedGroundY, config });
        group.add(trees.group);
    }

    if (map) {
        const half = map.tileSize * 0.5;
        const minX = map.origin.x - half;
        const minZ = map.origin.z - half;
        const maxX = minX + map.width * map.tileSize;
        const maxZ = minZ + map.height * map.tileSize;
        const y = computedGroundY + 0.002;

        const verts = [];
        for (let x = 0; x <= map.width; x++) {
            const xPos = minX + x * map.tileSize;
            verts.push(xPos, y, minZ, xPos, y, maxZ);
        }
        for (let z = 0; z <= map.height; z++) {
            const zPos = minZ + z * map.tileSize;
            verts.push(minX, y, zPos, maxX, y, zPos);
        }

        const gridGeo = new THREE.BufferGeometry();
        gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));

        const gridMat = new THREE.LineBasicMaterial({
            color: 0x2f2f2f,
            transparent: true,
            opacity: 0.45
        });

        gridLines = new THREE.LineSegments(gridGeo, gridMat);
        gridLines.name = 'TileGrid';
        gridLines.renderOrder = -28;
        group.add(gridLines);
    }

    ensureUv2(floorGeo);
    ensureUv2(tileGeo);

    const loader = new THREE.TextureLoader();
    const pbrLoader = new PbrTextureLoaderService({ textureLoader: loader });

    const worldRepeats = Math.max(1, size / Math.max(0.1, tileMeters));
    const tileRepeats = map ? Math.max(1, map.tileSize / Math.max(0.1, tileMeters)) : null;

    const floorPayload = pbrLoader.resolveMaterial('pbr.grass_004', {
        cloneTextures: true,
        repeat: { x: worldRepeats, y: worldRepeats },
        diagnosticsTag: 'TerrainGenerator.floor'
    });
    applyResolvedPayloadToGroundMaterial(floor.material, floorPayload);

    if (tilesMat && tileRepeats) {
        const tilePayload = pbrLoader.resolveMaterial('pbr.grass_004', {
            cloneTextures: true,
            repeat: { x: tileRepeats, y: tileRepeats },
            diagnosticsTag: 'TerrainGenerator.tiles'
        });
        applyResolvedPayloadToGroundMaterial(tilesMat, tilePayload);
    }

    // TerrainGenerator is synchronous; calibration loads async on first use.
    // Re-apply once calibration arrives so ground materials reflect correction files.
    Promise.resolve()
        .then(() => pbrLoader.preloadCalibrationForMaterialIds(['pbr.grass_004'], { forceReload: true }))
        .then(() => {
            const refreshedFloorPayload = pbrLoader.resolveMaterial('pbr.grass_004', {
                cloneTextures: true,
                repeat: { x: worldRepeats, y: worldRepeats },
                diagnosticsTag: 'TerrainGenerator.floor.calibrated'
            });
            applyResolvedPayloadToGroundMaterial(floor.material, refreshedFloorPayload);

            if (tilesMat && tileRepeats) {
                const refreshedTilePayload = pbrLoader.resolveMaterial('pbr.grass_004', {
                    cloneTextures: true,
                    repeat: { x: tileRepeats, y: tileRepeats },
                    diagnosticsTag: 'TerrainGenerator.tiles.calibrated'
                });
                applyResolvedPayloadToGroundMaterial(tilesMat, refreshedTilePayload);
            }
        })
        .catch(() => {});

    return { group, floor, groundTiles, gridLines, trees };
}
