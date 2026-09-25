// Authoring cards share a broad upper span and refit lower dividers to the curve; historical benchmark fits stay independent.
// @ts-check
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const GRASS_V2_PLANT_CARD_PROFILE = Object.freeze({ rootHeightMeters: 0.003, segmentsPerSide: 3, splitSegmentsPerSide: 2,
    detailedSegmentsPerSide: 6, refinedSegmentsPerSide: 12, vReachFraction: 0.40, topHeightFraction: 0.78 });

/** @typedef {{group: THREE.Group, leaves: readonly THREE.Mesh[]}} PlantCardSource */

function sampleSilhouetteProfile(geometry) {
    const p = geometry.attributes.position, uv = geometry.attributes.uv;
    const indices = Array.from({ length: p.count }, (_, i) => i);
    const centerline = indices.filter(i => Math.abs(uv.getX(i) - 0.5) < 1e-5 && uv.getY(i) > 0.07)
        .map(i => ({ z: p.getZ(i), y: p.getY(i) }));
    const edges = [0, 1].map(u => [...indices.filter(i => uv.getX(i) === u), p.count - 1]
        .map(i => ({ z: p.getZ(i), y: p.getY(i) })));
    const contour = centerline.map(({ z }) => {
        let height = -Infinity;
        for (const points of edges) for (let i = 1; i < points.length; i++) {
            const a = points[i - 1], b = points[i];
            if (a.z === b.z || z < Math.min(a.z, b.z) || z > Math.max(a.z, b.z)) continue;
            height = Math.max(height, THREE.MathUtils.lerp(a.y, b.y, (z - a.z) / (b.z - a.z)));
        }
        if (!Number.isFinite(height)) throw new Error('Source blade margins do not cover the card profile.');
        return { z, y: height };
    });
    return { centerline, contour };
}

function describeSide(stations, maximumProfileDeviation) {
    const anglesDegrees = stations.slice(1).map((point, i) => THREE.MathUtils.radToDeg(Math.atan2(
        point.y - stations[i].y, Math.abs(point.z - stations[i].z))));
    return Object.freeze({ stations: Object.freeze(stations), anglesDegrees: Object.freeze(anglesDegrees), maximumProfileDeviation });
}

function selectStations(side, points, indices) {
    const stations = indices.map(index => side.stations[index]);
    const maximumProfileDeviation = Math.max(...points.map(point => {
        const index = stations.findIndex((end, i) => i > 0
            && Math.abs(point.z) <= Math.abs(end.z));
        const start = stations[index - 1], end = stations[index];
        return Math.abs(point.y - THREE.MathUtils.lerp(start.y, end.y, (point.z - start.z) / (end.z - start.z)));
    }));
    return describeSide(stations, maximumProfileDeviation);
}

function splitProfileSegment(side, points, segment) {
    const [start, end] = side.stations.slice(segment, segment + 2);
    const inside = points.filter(point => Math.abs(point.z) > Math.abs(start.z) && Math.abs(point.z) < Math.abs(end.z));
    const candidates = inside.map(point => selectStations({ stations: [start, point, end] }, inside, [0, 1, 2]));
    if (!candidates.length) throw new Error('Card span has no interior profile samples.');
    const best = candidates.reduce((a, b) => a.maximumProfileDeviation <= b.maximumProfileDeviation ? a : b);
    const stations = [...side.stations];
    stations.splice(segment + 1, 0, best.stations[1]);
    return selectStations({ stations }, points, stations.map((_, index) => index));
}

function fitSide(points, sign, extent, rootY, segmentCount) {
    const stations = [{ distance: 0, y: rootY }, ...points.map(point => ({ distance: sign * point.z, y: point.y }))];
    const end = stations.at(-1), previous = stations.at(-2);
    stations.push({ distance: extent, y: end.y + (extent - end.distance) * (end.y - previous.y) / (end.distance - previous.distance) });
    const count = stations.length, errors = Array.from({ length: count }, () => new Float64Array(count).fill(Infinity));
    for (let a = 0; a < count - 1; a++) for (let b = a + 1; b < count; b++) {
        const first = stations[a], last = stations[b], reach = last.distance - first.distance;
        if (reach <= 0 || (last.y - first.y) / reach < Math.tan(THREE.MathUtils.degToRad(2))) continue;
        let error = 0;
        for (let i = a + 1; i < b; i++) error = Math.max(error, Math.abs(stations[i].y
            - THREE.MathUtils.lerp(first.y, last.y, (stations[i].distance - first.distance) / reach)));
        errors[a][b] = error;
    }
    const costs = Array.from({ length: segmentCount + 1 }, () => new Float64Array(count).fill(Infinity));
    costs[0][count - 1] = 0;
    for (let remaining = 1; remaining <= segmentCount; remaining++) {
        for (let a = 0; a < count - 1; a++) for (let b = a + 1; b < count; b++) {
            costs[remaining][a] = Math.min(costs[remaining][a], Math.max(errors[a][b], costs[remaining - 1][b]));
        }
    }
    const bestError = costs[segmentCount][0], joins = [0];
    if (!Number.isFinite(bestError)) throw new Error(`Unable to fit ${segmentCount} inclined cards to the source blade.`);
    for (let remaining = segmentCount; remaining > 0; remaining--) {
        const index = joins.at(-1);
        joins.push(errors[index].findIndex((error, next) => next > index
            && Math.max(error, costs[remaining - 1][next]) <= bestError));
    }
    const fitted = joins.map(index => ({ z: sign * stations[index].distance, y: stations[index].y }));
    return describeSide(fitted, bestError);
}

