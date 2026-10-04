// Replace the field interior with a raised opaque canopy and retain original LOD2 perimeter leaves.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2FieldCanopyBake } from './GrassDebugV2FieldCanopyBake.js?v=lod4-resolution-options-1';
import { createGrassDebugV2PeriodicSource } from './GrassDebugV2PeriodicSource.js';
import { createGrassDebugV2CanopyMaterials } from './GrassDebugV2CanopyMaterial.js?v=lod4-shadow-fast-1';
import { createGrassDebugV2CanopyRelief, GRASS_CANOPY_RELIEF } from './GrassDebugV2CanopyRelief.js?v=lod3-relief-range-1';
import { grassCanopyLayoutIdentity, loadGrassCanopyLayoutPair } from './GrassDebugV2CanopyLayoutAsset.js';
import { validateGrassCanopyPairBoundaries } from './GrassDebugV2CanopyTilePair.js';
import { createGrassDebugV2CanopyBorderCards } from './GrassDebugV2CanopyBorderCards.js';
import { createGrassDebugV2CanopyWall } from './GrassDebugV2CanopyWall.js?v=lod4-wall-detail-1';

export const GRASS_FIELD_CANOPY = Object.freeze({ height: .10, variation: .005, edgeWidth: .1, inset: .05, ramp: .05, step: .5, tileMeters: 2, resolution: 4096,
    mapResolutions: Object.freeze({ albedo: 1024, normal: 1024, roughness: 1024 }), filterFootprint: 0, boundaryBandMeters: .08 });

function selectLeaves(source, ids, compact = false) {
    const geometry = new THREE.BufferGeometry(), indices = [], ranges = source.userData.grassLeafRanges;
    for (const name of Object.keys(source.geometry.attributes)) geometry.setAttribute(name, source.geometry.attributes[name]);
    for (const id of ids) for (let i = ranges[id].start; i < ranges[id].start + ranges[id].count; i++) indices.push(source.geometry.index.getX(i));
    if (compact) {
        const vertices = [...new Set(indices)], remap = new Map(vertices.map((vertex, i) => [vertex, i]));
        for (const [name, sourceAttribute] of Object.entries(source.geometry.attributes)) {
            const attribute = new THREE.BufferAttribute(new sourceAttribute.array.constructor(vertices.length * sourceAttribute.itemSize), sourceAttribute.itemSize, sourceAttribute.normalized);
            vertices.forEach((vertex, i) => attribute.copyAt(i, sourceAttribute, vertex));
            geometry.setAttribute(name, attribute);
        }
        for (let i = 0; i < indices.length; i++) indices[i] = remap.get(indices[i]);
    }
    geometry.setIndex(indices);
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return geometry;
}

