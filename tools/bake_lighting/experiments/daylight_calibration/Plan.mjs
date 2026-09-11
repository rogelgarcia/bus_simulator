// @ts-check
// Bounds immutable experiment outputs and rejects unsupported atmospheric/display contracts.
import path from 'node:path';
export const TARGET='lighting/experiments/daylight-calibration';
export const TOOL='tools/bake_lighting/experiments/daylight_calibration';
export const ARTIFACTS='tests/artifacts/screens/ai565_daylight_calibration';
/** @param {string} root @param {string} value */
export function outputPath(root,value){
    const base=path.resolve(root,ARTIFACTS),output=path.resolve(root,value),relative=path.relative(base,output);
    if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Use a named output beneath '+ARTIFACTS);
    return output;
}
/** @param {any} d */
export function validateDefaults(d){
    if(d.schemaVersion!==1||d.blenderVersion!=='5.2.1'||d.skyModel!=='MULTIPLE_SCATTERING')throw new Error('Unvalidated atmospheric implementation');
    if(d.profiles.length!==3||new Set(d.profiles.map(p=>p.id)).size!==3)throw new Error('Expected three unique daylight profiles');
    for(const p of d.profiles){
        if(!/^D0[1-3]$/.test(p.id)||!['atmosphere','cie_overcast'].includes(p.model))throw new Error('Invalid profile');
        if(p.model==='atmosphere'&&!(p.aerosolDensity>=0&&p.aerosolDensity<=5))throw new Error('Unsupported aerosol range');
        if(p.model==='cie_overcast'&&!(p.horizontalIlluminanceLux>0))throw new Error('Overcast requires absolute normalization');
    }
    for(const k of ['width','height','samples','fixtureSamples','environmentWidth','threads'])if(!Number.isInteger(d[k])||d[k]<1)throw new Error('Invalid '+k);
    if(d.threads>8||d.width>3840||d.samples<16||d.samples>4096||d.sun.elevationDeg<=5||d.sun.elevationDeg>=85||d.sun.angularDiameterDeg!==0.53)throw new Error('Outside validated experiment bounds');
    return d;
}