/** @param {PlantCardSource} plant @param {{nested?: boolean}} options */
export function createGrassDebugV2PlantCardLayout(plant, { nested = false } = {}) {
    const bounds = new THREE.Box3().setFromObject(plant.group);
    const frame = { minX: bounds.min.x - 0.002, maxX: bounds.max.x + 0.002,
        minZ: bounds.min.z - 0.002, maxZ: bounds.max.z + 0.002 };
    const { rootHeightMeters: rootY, vReachFraction, topHeightFraction } = GRASS_V2_PLANT_CARD_PROFILE;
    const profiles = [...new Set(plant.leaves.map(leaf => leaf.geometry))].map(sampleSilhouetteProfile);
    const samples = profiles.map(profile => profile.contour);
    const topHeight = bounds.max.y * topHeightFraction;
    const reaches = samples.map(points => Math.sign(points.at(-1).z) * Math.max(...points.map(p => Math.abs(p.z))));
    const negative = Math.min(...reaches) * vReachFraction, positive = Math.max(...reaches) * vReachFraction;
    const heightAt = z => rootY + (topHeight - rootY) * Math.min(1, z / (z < 0 ? negative : positive));
    const baselineMaxDeviation = Math.max(...profiles.flatMap(profile => profile.centerline).map(p => Math.abs(heightAt(p.z) - p.y)));
    const sideDefinitions = [['negative', -1, -frame.minZ], ['positive', 1, frame.maxZ]]
        .filter(([, sign]) => samples.some(points => Math.sign(points.at(-1).z) === sign));
    const fitSides = count => Object.freeze(Object.fromEntries(sideDefinitions.map(([name, sign, extent]) =>
        [name, fitSide(samples.find(points => Math.sign(points.at(-1).z) === sign), sign, extent, rootY, count)])));
    const masterSides = fitSides(GRASS_V2_PLANT_CARD_PROFILE.refinedSegmentsPerSide);
    const selectSides = (source, indices) => Object.freeze(Object.fromEntries(sideDefinitions.map(([name, sign]) =>
        [name, selectStations(source[name], samples.find(points => Math.sign(points.at(-1).z) === sign), indices)])));
    const refinedSides = nested ? selectSides(masterSides, [0, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12]) : masterSides;
    const referenceSixSides = nested ? selectSides(masterSides, [0, 2, 4, 7, 10, 11, 12])
        : fitSides(GRASS_V2_PLANT_CARD_PROFILE.detailedSegmentsPerSide);
    const referenceFiveSides = nested ? selectSides(referenceSixSides, [0, 2, 3, 4, 5, 6]) : null;
    const splitSidesAtProfile = (source, segment) => Object.freeze(Object.fromEntries(sideDefinitions.map(([name, sign]) =>
        [name, splitProfileSegment(source[name], samples.find(points => Math.sign(points.at(-1).z) === sign), segment)])));
    // Combine the old five-card tip pair. Spend its divider in the curved middle;
    // lower levels retain that broader upper span instead of the tiny final card.
    const detailedSides = nested ? splitSidesAtProfile(selectSides(referenceFiveSides, [0, 1, 2, 3, 5]), 2) : referenceSixSides;
    const upperSpanSides = nested ? selectSides(referenceFiveSides, [0, 3, 5]) : null;
    const sides = nested ? splitSidesAtProfile(upperSpanSides, 0) : fitSides(GRASS_V2_PLANT_CARD_PROFILE.segmentsPerSide);
    const splitSides = nested ? upperSpanSides : selectSides(sides, [0, 2, 3]);
    const hierarchy = nested ? Object.freeze({ masterSides, referenceSixSides, referenceFiveSides }) : null;
    const definitions = {
        leftV: [negative, 0, topHeight, rootY, 0],
        rightV: [0, positive, rootY, topHeight, 0],
        fullTop: [frame.minZ, frame.maxZ, topHeight, topHeight, 1]
    };
    const makeCard = ([z0, z1, y0, y1, page]) => {
        const { minX, maxX, minZ, maxZ } = frame;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute([
            minX, y0, z0, maxX, y0, z0, minX, y1, z1, maxX, y1, z1
        ], 3));
        const v0 = (maxZ - z0) / (maxZ - minZ), v1 = (maxZ - z1) / (maxZ - minZ);
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
            page / 2, v0, (page + 1) / 2, v0, page / 2, v1, (page + 1) / 2, v1
        ], 2));
        geometry.setIndex([0, 2, 1, 1, 2, 3]); geometry.computeVertexNormals();
        return geometry;
    };
    const cards = Object.fromEntries(Object.entries(definitions).map(([name, def]) => [name, makeCard(def)]));
    const joined = mergeGeometries([cards.leftV, cards.rightV, cards.fullTop]);
    joined.computeBoundingBox(); joined.computeBoundingSphere();
    const makeFittedCards = fittedSides => {
        const fittedCards = {};
        for (const [name, side] of Object.entries(fittedSides)) for (let i = 0; i < side.stations.length - 1; i++) {
            const [a, b] = side.stations.slice(i, i + 2).sort((a, b) => a.z - b.z);
            fittedCards[`${name}${i}`] = makeCard([a.z, b.z, a.y, b.y, 0]);
        }
        return fittedCards;
    };
    const splitCards = makeFittedCards(splitSides), curvedCards = makeFittedCards(sides), detailedCards = makeFittedCards(detailedSides);
    const refinedCards = makeFittedCards(refinedSides);
    const split = mergeGeometries(Object.values(splitCards));
    split.computeBoundingBox(); split.computeBoundingSphere();
    const curved = mergeGeometries(Object.values(curvedCards));
    curved.computeBoundingBox(); curved.computeBoundingSphere();
    const detailed = mergeGeometries(Object.values(detailedCards));
    detailed.computeBoundingBox(); detailed.computeBoundingSphere();
    const refined = mergeGeometries(Object.values(refinedCards));
    refined.computeBoundingBox(); refined.computeBoundingSphere();
    const width = frame.maxX - frame.minX, depth = frame.maxZ - frame.minZ;
    const lowerArea = width * (Math.hypot(negative, topHeight - rootY) + Math.hypot(positive, topHeight - rootY));
    const upperArea = width * depth, transparentArea = width * (positive - negative);
    const fittedArea = fittedSides => width * Object.values(fittedSides).reduce((sum, side) => sum + side.stations.slice(1).reduce((area, point, i) =>
        area + Math.hypot(point.z - side.stations[i].z, point.y - side.stations[i].y), 0), 0);
    return Object.freeze({ frame: Object.freeze(frame), negative, positive, topHeight, rootY, baselineMaxDeviation,
        maxDeviation: Math.max(...Object.values(sides).map(side => side.maximumProfileDeviation)),
        profile: nested ? Object.freeze({ ...GRASS_V2_PLANT_CARD_PROFILE, refinedSegmentsPerSide: 10, detailedSegmentsPerSide: 5 }) : GRASS_V2_PLANT_CARD_PROFILE,
        hierarchy,
        splitMaxDeviation: Math.max(...Object.values(splitSides).map(side => side.maximumProfileDeviation)),
        detailedMaxDeviation: Math.max(...Object.values(detailedSides).map(side => side.maximumProfileDeviation)),
        refinedMaxDeviation: Math.max(...Object.values(refinedSides).map(side => side.maximumProfileDeviation)),
        cards: Object.freeze(cards), joined, splitCards: Object.freeze(splitCards), split, curvedCards: Object.freeze(curvedCards), curved, sides, splitSides,
        detailedCards: Object.freeze(detailedCards), detailed, detailedSides,
        refinedCards: Object.freeze(refinedCards), refined, refinedSides,
        metrics: Object.freeze({ splitArea: fittedArea(splitSides), curvedArea: fittedArea(sides), detailedArea: fittedArea(detailedSides), refinedArea: fittedArea(refinedSides),
            joinedArea: lowerArea + upperArea, upperTransparentStripArea: transparentArea }),
        dispose: () => { joined.dispose(); split.dispose(); curved.dispose(); detailed.dispose(); refined.dispose();
            [cards, splitCards, curvedCards, detailedCards, refinedCards].forEach(set => Object.values(set).forEach(card => card.dispose())); }
    });
}
