// Defines the artifact boundary and validates independently parameterized calibration inputs.
// @ts-check
import path from 'node:path';
export const TARGET='lighting/experiments/physical-calibration';
export const TOOL='tools/bake_lighting/experiments/physical_calibration';
export const ARTIFACTS='tests/artifacts/screens/ai564_physical_calibration';

/** @param {string} root @param {string} value */
export function outputPath(root,value){
    const base=path.resolve(root,ARTIFACTS),file=path.resolve(root,value),relative=path.relative(base,file);
    if(relative.startsWith('..')||path.isAbsolute(relative)||relative==='')throw new Error('Use a named run inside '+ARTIFACTS);
    return file;
}

/** @param {any} value */
export function validateDefaults(value){
    if(value.schemaVersion!==1||!Number.isInteger(value.width)||value.width<64||value.width>1024||!Number.isInteger(value.samples)||value.samples<16||value.samples>4096)throw new Error('Invalid fixture dimensions/samples');
    if(!Number.isInteger(value.seed)||value.seed<0||!Number.isInteger(value.threads)||value.threads<1||value.threads>8||!(value.orthoScale>0)||value.exposure!==1)throw new Error('Invalid calibration scale/seed/exposure');
    if(value.vectors.length!==9||value.vectors.some(v=>v.length!==3||v.some(n=>!Number.isFinite(n)||n<0)))throw new Error('Invalid display vectors');
    for(const k of ['linearRelative','linearAbsolute','displayAbsolute','shadowRmse','noiseSigmaMultiplier','noiseMaximumRelative'])if(!(value.tolerances[k]>0)||!Number.isFinite(value.tolerances[k]))throw new Error('Invalid tolerance '+k);
    const ids=new Set();
    if(!value.fixtures.length)throw new Error('No fixtures');
    for(const f of value.fixtures){
        if(!/^[a-z0-9_]+$/.test(f.id)||ids.has(f.id)||!['sun','point','shadow','environment'].includes(f.source))throw new Error('Invalid or repeated fixture');
        ids.add(f.id);
        if(f.color.length!==3||f.color.some(v=>!Number.isFinite(v)||v<0||v>1))throw new Error('Invalid reflectance');
        for(const k of ['irradiance','intensity','height','radiance','occluderHeight','angularDiameter','angleDeg'])if(k in f&&(!Number.isFinite(f[k])||f[k]<0))throw new Error('Invalid '+k);
        const required={sun:['irradiance','angleDeg'],point:['intensity','height'],environment:['radiance'],shadow:['irradiance','occluderHeight','angularDiameter']}[f.source];
        if(required.some(k=>!(k in f)))throw new Error('Missing source parameters: '+f.id);
        if(('height' in f&&f.height<=0)||('occluderHeight' in f&&f.occluderHeight<=0)||f.angularDiameter>0.2||f.angleDeg>89)throw new Error('Invalid fixture geometry');
        if(f.textureBytes&&(f.textureBytes.length!==3||f.textureBytes.some(v=>!Number.isInteger(v)||v<0||v>255)))throw new Error('Invalid sRGB bytes');
    }
    return value;
}