function canopyGeometry(width, depth) {
    const config = GRASS_FIELD_CANOPY, halfX = width/2 - config.inset, halfZ = depth/2 - config.inset;
    const axis = half => [-half, -half + config.ramp, ...Array.from({ length: Math.ceil(2*half/config.step) }, (_,i) => (Math.ceil((-half+config.ramp)/config.step)+i)*config.step).filter(x => x > -half+config.ramp && x < half-config.ramp), half-config.ramp, half];
    const xs = axis(halfX), zs = axis(halfZ), positions = [], uv = [], indices = [];
    for (const z of zs) for (const x of xs) {
        const inward = Math.min(halfX-Math.abs(x),halfZ-Math.abs(z)), weight = THREE.MathUtils.smoothstep(inward,0,config.ramp);
        const height = config.height + config.variation*Math.sin(x*1.7)*Math.sin(z*1.3);
        positions.push(x, THREE.MathUtils.lerp(0,height,weight), z); uv.push(.5+x/config.tileMeters,.5-z/config.tileMeters);
    }
    for(let z=0;z<zs.length-1;z++)for(let x=0;x<xs.length-1;x++){
        if(x===0||z===0||x===xs.length-2||z===zs.length-2)continue;
        const a=z*xs.length+x,b=a+xs.length;
        indices.push(a,b,a+1,a+1,b,b+1);
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
    return geometry;
}

/** @param {{renderer:THREE.WebGLRenderer, source:THREE.Mesh, lod2:THREE.Mesh, soil:THREE.Mesh, litter:THREE.Object3D, width:number, depth:number, shadowDirection:THREE.Vector3, lighting:object, onProgress?:(message:string)=>void,onPatternPreview?:(preview:object)=>void,compileLayout?:boolean,mapResolutions?:Partial<Record<'albedo'|'normal'|'roughness'|'visibility',number>>,anisotropy?:number,mapResolutionProfiles?:Record<string,Partial<Record<'albedo'|'normal'|'roughness',number>>>}} options */
export async function createGrassDebugV2FieldCanopy({renderer,source,lod2,soil,litter,width,depth,shadowDirection,lighting,onProgress,onPatternPreview,compileLayout=false,mapResolutions={},mapResolutionProfiles={},anisotropy=8}) {
    if (!(width > 1 && depth > 1) || !source.userData.grassLeafRanges?.length
        || source.userData.grassLeafRanges.length !== lod2.userData.grassLeafRanges?.length)
        throw new Error('Field canopy requires corresponding source/LOD2 leaf ranges.');
    if (!shadowDirection?.toArray().every(Number.isFinite) || shadowDirection.y <= 0) throw new Error('Canopy capture needs an above-horizon sun direction.');
    const shadowPadding = source.geometry.boundingBox.max.y * Math.hypot(shadowDirection.x, shadowDirection.z) / shadowDirection.y + .01;
    if (shadowPadding > GRASS_FIELD_CANOPY.tileMeters / 2) throw new Error('Canopy shadow reach exceeds the periodic source padding.');
    const edgeIds=[], interiorIds=[], tileIds=[], p=lod2.geometry.attributes.position, uv=lod2.geometry.attributes.uv, index=lod2.geometry.index;
    for(const [id,range] of lod2.userData.grassLeafRanges.entries()) {
        const vertices=new Set();let minV=Infinity,x=0,z=0,n=0;
        for(let i=range.start;i<range.start+range.count;i++){const v=index.getX(i);vertices.add(v);minV=Math.min(minV,uv.getY(v));}
        for(const v of vertices)if(uv.getY(v)<=minV+1e-6){x+=p.getX(v);z+=p.getZ(v);n++;}
        (Math.abs(x/n)>=width/2-GRASS_FIELD_CANOPY.edgeWidth || Math.abs(z/n)>=depth/2-GRASS_FIELD_CANOPY.edgeWidth ? edgeIds : interiorIds).push(id);
        const half = GRASS_FIELD_CANOPY.tileMeters / 2;
        if (x/n >= -half && x/n < half && z/n >= -half && z/n < half) tileIds.push(id);
    }
    const captures = [], bakes = [], materialProfiles = {}, reliefMaterialProfiles = {};
    let mapProfile = 'default';
    let materials, geometry, edgeGeometry, borderCards, relief, wall;
    try {
    const captureGeometry=selectLeaves(source,tileIds,true), captureMesh=new THREE.Mesh(captureGeometry,source.material);
    captures.push(captureMesh);
    let start = 0;
    captureMesh.userData.grassLeafRanges = tileIds.map(id => {
        const count = source.userData.grassLeafRanges[id].count, range = { start, count }; start += count; return range;
    });
    const layoutStarted = performance.now();
    const identity = await grassCanopyLayoutIdentity(captureMesh, { periodMeters: GRASS_FIELD_CANOPY.tileMeters,
        tileIds, sun: shadowDirection.clone().normalize().toArray(), sourceHeight: source.geometry.boundingBox.max.y,
        filterFootprint: GRASS_FIELD_CANOPY.filterFootprint, boundaryBandMeters: GRASS_FIELD_CANOPY.boundaryBandMeters,
        feedbackProfile: 'hdr-display-v1' });
    const alternate = captureMesh.clone(false); alternate.geometry = captureGeometry.clone();
    captures.push(alternate);
    let layoutAsset;
    if (compileLayout) {
        const { compileGrassCanopyTilePair } = await import('./GrassDebugV2CanopyPairCompiler.js');
        layoutAsset = await compileGrassCanopyTilePair(captures, identity, {
            renderer, soil, litter, lighting, shadowDirection, shadowPadding,
            sourceHeight: identity.sourceHeight, filterFootprint: GRASS_FIELD_CANOPY.filterFootprint,
            onProgress, onPreview: onPatternPreview
        });
    } else {
        onProgress?.('Loading compiled LOD4 leaf positions…');
        layoutAsset = await loadGrassCanopyLayoutPair(captures, identity);
    }
    const compatibility = validateGrassCanopyPairBoundaries(captures, { shootIds: tileIds.map(id => Math.floor(id / 2)),
        periodMeters: identity.periodMeters, sun: identity.sun, boundaryBandMeters: identity.boundaryBandMeters });
    const { placement, optimization, renderedOptimization } = layoutAsset.variants[0];
    const layout = Object.freeze({ mode: compileLayout ? 'offline-compilation' : 'compiled', sourceHash: identity.hash,
        vertices: identity.vertices, leaves: identity.leaves, variants: 2, compatibility, milliseconds: performance.now() - layoutStarted });
    const periodicSnapshots = [], shadowPeriodicSnapshots = [];
    for (const capture of captures) {
        let periodic, shadowPeriodic;
        try {
        periodic = createGrassDebugV2PeriodicSource(capture, 0, GRASS_FIELD_CANOPY.tileMeters);
        shadowPeriodic = createGrassDebugV2PeriodicSource(capture, shadowPadding, GRASS_FIELD_CANOPY.tileMeters);
        periodicSnapshots.push(periodic.getSnapshot()); shadowPeriodicSnapshots.push(shadowPeriodic.getSnapshot());
        bakes.push(await createGrassDebugV2FieldCanopyBake({ renderer, source: periodic.group, shadowSource: shadowPeriodic.group, shadowDirection, soil, litter,
            width: GRASS_FIELD_CANOPY.tileMeters, depth: GRASS_FIELD_CANOPY.tileMeters, sourceHeight: source.geometry.boundingBox.max.y,
            resolution: GRASS_FIELD_CANOPY.resolution, mapResolutions: { ...GRASS_FIELD_CANOPY.mapResolutions, ...mapResolutions }, mapResolutionProfiles, anisotropy, onProgress }));
        } finally { periodic?.dispose(); shadowPeriodic?.dispose(); }
    }
    const bake = bakes[0];
    const shadowUniforms = { grassCanopyShadowVisibility: { value: null }, grassCanopyShadowBounds: { value: new THREE.Vector4() }, grassCanopyShadowPass: { value: 0 } };
    for (const profile of Object.keys(bake.profiles)) {
        const options = { texturesByLayer: bake.profiles[profile].textures, secondaryTexturesByLayer: bakes[1].profiles[profile].textures, shadowUniforms,
            ...GRASS_FIELD_CANOPY, sourceHeight: source.geometry.boundingBox.max.y };
        materialProfiles[profile] = createGrassDebugV2CanopyMaterials(options);
        reliefMaterialProfiles[profile] = createGrassDebugV2CanopyMaterials({ ...options, relief: GRASS_CANOPY_RELIEF });
    }
    materials = materialProfiles.default;
    wall=await createGrassDebugV2CanopyWall({renderer,sources:captures,bake:bake.profiles.default,litter,width,depth,config:GRASS_FIELD_CANOPY,
        sourceHeight:source.geometry.boundingBox.max.y,shadowDirection,shadowUniforms,onProgress});
    geometry=canopyGeometry(width,depth); edgeGeometry=selectLeaves(lod2,edgeIds);
    const top=new THREE.Mesh(geometry,materials.all), edges=new THREE.Mesh(edgeGeometry,lod2.material);
    top.name='GrassField-LOD4-Canopy';edges.name='GrassField-LOD4-Edges';
    top.castShadow=edges.castShadow=false;top.receiveShadow=edges.receiveShadow=true;
    top.userData.grassLeafCount=interiorIds.length;edges.userData.grassLeafCount=edgeIds.length;
    top.userData.grassCanopy=true;
    relief = createGrassDebugV2CanopyRelief({ sources: captures, bakes: bakes.map(b => b.profiles['4K'] ?? b), surface: top,
        width, depth, period: GRASS_FIELD_CANOPY.tileMeters, inset: GRASS_FIELD_CANOPY.edgeWidth + GRASS_FIELD_CANOPY.ramp,
        materials: reliefMaterialProfiles.default });
    borderCards = await createGrassDebugV2CanopyBorderCards({ renderer, lod2, edgeIds, width, depth, edgeWidth: GRASS_FIELD_CANOPY.edgeWidth, onProgress });
    borderCards.group.visible = false;
    const group=new THREE.Group();group.name='GrassField-LOD4';group.add(top,edges,borderCards.group,wall.group);
    const footprint=Object.freeze({minX:-width/2+GRASS_FIELD_CANOPY.inset,maxX:width/2-GRASS_FIELD_CANOPY.inset,minZ:-depth/2+GRASS_FIELD_CANOPY.inset,maxZ:depth/2-GRASS_FIELD_CANOPY.inset});
    let edgeStrategy = 'leaves';
    return Object.freeze({group,footprint,relief,wall,get materials(){return materials;},get reliefMaterials(){return reliefMaterialProfiles[mapProfile];},shadowUniforms,edgeIds:Object.freeze(edgeIds),
        readPixels: (layer, channel, variant = 0) => bakes[variant].profiles[mapProfile].readPixels(layer, channel),
        setMapProfile(profile, root = group) {
            if (!Object.hasOwn(materialProfiles, profile)) throw new Error('Unknown LOD4 map profile: ' + profile);
            const previous = materials, previousRelief = reliefMaterialProfiles[mapProfile];
            mapProfile = profile; materials = materialProfiles[profile];
            const updateMaterial = mesh => {
                if (mesh.isMesh && mesh.userData.grassCanopy) mesh.material = mesh.material === previous.grass ? materials.grass : materials.all;
                if (mesh.isMesh && mesh.userData.grassCanopyRelief) mesh.material = mesh.material === previousRelief.grass ? reliefMaterialProfiles[profile].grass : reliefMaterialProfiles[profile].all;
            };
            root.traverse(updateMaterial);
            if (root === group) relief.group.traverse(updateMaterial);
        },
        setBorderStrategy(strategy, root = group) {
            if (!['leaves', 'cards'].includes(strategy)) throw new Error('Unknown LOD4 border strategy: ' + strategy);
            edgeStrategy = strategy;
            root.traverse(object => {
                if (object.name === edges.name) object.visible = strategy === 'leaves';
                if (object.name === borderCards.group.name) object.visible = strategy === 'cards';
            });
        },
        getCompiledLayout: () => compileLayout ? layoutAsset : null,
        getSnapshot:()=>({leaves:edgeIds.length+interiorIds.length,
            liveLeaves:edgeStrategy === 'leaves' ? edgeIds.length : borderCards.getSnapshot().liveLeaves,
            textureLeaves:interiorIds.length+(edgeStrategy === 'cards' ? borderCards.getSnapshot().cardLeaves : 0),
            triangles:geometry.index.count/3+wall.getSnapshot().triangles+(edgeStrategy === 'leaves' ? edgeGeometry.index.count/3 : borderCards.getSnapshot().triangles),canopyTriangles:geometry.index.count/3,
            wall:wall.getSnapshot(),
            edgeTriangles:edgeStrategy === 'leaves' ? edgeGeometry.index.count/3 : borderCards.getSnapshot().triangles,
            originalEdgeTriangles:edgeGeometry.index.count/3,
            edgeStrategy,borderCards:borderCards.getSnapshot(),textureVariantCount:2,
            definition:GRASS_FIELD_CANOPY,footprint,layout,mapProfile,bake:{...bake.profiles[mapProfile].getSnapshot(),
                estimatedTextureBytes:bakes.reduce((sum,bake)=>sum+bake.profiles[mapProfile].getSnapshot().estimatedTextureBytes,0),
                residentTextureBytes:bakes.reduce((sum,bake)=>sum+bake.getSnapshot().residentTextureBytes,0),
                variants:bakes.map(b=>b.profiles[mapProfile].getSnapshot()),
                placement,optimization,renderedOptimization,periodic:periodicSnapshots[0],shadowPeriodic:shadowPeriodicSnapshots[0]},shadowSource:'LOD2'}),
        dispose(){geometry.dispose();edgeGeometry.dispose();borderCards.dispose();relief.dispose();wall.dispose();[...Object.values(materialProfiles),...Object.values(reliefMaterialProfiles)].forEach(set=>Object.values(set).forEach(material=>material.dispose()));bakes.forEach(b=>b.dispose());}
    });
    } catch (error) {
        borderCards?.dispose(); relief?.dispose(); wall?.dispose(); geometry?.dispose(); edgeGeometry?.dispose();
        [...Object.values(materialProfiles), ...Object.values(reliefMaterialProfiles)].forEach(set=>Object.values(set).forEach(material=>material.dispose()));
        bakes.forEach(bake=>bake.dispose());
        throw error;
    } finally { captures.forEach(capture=>capture.geometry.dispose()); }
}
