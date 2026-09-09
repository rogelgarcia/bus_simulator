// Builds a source-preserving lighting matrix with explicit ratio and absolute scale controls.
// @ts-check
import path from 'node:path';

export const TARGET='lighting/experiments/sun-sky-ratios';
export const TOOL='tools/bake_lighting/experiments/sun_sky_ratios';
export const ARTIFACTS='tests/artifacts/screens/ai563_sun_sky_ratios';

/** @param {any} defaults @param {any} sourceLighting */
export function makeLighting(defaults,sourceLighting) {
    if(defaults.schemaVersion!==1||!Array.isArray(defaults.variants)||!defaults.variants.length)throw new Error('Invalid experiment schema/variants');
    const ids=new Set();
    for(const item of defaults.variants){
        if(!/^[A-Z][A-Z0-9]*$/.test(item.id)||ids.has(item.id))throw new Error('Invalid or duplicate variant ID');
        ids.add(item.id);
        for(const key of ['sunMultiplier','environmentMultiplier','radianceScale'])if(!Number.isFinite(item[key])||item[key]<=0)throw new Error(`Invalid ${key}`);
    }
    if(!ids.has(defaults.reference)||!ids.has(defaults.uniformControl))throw new Error('Missing reference/control');
    const control=defaults.variants.find(item=>item.id===defaults.uniformControl);
    if(control.sunMultiplier!==1||control.environmentMultiplier!==1)throw new Error('Uniform control must preserve the source ratio');
    if(!Number.isFinite(defaults.baseExposure)||defaults.baseExposure<=0)throw new Error('Invalid exposure');
    if(defaults.tones.map(item=>item.id).join(',')!=='aces,agx')throw new Error('This experiment requires ACESFilmic and AgX');
    return {...structuredClone(sourceLighting),configurations:defaults.variants.map(item=>({...item,environment:'source',sun:'source',skyScale:1,sunDiameterDegrees:.53}))};
}

/** @param {string} root @param {string} value @param {string} base */
export function withinArtifacts(root,value,base=ARTIFACTS){
    const resolved=path.resolve(root,value),parent=path.resolve(root,base),relative=path.relative(parent,resolved);
    if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw new Error(`Path must be within ${base}`);
    return resolved;
}
