// Borrow the bus lab's prepared grass assets for a continuous curved-boundary experiment.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2TransitionFields } from './GrassDebugV2TransitionFields.js';
import { GrassDebugV2TransitionSelection } from './GrassDebugV2TransitionSelection.js';
import { createSharedUniformMaterialVariant } from '../../shaders/core/MaterialShaderHookRegistry.js';
import { createGrassBoundaryMask } from '../../engine3d/grass/runtime/GrassBoundaryMask.js';

/** @param {{curve:object,assets:object,near:object,bridge:object,land:object,scene:THREE.Scene}} input */
export function createGrassDebugV2CurveGrass({ curve, assets, near, bridge, land, scene }) {
    const { layout, road } = curve, { bounds, center, radius } = layout;
    const coverage = createGrassBoundaryMask({ bounds, outline: layout.outline, exclusions: road.sidewalkOuterBoundaryLoops });
    const materials = new Map();
    const material = source => {
        if (!materials.has(source)) {
            const clone = createSharedUniformMaterialVariant(source); coverage.bind(clone); materials.set(source, clone);
        }
        return materials.get(source);
    };
    const sources = Object.fromEntries(Object.entries(assets.sources).map(([id, source]) => {
        const mesh = new THREE.Mesh(source.geometry, material(source.material)); mesh.userData = source.userData;
        return [id, mesh];
    }));
    const representation = source => ({ templates: source.templates.cards ?? source.templates, material: material(source.material),
        textureBytes: source.getSnapshot?.().textureBytes ?? source.textureBytes });
    const fields = createGrassDebugV2TransitionFields({ ...assets, sources,
        canopy: { ...assets.canopy, materials: { all: material(assets.canopy.materials.all) } },
        soilMaterial: material(assets.soilMaterial), litterMaterial: material(assets.litterMaterial),
        lod3: representation(near), bridge: representation(bridge),
        fieldSize: bounds.maxX - bounds.minX, fieldDepth: bounds.maxZ - bounds.minZ,
        origins: [[bounds.minX, bounds.minZ]], continuous: true });
    fields.group.name = 'GrassV2CurvedGrass';
    fields.group.traverse(mesh => { if (mesh.isMesh) mesh.castShadow = false; });
    fields.setCellVisibility(Uint8Array.from(fields.cells, cell => Number(coverage.intersectsCell(cell.centerX, cell.centerZ))));
    const selection = new GrassDebugV2TransitionSelection({ cells: fields.cells, distances: [.6, .8, 20, 30, 40], transitionFraction: .3, canopyTransitionFraction: .85 });
    const settings = selection.getSnapshot(); fields.configureBlend(settings.transitionBands, settings.bridgeEnabled);
    fields.setEdgeStrips(true);
    const forced = new Uint8Array(fields.cells.length).fill(5), noSides = new Uint8Array(fields.cells.length);
    fields.applyLevels(forced, noSides); scene.add(fields.group); land.setGrassBoundary(coverage);
    let mode = 'AUTO';
    return Object.freeze({ group: fields.group, coverage,
        update(position, now, force = false) {
            if (mode === 'OFF') return;
            const result = selection.update(position, now, { force });
            if (force || result.changedCount || result.renderChangedCount || result.sideLeavesChangedCount)
                fields.applyLevels(mode === 'AUTO' ? result.levels : forced, result.sideLeaves, mode === 'AUTO' ? result.renderMasks : null);
        },
        setMode(value) { mode = value; fields.group.visible = value !== 'OFF'; if (value.startsWith('LOD')) forced.fill(Number(value.slice(3))); },
        setFadeStyle: value => fields.setFadeStyle(value),
        getCameraPose(id) {
            if (id === 'curve') return { position: new THREE.Vector3(center.x + radius + 24, 65, center.z - radius - 36), target: new THREE.Vector3(center.x, 0, center.z + radius / 3) };
            const r = radius + (id === 'curve-inner' ? -8 : 8), a = Math.PI * .25;
            const point = new THREE.Vector3(center.x + Math.cos(a) * r, .65, center.z + Math.sin(a) * r);
            return { position: point, target: point.clone().add(new THREE.Vector3(-7, -.4, 7)) };
        },
        getSnapshot() { return { radius, bounds, center, outline: layout.outline, hardscape: road.sidewalkOuterBoundaryLoops,
            resolution: coverage.resolution, texelMeters: (bounds.maxX - bounds.minX) / coverage.resolution,
            mode, field: fields.getSnapshot(), selection: selection.getSnapshot() }; },
        dispose() { fields.dispose(); coverage.dispose(); for (const copy of materials.values()) copy.dispose(); }
    });
}
