// Displays an explicitly schematic city plan without activating flat terrain or city bake caches.
// @ts-check
import * as THREE from 'three';
import { CityMap } from '../../../app/city/CityMap.js';
import { createCityConfig } from '../../../app/city/CityConfig.js';
import { landscapePointToCity } from '../../../app/landscape/LandscapeCityBinding.js';

/** @param {object} spec */
export function createLandscapeReferenceCity(spec) {
    const genConfig = createCityConfig({ size: Math.max(spec.width, spec.height) * spec.tileSize, mapTileSize: spec.tileSize, seed: spec.seed });
    const map = CityMap.fromSpec(spec, genConfig);
    const group = new THREE.Group();
    group.name = 'LandscapeReferencePlan';
    const positions = [];
    const segment = (a, b) => positions.push(a.x, 0.02, a.z, b.x, 0.02, b.z);
    const loop = points => points.forEach((point, index) => segment(point, points[(index + 1) % points.length]));
    const minX = map.origin.x - map.tileSize / 2, minZ = map.origin.z - map.tileSize / 2;
    const maxX = minX + map.width * map.tileSize, maxZ = minZ + map.height * map.tileSize;
    const stride = Math.max(1, Math.ceil(Math.max(map.width, map.height) / 512));
    for (let column = 0; column <= map.width; column += stride) segment({ x: minX + column * map.tileSize, z: minZ }, { x: minX + column * map.tileSize, z: maxZ });
    for (let row = 0; row <= map.height; row += stride) segment({ x: minX, z: minZ + row * map.tileSize }, { x: maxX, z: minZ + row * map.tileSize });
    loop([{ x: minX, z: minZ }, { x: maxX, z: minZ }, { x: maxX, z: maxZ }, { x: minX, z: maxZ }]);
    for (const building of map.buildings) for (const points of building.footprintLoops ?? []) loop(points);
    for (const reservation of map.reservations) for (const points of reservation.loops ?? []) loop(points);
    for (const road of map.roadSegments) {
        const points = road.points ?? [map.tileToWorldCenter(road.a.x, road.a.y), map.tileToWorldCenter(road.b.x, road.b.y)];
        for (let i = 1; i < points.length; i++) segment(points[i - 1], points[i]);
    }
    const extent = map.landscape.extent;
    loop([
        { x: extent.minX, z: extent.minZ }, { x: extent.maxX, z: extent.minZ },
        { x: extent.maxX, z: extent.maxZ }, { x: extent.minX, z: extent.maxZ }
    ].map(point => landscapePointToCity(map.landscape, point)));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color: 0x83cee7 });
    group.add(new THREE.LineSegments(geometry, material));
    let restore = null;
    return {
        isLandscapeReferencePlan: true, map, group, genConfig,
        config: { size: genConfig.size, fogNear: 1e5, fogFar: 1e6 },
        attach(engine) {
            restore = { background: engine.scene.background, fog: engine.scene.fog, far: engine.camera.far };
            engine.scene.background = new THREE.Color(0x0b1621);
            engine.scene.fog = null;
            engine.camera.far = Math.max(engine.camera.far, genConfig.size * 5);
            engine.camera.updateProjectionMatrix();
            engine.scene.add(group);
        },
        detach(engine) {
            engine.scene.remove(group);
            if (!restore) return;
            engine.scene.background = restore.background;
            engine.scene.fog = restore.fog;
            engine.camera.far = restore.far;
            engine.camera.updateProjectionMatrix();
            restore = null;
        },
        update() {},
        dispose() { geometry.dispose(); material.dispose(); }
    };
}
