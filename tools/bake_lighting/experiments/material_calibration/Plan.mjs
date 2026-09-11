// @ts-check
// Material-calibration input and artifact boundaries.
import path from 'node:path';
export const TARGET='lighting/experiments/material-calibration';
export const TOOL='tools/bake_lighting/experiments/material_calibration';
export const ARTIFACTS='tests/artifacts/screens/ai566_material_calibration';
export function outputPath(root,value){
    const base=path.resolve(root,ARTIFACTS),out=path.resolve(root,value),relative=path.relative(base,out);
    if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Use a named output under '+ARTIFACTS);
    return out;
}
export function validateProfile(defaults,profiles){
    if(defaults.schemaVersion!==1||profiles.schemaVersion!==1||profiles.publication!=='experiment-only')throw new Error('Unsupported material profile');
    if(!Number.isInteger(defaults.threads)||!Number.isInteger(defaults.samples)||defaults.threads<1||defaults.threads>8||defaults.samples<16||defaults.samples>512)throw new Error('Unbounded render workload');
    if(defaults.angles.length!==3||defaults.angles.some(v=>!Number.isFinite(v)||v<0||v>=85))throw new Error('Invalid material fixture angles');
    if(new Set(defaults.materials.map(m=>m.id)).size!==defaults.materials.length)throw new Error('Duplicate material ID');
    for(const p of Object.values(profiles.plausible.bus))if(!Number.isFinite(p.roughness)||!Number.isFinite(p.f0)||p.roughness<.04||p.roughness>1||p.f0<.01||p.f0>.16)throw new Error('Candidate outside physical proposal bounds');
}
