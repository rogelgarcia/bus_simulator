// Shared source geometry provides the current leaf or reference tuft catalog.
// The invertible affine shape transform preserves leaf separation and applies identically to every LOD.
// @ts-check
import * as THREE from 'three';
import { GRASS_V2_PLANT } from './GrassDebugV2Plant.js';

/** @typedef {'LOD0'|'refined'|'detailed'|'curved'|'split'} TuftMode */
/** @typedef {{leaves: number, cards: number, triangles: number}} TuftCounts */
/** @typedef {{heightMeters: number, leafLengthMeters: number, forwardReachMeters: number, inclinationDegrees: number, curvatureDegrees: number, heightRatio: number, lengthRatio: number, curvatureRatio: number}} TuftShapeMetrics */
/** @typedef {{id: string, label: string, description: string, metrics: Readonly<TuftShapeMetrics>}} TuftDefinition */
/** @typedef {{group: THREE.Group, setMode: (mode: TuftMode) => void, setBoundaries: (enabled: boolean) => void, getCounts: (mode: TuftMode) => Readonly<TuftCounts>, dispose: () => void}} AuthoringTuft */

const CARD_MODES = Object.freeze(['refined', 'detailed', 'curved', 'split']);
const ROOT_DEPTH = GRASS_V2_PLANT.rootDepthMeters;

function leafPoints(leaf, matrix) {
    leaf.updateMatrix();
    const transform = matrix.clone().multiply(leaf.matrix);
    const { position, uv } = leaf.geometry.attributes;
    const points = [];
    for (let index = 0; index < position.count; index++) {
        if (Math.abs(uv.getX(index) - 0.5) < 0.00001 && uv.getY(index) >= GRASS_V2_PLANT.collarJoin) {
            points.push(new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(transform));
        }
    }
    return points;
}

function measureShape(plant, matrix) {
    const point = new THREE.Vector3(), bounds = new THREE.Box3();
    const lengths = [], angles = [], curvature = [];
    for (const leaf of plant.leaves) {
        leaf.updateMatrix();
        const transform = matrix.clone().multiply(leaf.matrix), positions = leaf.geometry.attributes.position;
        for (let index = 0; index < positions.count; index++) {
            bounds.expandByPoint(point.fromBufferAttribute(positions, index).applyMatrix4(transform));
        }
        const points = leafPoints(leaf, matrix), first = points[0], last = points.at(-1);
        const direction = last.clone().sub(first), tangents = [];
        let length = 0, turning = 0;
        for (let index = 1; index < points.length; index++) {
            const tangent = points[index].clone().sub(points[index - 1]);
            length += tangent.length();
            if (tangent.lengthSq() > 1e-12) tangents.push(tangent.normalize());
        }
        for (let index = 1; index < tangents.length; index++) turning += tangents[index - 1].angleTo(tangents[index]);
        lengths.push(length);
        angles.push(THREE.MathUtils.radToDeg(Math.atan2(direction.y, Math.hypot(direction.x, direction.z))));
        curvature.push(THREE.MathUtils.radToDeg(turning));
    }
    const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;
    return { heightMeters: bounds.max.y, leafLengthMeters: average(lengths),
        forwardReachMeters: bounds.max.z - bounds.min.z, inclinationDegrees: average(angles), curvatureDegrees: average(curvature) };
}

function uprightMatrix(plant, originalHeight) {
    const curveContribution = 0.45, forwardLift = 0.30, forwardScale = 0.62;
    const matrix = new THREE.Matrix4().set(
        1, 0, 0, 0,
        0, curveContribution, forwardLift, ROOT_DEPTH * (curveContribution - 1),
        0, 0, forwardScale, 0,
        0, 0, 0, 1
    );
    const heightScale = (originalHeight + ROOT_DEPTH) / (measureShape(plant, matrix).heightMeters + ROOT_DEPTH);
    matrix.elements[5] *= heightScale;
    matrix.elements[9] *= heightScale;
    matrix.elements[13] = ROOT_DEPTH * (matrix.elements[5] - 1);
    return matrix;
}

