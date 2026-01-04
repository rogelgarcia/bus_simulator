// src/graphics/assets3d/generators/TerrainGenerator.js
// Builds the city ground and world tiles
import * as THREE from 'three';
import { TILE } from '../../../app/city/CityMap.js';
import { GROUND_DEFAULTS, ROAD_DEFAULTS } from './GeneratorParams.js';
import { createTreeField } from './TreeGenerator.js';

function applyTextureColorSpace(tex, { srgb = true } = {}) {
    if ('colorSpace' in tex) {
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        return;
    }
    if ('encoding' in tex) tex.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
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

    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.name = 'CityFloor';
    // Put the base grass plane slightly below the shared surface to avoid z-fighting with asphalt.
    // The instanced grass tiles still sit on the true surface Y.
    floor.position.y = computedGroundY - FLOOR_EPS;
    floor.receiveShadow = true;
    floor.renderOrder = -30;
    group.add(floor);

    let groundTiles = null;
    let tilesMat = null;
    let gridLines = null;

    if (map) {
        const tileGeo = new THREE.PlaneGeometry(map.tileSize, map.tileSize, 1, 1);
        tileGeo.rotateX(-Math.PI / 2);

        tilesMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 1.0,
            metalness: 0.0
        });

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

    const grassUrl = new URL('../../../../assets/grass.png', import.meta.url);
    const loader = new THREE.TextureLoader();

    loader.load(
        grassUrl.href,
        (tex) => {
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            const repeats = Math.max(1, size / Math.max(0.1, tileMeters));
            tex.repeat.set(repeats, repeats);
            tex.anisotropy = 16;
            applyTextureColorSpace(tex, { srgb: true });

            floor.material.map = tex;
            floor.material.needsUpdate = true;

            if (tilesMat && map) {
                const t2 = tex.clone();
                t2.wrapS = THREE.RepeatWrapping;
                t2.wrapT = THREE.RepeatWrapping;

                const tileRepeat = Math.max(1, map.tileSize / Math.max(0.1, tileMeters));
                t2.repeat.set(tileRepeat, tileRepeat);
                t2.anisotropy = 16;
                applyTextureColorSpace(t2, { srgb: true });

                tilesMat.map = t2;
                tilesMat.needsUpdate = true;
            }
        },
        undefined,
        (err) => console.warn('[CityWorld] Failed to load grass texture:', grassUrl.href, err)
    );

    return { group, floor, groundTiles, gridLines, trees };
}
