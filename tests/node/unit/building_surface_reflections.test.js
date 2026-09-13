import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBuildingSurfaceReflections, updateBuildingSurfaceReflectionIntensity } from '../../../src/graphics/visuals/buildings/BuildingSurfaceReflections.js';
import { sanitizeBuildingWindowVisualsSettings } from '../../../src/graphics/visuals/buildings/BuildingWindowVisualsSettings.js';
import { subtractTriangle } from '../../../tools/bake_lighting/experiments/lighting_configurations/export_city/GroundRoadCoverage.js';

test('Opaque reflections restore original material identity and inputs after repeated toggles', () => {
    const material = { isMeshStandardMaterial: true, envMapIntensity: 0, roughness: .85, color: [1,.5,.1], aoMapIntensity: 1,
        userData: { iblNoAutoEnvMapIntensity: true }, version: 7 };
    const original = JSON.stringify(material), mesh = { isMesh: true, material }, root = { traverse: visit => visit(mesh) };
    for (let i = 0; i < 30; i++) {
        applyBuildingSurfaceReflections(root, true, 1); assert.equal(material.envMapIntensity, 1);
        updateBuildingSurfaceReflectionIntensity(material, .4); assert.equal(material.envMapIntensity, .4);
        applyBuildingSurfaceReflections(root, false, 1); assert.equal(JSON.stringify(material), original);
        assert.equal(mesh.material, material);
    }
});

test('Opaque reflections exclude glass, window groups and authored environment materials', () => {
    const base = { isMeshStandardMaterial: true, envMapIntensity: 0, userData: { iblNoAutoEnvMapIntensity: true } };
    const materials = [{...base, transparent:true}, {...base,transmission:.5}, {...base,userData:{}}, {...base}];
    const objects = materials.map((material,i) => ({isMesh:true,material,parent:i===3?{name:'windows'}:null}));
    const original = JSON.stringify(materials);
    assert.equal(applyBuildingSurfaceReflections({traverse:visit=>objects.forEach(visit)},true,1).materials,0);
    assert.equal(JSON.stringify(materials),original);
});

test('Building reflection preference defaults off and survives settings sanitization', () => {
    assert.equal(sanitizeBuildingWindowVisualsSettings({}).surfaces.reflections,false);
    const enabled=sanitizeBuildingWindowVisualsSettings({surfaces:{reflections:true}});
    assert.equal(sanitizeBuildingWindowVisualsSettings(JSON.parse(JSON.stringify(enabled))).surfaces.reflections,true);
});

const area = p => Math.abs(p.reduce((s,v,i)=>s+v[0]*p[(i+1)%p.length][2]-p[(i+1)%p.length][0]*v[2],0))*.5;
test('Grass subtraction preserves area and interpolated UVs at a crossing road edge', () => {
    const square=[[0,0,0,0,0],[2,0,0,1,0],[2,0,2,1,1],[0,0,2,0,1]];
    const road=[[1,0,-1],[3,0,-1],[1,0,3]];
    const pieces=subtractTriangle(square,road);
    assert.ok(Math.abs(pieces.reduce((s,p)=>s+area(p),0)-2.25)<1e-8);
    for(const p of pieces)for(const v of p){assert.ok(Math.abs(v[3]-v[0]/2)<1e-8);assert.ok(Math.abs(v[4]-v[2]/2)<1e-8);}
    assert.ok(subtractTriangle(square,[[-5,0,-5],[10,0,-5],[-5,0,10]]).every(p=>area(p)<1e-8));
});
