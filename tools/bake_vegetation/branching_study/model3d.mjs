// Public spatial adapter and exact planar compatibility lift for the shared generator.
import {generate,audit,presets as planarPresets} from './model.mjs';
import {species} from './species.mjs';
import {createSpatialGeometry} from './spatial.mjs';
export const presets=Object.freeze(Object.fromEntries(Object.entries(planarPresets).map(([id,preset])=>[id,Object.freeze({...preset,...species[id]?.spatialParameters})])));
export {sampleSpatialPath} from './spatial.mjs';
export function generate3D(options={},configuration={}){
    return generate(options,createSpatialGeometry(configuration));
}
export function audit3D(model){return audit(model,createSpatialGeometry(model.spatial));}
export function planarFixture(options={}){
    const model=generate(options),lift=p=>[...p,0];
    for(const p of model.paths){p.points=p.points.map(lift);p.origin=lift(p.origin);}
    for(const p of [...model.roots.paths,...model.roots.collars,...(model.roots.crown?[model.roots.crown]:[])])p.points=p.points.map(lift);
    for(const a of model.base.anchors)a.point=lift(a.point);
    model.base.origin=lift(model.base.origin);model.dimensions=3;model.embedding='exact planar compatibility fixture';
    return model;
}
