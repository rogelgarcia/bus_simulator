// Owns one streamed terrain tile and its separately disposable inspection buffers.
// @ts-check
import * as THREE from 'three';
import { createLandscapeShaderPayload } from '../../shaders/materials/landscape/LandscapeShaderLoader.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { withLandscapeMorphedPositions } from './LandscapeTileEdges.js';
import { createLandscapeAppearanceUniforms } from './LandscapeAppearanceUniforms.js';
import { createLandscapeDiagnosticUniforms } from './LandscapeTerrainDiagnostics.js';
import { createLandscapeLightingUniforms } from './LandscapeLightingModel.js';

const LOD_COLORS = [0x687dba, 0x46b89b, 0xe4b76c, 0xd279a8, 0x92ba5e, 0x7cadd9];
export const OVERVIEW_MEMORY_CAP = 32 * 1024 * 1024;

/**
 * @param {any} buffers @param {Float32Array} sourceHeights
 * @param {{coverageSlots:number,materialSampling?:string,lightingTier?:string}} options view-wide compile-time coverage slot count, material sampling
 *   mode and lighting tier; a tile renders with the calibrated sun and no sky light until setLighting binds the view lighting
 * @returns {any}
 */
export function createLandscapeMesh(buffers, sourceHeights, options) {
    const { descriptor } = buffers;
    const { bounds } = descriptor;
    const sharedUniforms = {
        uMorph: { value: 1 },
        uEdges: { value: new THREE.Vector4() },
        uEdgeMorph: { value: new THREE.Vector4(1, 1, 1, 1) },
        uBounds: { value: new THREE.Vector4(bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ) }
    };
    const coverageSlots = options?.coverageSlots;
    const variant = { ...(options?.materialSampling ? { materialSampling: options.materialSampling } : {}), ...(options?.lightingTier ? { lightingTier: options.lightingTier } : {}) };
    const terrainPayload = createLandscapeShaderPayload('terrain', { coverageSlots, ...variant });
    const material = new THREE.ShaderMaterial({
        vertexShader: terrainPayload.vertexSource,
        fragmentShader: terrainPayload.fragmentSource,
        vertexColors: true,
        uniforms: { ...sharedUniforms, ...createLandscapeAppearanceUniforms(coverageSlots), uTint: { value: new THREE.Color(LOD_COLORS[descriptor.level % LOD_COLORS.length]) }, uLodColor: { value: 0 },
            uDiagnostic: { value: 0 }, uDiagnosticRange: { value: new THREE.Vector3(0, 100, 0) }, ...createLandscapeDiagnosticUniforms(), ...createLandscapeLightingUniforms() }
    });
    const recompile = () => {
        const payload = createLandscapeShaderPayload('terrain', { coverageSlots, ...variant });
        material.vertexShader = payload.vertexSource; material.fragmentShader = payload.fragmentSource; material.needsUpdate = true;
        attachShaderMetadata(material, payload);
    };
    attachShaderMetadata(material, terrainPayload);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(buffers.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(buffers.colors, 3, true));
    geometry.setAttribute('normal', new THREE.BufferAttribute(buffers.normals, 3, true));
    geometry.setAttribute('parentNormal', new THREE.BufferAttribute(buffers.parentNormals, 3, true));
    geometry.setAttribute('parentHeight', new THREE.BufferAttribute(buffers.parentHeights, 1));
    geometry.setIndex(new THREE.BufferAttribute(buffers.indices, 1));
    const center = new THREE.Vector3((bounds.minX + bounds.maxX) / 2, (descriptor.minHeight + descriptor.maxHeight) / 2, (bounds.minZ + bounds.maxZ) / 2);
    geometry.boundingSphere = new THREE.Sphere(center, Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ, descriptor.maxHeight - descriptor.minHeight) / 2 + descriptor.geometricError + buffers.skirtDepth);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `Landscape:${descriptor.id}`;
    mesh.userData.landscapeChunkId = descriptor.id;
    const originalRaycast = mesh.raycast;
    mesh.raycast = function(raycaster, intersections) {
        const coarser = sharedUniforms.uEdges.value.toArray(), edgeMorph = sharedUniforms.uEdgeMorph.value.toArray();
        if (sharedUniforms.uMorph.value === 1 && coarser.every(value => value === 0) && edgeMorph.every(value => value === 1)) return originalRaycast.call(this, raycaster, intersections);
        return withLandscapeMorphedPositions(buffers, sourceHeights, { morph: sharedUniforms.uMorph.value, coarser, edgeMorph }, () => originalRaycast.call(this, raycaster, intersections));
    };
    let wire = null, boundary = null, mode = 'shaded';
    const createLine = (positions, parentHeights, indices, loop) => {
        const lineGeometry = new THREE.BufferGeometry();
        lineGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        lineGeometry.setAttribute('parentHeight', new THREE.BufferAttribute(parentHeights, 1));
        if (indices) lineGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
        lineGeometry.boundingSphere = geometry.boundingSphere;
        const payload = createLandscapeShaderPayload('lines');
        const lineMaterial = new THREE.ShaderMaterial({
            vertexShader: payload.vertexSource, fragmentShader: payload.fragmentSource,
            uniforms: { ...sharedUniforms, uColor: { value: new THREE.Color(loop ? 0xffde83 : 0x142f32) }, uOpacity: { value: loop ? 1 : .5 }, uOffset: { value: loop ? .2 : .04 } },
            transparent: true, depthWrite: false, toneMapped: false
        });
        attachShaderMetadata(lineMaterial, payload);
        const line = loop ? new THREE.LineLoop(lineGeometry, lineMaterial) : new THREE.LineSegments(lineGeometry, lineMaterial);
        line.name = loop ? 'Terrain chunk boundary' : 'Terrain triangulation';
        mesh.add(line);
        return line;
    };
    const removeLine = line => {
        if (!line) return;
        mesh.remove(line);
        line.geometry.dispose();
        line.material.dispose();
    };
    return Object.freeze({
        mesh,
        chunkId: descriptor.id,
        get morph() { return sharedUniforms.uMorph.value; },
        setMorph(value) { sharedUniforms.uMorph.value = value; },
        setAppearance(uniforms) {
            if (uniforms.uMaskMeta.value.length !== coverageSlots) throw new Error(`[Landscape] Appearance uniforms declare ${uniforms.uMaskMeta.value.length} coverage slots; terrain ${descriptor.id} is compiled for ${coverageSlots}`);
            Object.assign(material.uniforms, uniforms); material.uniformsNeedUpdate = true;
        },
        setPlanning(uniforms) { Object.assign(material.uniforms, uniforms); material.uniformsNeedUpdate = true; },
        /** @param {{uLandscapeSky:any,uLandscapeSun:any,uLandscapeSunIrradiance:any}} uniforms the view lighting's shared uniform cells */
        setLighting(uniforms) { Object.assign(material.uniforms, uniforms); material.uniformsNeedUpdate = true; },
        /** @param {string} materialSampling compile-time material sampling mode; the program recompiles on the next draw */
        setMaterialSampling(materialSampling) { variant.materialSampling = materialSampling; recompile(); },
        /** @param {string} lightingTier compile-time lighting tier; the program recompiles on the next draw */
        setLightingTier(lightingTier) { variant.lightingTier = lightingTier; recompile(); },
        setEdges(edges, morph = [1, 1, 1, 1]) { sharedUniforms.uEdges.value.set(...edges); sharedUniforms.uEdgeMorph.value.set(...morph); },
        setLodColors(enabled) { material.uniforms.uLodColor.value = enabled ? .78 : 0; },
        setMode(value) {
            mode = value;
            material.visible = value !== 'wireframe';
            if (value !== 'shaded' && !wire) wire = createLine(buffers.positions.slice(), buffers.parentHeights.slice(), buffers.wireIndices, false);
            else if (value === 'shaded' && wire) { removeLine(wire); wire = null; }
            if (wire) {
                wire.material.uniforms.uColor.value.set(value === 'wireframe' ? 0xa6c7c0 : 0x142f32);
                wire.material.uniforms.uOpacity.value = value === 'wireframe' ? 1 : .52;
            }
        },
        setBoundaries(enabled) {
            if (enabled && !boundary) boundary = createLine(buffers.boundaryPositions, buffers.boundaryParents, null, true);
            else if (!enabled && boundary) { removeLine(boundary); boundary = null; }
        },
        upload(renderer, camera) {
            const scene = new THREE.Scene();
            const parent = mesh.parent, visible = mesh.visible, culled = mesh.frustumCulled;
            const materials = [material, wire?.material, boundary?.material].filter(Boolean);
            const writes = materials.map(value => [value.colorWrite, value.depthWrite]);
            const autoClear = renderer.autoClear;
            try {
                mesh.visible = true;
                mesh.frustumCulled = false;
                materials.forEach(value => { value.colorWrite = false; value.depthWrite = false; });
                scene.add(mesh);
                renderer.autoClear = false;
                renderer.render(scene, camera);
            } finally {
                scene.remove(mesh);
                if (parent) parent.add(mesh);
                mesh.visible = visible;
                mesh.frustumCulled = culled;
                materials.forEach((value, index) => { [value.colorWrite, value.depthWrite] = writes[index]; });
                renderer.autoClear = autoClear;
            }
        },
        diagnostics() {
            const wireCpuBytes = wire ? buffers.positions.byteLength + buffers.parentHeights.byteLength : 0;
            const wireGpuBytes = wire ? wireCpuBytes + buffers.wireIndices.byteLength : 0;
            const boundaryBytes = boundary ? buffers.boundaryPositions.byteLength + buffers.boundaryParents.byteLength : 0;
            return { vertices: buffers.positions.length / 3, triangles: buffers.indices.length / 3, surfaceTriangles: buffers.surfaceTriangles, geometryBytes: buffers.geometryBytes, overlayBytes: wireGpuBytes + boundaryBytes, overlayCpuBytes: wireCpuBytes, estimatedGpuBytes: buffers.geometryBytes + wireGpuBytes + boundaryBytes, mode };
        },
        dispose() { removeLine(wire); removeLine(boundary); wire = null; boundary = null; geometry.dispose(); material.dispose(); mesh.removeFromParent(); }
    });
}
