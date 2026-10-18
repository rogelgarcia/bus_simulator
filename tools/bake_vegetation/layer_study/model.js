// Pure canopy-shell configuration, camera projection and source-bound exchange format.
// @ts-check
export const LAYER_IDS=Object.freeze(['inner','middle','outer']);
export const COLORS=Object.freeze(['#ffb66b','#53d1b2','#a0a8ff']);
export const clone=value=>structuredClone(value);
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
export function project(point,view){
    const offset=point.map((v,i)=>v-view.target[i]);
    return [.5+dot(offset,view.right)/view.span,.5-dot(offset,view.up)/view.span];
}
export function moveInView(center,delta,view){
    return center.map((v,i)=>v+view.span*(delta[0]*view.right[i]-delta[1]*view.up[i]));
}
export function projectedRadii(radii,view){
    return [view.right,view.up].map(axis=>Math.sqrt(axis.reduce((n,v,i)=>n+(v*radii[i])**2,0))/view.span);
}
export function classify(point,config){
    return config.layers.findIndex(layer=>point.reduce((n,v,i)=>n+((v-config.center[i])/layer.radii[i])**2,0)<=1);
}
export function counts(points,config){
    const result=[0,0,0,0];
    for(let i=0;i<points.length;i+=3){const slot=classify(points.subarray(i,i+3),config);result[slot<0?3:slot]++;}
    return result;
}
export function validateConfig(config){
    const vector=value=>Array.isArray(value)&&value.length===3&&value.every(v=>Number.isFinite(v)&&Math.abs(v)<10000);
    if(!vector(config?.center)||!Array.isArray(config.layers)||config.layers.length!==3)throw Error('Each model needs a finite XYZ center and three layers.');
    config.layers.forEach((layer,index)=>{
        if(layer.id!==LAYER_IDS[index]||!vector(layer.radii)||layer.radii.some(r=>r<.01)||layer.strategy!==null)throw Error('Invalid layer geometry or strategy. Strategies stay unset in this study.');
        if(index&&layer.radii.some((r,axis)=>r<config.layers[index-1].radii[axis]+.00999))throw Error('Layer sizes must increase by at least 1 cm from inner to middle to outer on every axis.');
    });
    return config;
}
export function createExport(study,configs,reviewed){
    return {format:'vegetation-canopy-layers',version:1,units:'metres',coordinateSystem:'model-local-z-up',
        shape:'concentric-axis-aligned-ellipsoids',assignment:'first-containing-layer-by-blade-center; outside is unassigned',
        models:study.models.map(model=>({id:model.id,source:clone(model.source),reviewed:!!reviewed[model.id],...clone(validateConfig(configs[model.id]))}))};
}
export function parseExport(text,study){
    const doc=JSON.parse(text),configs={},reviewed={};
    if(doc.format!=='vegetation-canopy-layers'||doc.version!==1||doc.units!=='metres'||doc.coordinateSystem!=='model-local-z-up'||doc.shape!=='concentric-axis-aligned-ellipsoids')throw Error('Unsupported canopy-layer configuration.');
    if(!Array.isArray(doc.models)||doc.models.length!==study.models.length||new Set(doc.models.map(m=>m.id)).size!==study.models.length)throw Error('Import must contain every model exactly once.');
    for(const row of doc.models){
        const source=study.models.find(m=>m.id===row.id);
        if(!source||row.source?.sha256!==source.source.sha256||row.source?.revision!==source.source.revision)throw Error('Source model changed: '+row.id);
        configs[row.id]=clone(validateConfig({center:row.center,layers:row.layers}));reviewed[row.id]=row.reviewed===true;
    }
    return {configs,reviewed};
}