/**
 * @param {{plant: ReturnType<import('./GrassDebugV2PlantRow.js').createGrassDebugV2PlantRow>|ReturnType<import('./GrassDebugV2SingleLeaf.js').createGrassDebugV2SingleLeaf>, cards: ReturnType<import('./GrassDebugV2PlantCards.js').createGrassDebugV2PlantCards>|null}} options
 * @returns {Readonly<{definitions: readonly Readonly<TuftDefinition>[], createTuft: (id: string) => Readonly<AuthoringTuft>}>}
 */
export function createGrassDebugV2TuftCatalog({ plant, cards }) {
    const singleLeaf = plant.leaves.length === 1;
    if (!singleLeaf && (plant.leaves.length !== 4 || !cards?.getSnapshot().sameSide)) {
        throw new Error('The authoring catalog requires the four-leaf same-side source tuft.');
    }
    const originalMatrix = new THREE.Matrix4(), original = measureShape(plant, originalMatrix);
    const shapes = singleLeaf ? new Map([['leaf', originalMatrix]])
        : new Map([['original', originalMatrix], ['upright', uprightMatrix(plant, original.heightMeters)]]);
    const describe = (id, label, description) => {
        const metrics = measureShape(plant, shapes.get(id));
        return Object.freeze({ id, label, description, metrics: Object.freeze({ ...metrics,
            heightRatio: metrics.heightMeters / original.heightMeters,
            lengthRatio: metrics.leafLengthMeters / original.leafLengthMeters,
            curvatureRatio: metrics.curvatureDegrees / original.curvatureDegrees }) });
    };
    const definitions = Object.freeze(singleLeaf ? [describe('leaf', 'Leaf', 'Upright leaf with a gentle continuous curve.')] : [
        describe('original', 'Original', 'Four curved leaves in two pairs with shared wrapped roots.'),
        describe('upright', 'Upright', 'Shorter, straighter leaves that rise more upright at the same overall height.')
    ]);
    const source = plant.getSnapshot(), variantCounts = cards?.getSnapshot().variants;
    const cardModes = cards ? CARD_MODES : [];
    const counts = Object.freeze(Object.fromEntries([
        ['LOD0', Object.freeze({ leaves: source.leaves, cards: 0, triangles: source.leafTriangles + source.crownTriangles })],
        ...cardModes.map(mode => [mode, Object.freeze({ leaves: source.leaves, cards: variantCounts[mode].cards, triangles: variantCounts[mode].triangles })])
    ]));
    const getCounts = mode => {
        if (!Object.hasOwn(counts, mode)) throw new Error('Unknown authoring tuft representation: ' + mode);
        return counts[mode];
    };
    return Object.freeze({ definitions, createTuft: id => {
        if (!shapes.has(id)) throw new Error('Unknown authoring tuft: ' + id);
        const group = new THREE.Group(), shape = new THREE.Group();
        group.name = 'GrassAuthoringTuft:' + id; group.userData.catalogId = id;
        shape.name = 'GrassAuthoringShape:' + id; shape.matrixAutoUpdate = false;
        shape.matrix.copy(shapes.get(id)); group.add(shape);
        const lod0 = plant.group.clone(true);
        lod0.position.set(0, 0, 0); lod0.quaternion.identity(); lod0.scale.set(1, 1, 1); lod0.updateMatrix();
        const representations = { LOD0: lod0 }, boundaries = [];
        shape.add(lod0);
        for (const mode of cardModes) {
            const variant = new THREE.Group(), mesh = cards[mode].mesh.clone();
            const boundary = cards[mode].boundaries.clone(true);
            boundary.visible = false; boundaries.push(boundary);
            variant.name = 'GrassAuthoringLOD:' + mode; variant.add(mesh, boundary);
            representations[mode] = variant; shape.add(variant);
        }
        let disposed = false;
        const requireAlive = () => { if (disposed) throw new Error('This authoring tuft has been disposed.'); };
        const setMode = mode => {
            requireAlive(); getCounts(mode);
            for (const [name, representation] of Object.entries(representations)) representation.visible = name === mode;
        };
        setMode('LOD0');
        return Object.freeze({ group, setMode,
            setBoundaries: enabled => { requireAlive(); boundaries.forEach(boundary => { boundary.visible = !!enabled; }); },
            getCounts,
            dispose: () => { if (disposed) return; disposed = true; group.removeFromParent(); group.clear(); }
        });
    } });
}
