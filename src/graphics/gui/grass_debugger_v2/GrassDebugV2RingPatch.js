// Compare a cropped canopy block with one continuous, two-card silhouette ring.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2RingBake } from './GrassDebugV2RingBake.js';
import { createGrassDebugV2FloorMaterial } from './GrassDebugV2FloorMaterial.js';
import { createGrassDebugV2SideBake, GRASS_V2_SIDE_ALPHA_TEST } from './GrassDebugV2SideBake.js';

export const GRASS_V2_RING_RECIPE = Object.freeze({
    cropMeters: 0.005, baseHeightFraction: 0.7, hingeHeightFraction: 0.5, lowerInclinationDegrees: 15,
    upperOutsetMeters: 0.02, upperSpanFraction: 0.3, stripDepth: 0.12, leafFraction: 0.4, canopyOcclusionStrength: 0.5
});

/** @param {{renderer:THREE.WebGLRenderer,source:THREE.Group,x:number,z:number,recipe?:Partial<typeof GRASS_V2_RING_RECIPE>}} options */
export async function createGrassDebugV2RingPatch({ renderer, source, x, z, recipe = {} }) {
    const config = Object.freeze({ ...GRASS_V2_RING_RECIPE, ...recipe });
    if (!Object.values(config).every(Number.isFinite)
        || !(config.cropMeters >= 0 && config.cropMeters < 0.5)
        || !(config.baseHeightFraction > 0 && config.baseHeightFraction < 1)
        || !(config.hingeHeightFraction > 0 && config.hingeHeightFraction < 1)
        || !(config.lowerInclinationDegrees >= 0 && config.lowerInclinationDegrees < 80)
        || !(config.upperOutsetMeters >= 0 && config.upperOutsetMeters <= 0.5)
        || !(config.upperSpanFraction > 0 && config.upperSpanFraction <= 1)
        || !(config.stripDepth > 0 && config.stripDepth < 0.5)
        || !(config.leafFraction > 0 && config.leafFraction <= 1)
        || !(config.canopyOcclusionStrength >= 0 && config.canopyOcclusionStrength <= 1))
        throw new Error('Invalid grass ring recipe.');
    const sourceHeight = new THREE.Box3().setFromObject(source).max.y;
    if (![x, z, sourceHeight].every(Number.isFinite) || !(sourceHeight > 0))
        throw new Error('Grass ring requires a finite position and positive source height.');
    const leafColorScale = new THREE.Vector3(1, 1, 1), cropMeters = config.cropMeters, blockSize = 1 - 2 * cropMeters;
    const baseHeight = sourceHeight * config.baseHeightFraction, group = new THREE.Group();
    group.name = 'GrassV2BentRingPatch'; group.position.set(x, 0, z);
    const hingeHeight = sourceHeight * config.hingeHeightFraction, leafFraction = config.leafFraction;
    const lowerOutset = hingeHeight * Math.tan(THREE.MathUtils.degToRad(config.lowerInclinationDegrees));
    const outerOverhang = lowerOutset + (sourceHeight - hingeHeight) * config.upperOutsetMeters / (sourceHeight * config.upperSpanFraction);
    const profile = [
        { height: 0, halfWidth: 0.5 },
        { height: hingeHeight, halfWidth: 0.5 + lowerOutset },
        { height: sourceHeight, halfWidth: 0.5 + outerOverhang }
    ];
    const wallBake = await createGrassDebugV2SideBake({ renderer, source, maxHeightFraction: config.baseHeightFraction });
    // The bottom meets the original metre border; only the upper rim retains the 5 mm crop.
    const baseSize = 1, wallLength = Math.hypot(baseHeight, cropMeters);
    const wallInclination = Math.atan2(-cropMeters, baseHeight);
    const wallTilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), wallInclination);
    const wallCaptureToCard = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationX(-wallInclination));
    const wallGeometry = new THREE.BufferGeometry();
    wallGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
        -blockSize / 2, wallLength / 2, 0, blockSize / 2, wallLength / 2, 0,
        -baseSize / 2, -wallLength / 2, 0, baseSize / 2, -wallLength / 2, 0
    ], 3));
    wallGeometry.setAttribute('uv', new THREE.Float32BufferAttribute([
        cropMeters, 1, 1 - cropMeters, 1, 0, 0, 1, 0
    ], 2));
    wallGeometry.setIndex([0, 2, 1, 2, 3, 1]); wallGeometry.computeVertexNormals();
    const floorGeometry = new THREE.PlaneGeometry(blockSize, blockSize); floorGeometry.rotateX(-Math.PI / 2);
    const floorUv = floorGeometry.attributes.uv;
    for (let i = 0; i < floorUv.count; i++) floorUv.setXY(i,
        cropMeters + floorUv.getX(i) * blockSize, cropMeters + floorUv.getY(i) * blockSize);
    const materials = [], walls = [], rings = [], geometries = [wallGeometry, floorGeometry];
    for (const view of wallBake.views) {
        const material = createGrassDebugV2FloorMaterial(view.textures, { leafColorScale, captureToCard: wallCaptureToCard });
        material.alphaTest = GRASS_V2_SIDE_ALPHA_TEST; material.alphaToCoverage = true; materials.push(material);
        const wall = new THREE.Mesh(wallGeometry, material); wall.name = 'GrassV2BentRingWall-' + view.id;
        wall.position.copy(view.outward).multiplyScalar((baseSize + blockSize) / 4).setY(baseHeight / 2);
        wall.quaternion.copy(view.quaternion).multiply(wallTilt); wall.receiveShadow = true; wall.castShadow = false;
        walls.push(wall); group.add(wall);
    }
    // One upright capture per side spans both cards. A shared UV row at the hinge
    // keeps each captured leaf continuous instead of restarting its image per card.
    const bake = await createGrassDebugV2RingBake({ renderer, source, sourceHeight, bottomHeight: profile[0].height,
        inset: 0, outset: 0, capturePadding: outerOverhang, stripDepth: config.stripDepth, leafFraction });
    const segments = [];
    for (let segment = 0; segment < 2; segment++) {
        const lower = profile[segment], upper = profile[segment + 1];
        const height = upper.height - lower.height, outward = upper.halfWidth - lower.halfWidth;
        const length = Math.hypot(height, outward), inclination = Math.atan2(outward, height);
        const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), inclination);
        const captureToCard = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationX(-inclination));
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute([
            -upper.halfWidth, length / 2, 0, upper.halfWidth, length / 2, 0,
            -lower.halfWidth, -length / 2, 0, lower.halfWidth, -length / 2, 0
        ], 3));
        const u = halfWidth => 0.5 - halfWidth / (2 * bake.captureHalfWidth);
        const v = height => (height - profile[0].height) / (sourceHeight - profile[0].height);
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
            u(upper.halfWidth), v(upper.height), 1 - u(upper.halfWidth), v(upper.height),
            u(lower.halfWidth), v(lower.height), 1 - u(lower.halfWidth), v(lower.height)
        ], 2));
        geometry.setIndex([0, 2, 1, 2, 3, 1]); geometry.computeVertexNormals(); geometries.push(geometry);
        for (const view of bake.views) {
            const material = createGrassDebugV2FloorMaterial(view.textures, { leafColorScale, captureToCard, canopyOcclusionStrength: config.canopyOcclusionStrength });
            material.alphaTest = GRASS_V2_SIDE_ALPHA_TEST; material.alphaToCoverage = true; materials.push(material);
            const card = new THREE.Mesh(geometry, material);
            card.name = 'GrassV2OuterRing-' + view.id + '-' + (segment === 0 ? 'lower' : 'upper');
            card.userData.ringSide = view.id; card.userData.ringSegment = segment;
            card.position.copy(view.outward).multiplyScalar((lower.halfWidth + upper.halfWidth) / 2).setY((lower.height + upper.height) / 2);
            card.quaternion.copy(view.quaternion).multiply(tilt);
            card.receiveShadow = card.castShadow = true;
            group.add(card); rings.push(card);
        }
        segments.push({ startHeightFraction: lower.height / sourceHeight, endHeightFraction: upper.height / sourceHeight,
            startHalfWidth: lower.halfWidth, endHalfWidth: upper.halfWidth, inclinationDegrees: THREE.MathUtils.radToDeg(inclination) });
    }
    const ringDetails = { id: 'outer', label: 'Outer ring', cards: 8, cardsPerSide: 2, triangles: 16, castShadow: true,
        stripDepthMeters: config.stripDepth, leafFraction, canopyOcclusionStrength: config.canopyOcclusionStrength, startHeightFraction: 0, endHeightFraction: 1, outsetMeters: outerOverhang };
    return Object.freeze({ group, baseHeight, cropMeters, floorGeometry, leafColorScale, walls: Object.freeze(walls), rings: Object.freeze(rings),
        bakes: Object.freeze([bake]), wallBake,
        getSnapshot: () => ({ recipe: { ...config }, leafColorScale: leafColorScale.toArray(), baseHeight, heightFraction: config.baseHeightFraction, sourceHeight, cropMeters, blockSize, baseSize, topSize: blockSize,
            ringCount: 1, originalBorderHalfWidth: 0.5, outerOverhang, segments: segments.map(segment => ({ ...segment })),
            wallTriangles: 8, silhouetteTriangles: 16, floorTriangles: 2, shadowOnlyTriangles: 0, visibleTriangles: 26, triangles: 26,
            rings: [{ ...ringDetails }], wallBake: wallBake.getSnapshot(), bakes: [bake.getSnapshot()] }),
        dispose: () => { geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
            bake.dispose(); wallBake.dispose(); }
    });
}
