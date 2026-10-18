// Shared planar/spatial shoot grammar: curved axes, spaced buds and repeated daughter forks.
import {settings} from './parameters.mjs';
import {generateRoots,auditRoots} from './roots.mjs';
import {initialAxes,plantBase,daughterSites,childDimensions,curveSettings} from './architecture.mjs';
import {sizeSupport} from './support.mjs';
import {radians,branchCurve,samplePath,radiusAt,crossingIndex} from './geometry.mjs';
export {defaults,presets} from './parameters.mjs';
export {samplePath,radiusAt} from './geometry.mjs';
export const branchLimit=4000;
function random(seed,key){
    let state=seed>>>0;
    for(const char of key)state=Math.imul(state^char.charCodeAt(0),16777619)>>>0;
    return ()=>{state+=0x6D2B79F5;let t=state;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
}
/** Build a deterministic graph in metres; level counts include the continuing apex. */
export function generate(options={},space=null){
    const o=settings(options),paths=[],occupied=crossingIndex();
    const stopped={crossings:0,dormant:0,tooShort:0,tooThin:0,direction:0,budget:0,spacing:0,slenderness:0};
    if(space&&o.competition)throw Error('Projected crossing suppression is unavailable in 3D');
    let pending=space?space.initialAxes(o,random):initialAxes(o,random);
    const growthLevels=o.depth+o.ramificationLevels;
    for(let level=0;level<=growthLevels;level++){
        const next=[];pending.sort((a,b)=>b.span-a.span||a.key.localeCompare(b.key));
        for(const bud of pending){
            if(paths.length>=branchLimit){stopped.budget++;continue;}
            if(bud.span<o.minimumLength){stopped.tooShort++;continue;}
            if(bud.baseRadius*2000<o.minimumDiameter){stopped.tooThin++;continue;}
            const shape=curveSettings(bud,o,random),bend=shape.bend;
            if(o.maximumSlenderness&&bud.span>bud.baseRadius*o.maximumSlenderness){bud.span=bud.baseRadius*o.maximumSlenderness;stopped.slenderness++;}
            if(bud.span<o.minimumLength){stopped.tooShort++;continue;}
            const points=space?space.branchCurve(bud,shape,o):branchCurve(bud.start,bud.heading,bud.span,bend,shape.profile,shape.mode,shape.center,shape.spread,shape.recovery,
                bud.joinHeading??bud.heading,bud.parent<0?0:o.junctionBlend);
            if(o.competition&&occupied.overlaps(points)){stopped.crossings++;continue;}
            const proposedChildren=level===growthLevels?0:level>=o.depth?3:level===0&&o.architecture==='mixed'&&o.primaryLimbs?o.primaryLimbs:bud.order===0&&o.architecture==='leader'&&o.leaderLaterals?o.leaderLaterals+1:o.countMode==='manual'?o.branchCounts[level]:
                o.minChildren+Math.floor(random(o.seed,bud.key+'count')()*(o.maxChildren-o.minChildren+1));
            const path={...bud,id:paths.length,bend,curveLimit:shape.limit,proposedChildren,points,tipRadius:bud.baseRadius*(1-o.taper),taperProfile:o.taperProfile,children:[],
                phase:level<=o.depth?'framework':'ramification',ramificationLevel:Math.max(0,level-o.depth)};
            delete path.start;
            paths.push(path);if(!space)occupied.add(points);
            if(path.parent>=0)paths[path.parent].children.push(path.id);
            if(level===growthLevels)continue;
            const sites=daughterSites(path,o,random);
            if(level<o.depth)stopped.spacing+=Math.max(0,proposedChildren-sites.length);
            const children=sites.map(site=>({site,...childDimensions(path,site,o,random,space)}));
            const tipChildren=children.filter(child=>child.site.t===1),tipArea=tipChildren.reduce((sum,p)=>sum+p.baseRadius**2,0);
            const tipScale=(o.forkAsymmetry||level>=o.depth)&&tipChildren.length>1?Math.min(1,radiusAt(path,1)/Math.sqrt(tipArea)):1;
            for(const child of children){
                const {site,survive,frame,span,role,order,crownT,lengthScale}=child;
                // atan2 wraps descending leftward tangents below -90 degrees; keep both sides in the same upward-centred interval.
                let heading=child.heading;
                while(heading<radians(-90))heading+=Math.PI*2;
                while(heading>radians(270))heading-=Math.PI*2;
                if(site.kind==='lateral'&&survive>o.budSurvival){stopped.dormant++;continue;}
                const lower=site.kind.startsWith('ramification-')?-85:-35;
                if(space?!space.acceptDirection(child.spatial.direction,lower):heading<radians(lower)||heading>radians(180-lower)){stopped.direction++;continue;}
                next.push({start:frame.point,heading,joinHeading:frame.heading,span,
                    parent:path.id,parentT:site.t,level:level+1,order,role,crownT,lengthScale,side:-path.side,kind:site.kind,key:`${path.key}.${site.slot}`,
                    baseId:path.baseId,anchor:path.anchor,origin:path.origin,baseRadius:child.baseRadius*(site.t===1?tipScale:1),...child.spatial});
            }
        }
        pending=next;
    }
    for(const p of paths)if(!p.children.length)p.tipRadius=Math.min(p.tipRadius,p.baseRadius*.08);
    const support=sizeSupport(paths,o.supportedSlenderness,Boolean(space));
    const rotation=-radians(o.lean),c=Math.cos(rotation),s=Math.sin(rotation);
    for(const p of paths){
        // Unbranched ends finish in a fine tip; supported attachment radii stay unchanged.
        p.radii=p.points.map((_,i)=>radiusAt(p,i/(p.points.length-1)));
        p.heading+=rotation;
        if(p.joinHeading!==undefined)p.joinHeading+=rotation;
        p.points=p.points.map(([x,y,z])=>[p.origin[0]+c*(x-p.origin[0])-s*y,s*(x-p.origin[0])+c*y,...(space?[z]:[])]);
        if(space)space.rotateFrame(p,rotation);
    }
    const base=plantBase(paths);if(space)base.origin=[0,0,0];
    const roots=generateRoots(o,paths,base,random,space);
    const result={format:'vegetation-branching-study',version:9,generator:'shared-v2-ramification-1',presetVersion:5,dimensions:2,units:'metres',settings:o,growthLevels,base,paths,roots,support,stopped,suppressed:stopped.crossings,branchLimit};
    if(space)Object.assign(result,{format:'vegetation-spatial-branching',version:1,generator:'shared-v2-spatial-ramification-1',dimensions:3,axes:'right-handed Y-up; Blender maps (x,y,z) to (x,-z,y)',parentTConvention:{shoot:'normalized arc length',root:'sample-index fraction'},spatial:space.configuration});
    result.audit=audit(result,space);return result;
}
export function descendants(model,id){
    const selected=new Set([id]);
    for(const p of model.paths)if(selected.has(p.parent))selected.add(p.id);
    return model.paths.filter(p=>selected.has(p.id));
}
export function audit(model,space=null){
    let attachmentError=0,maximumBowFraction=0,maximumTortuosity=1,intersections=0;
    const occupied=crossingIndex();
    for(const p of model.paths){
        if(p.parent>=0){const expected=(space?.samplePath??samplePath)(model.paths[p.parent],p.parentT).point;attachmentError=Math.max(attachmentError,Math.hypot(...expected.map((v,i)=>v-p.points[0][i])));}
        const start=p.points[0],end=p.points.at(-1),delta=end.map((v,i)=>v-start[i]),dx=delta[0],dy=delta[1],chord=Math.hypot(...delta);
        let arc=0;
        for(let i=0;i<p.points.length;i++){
            const q=p.points[i],projection=q.reduce((sum,v,k)=>sum+(v-start[k])*delta[k],0)/(chord*chord);
            const bow=space?Math.hypot(...q.map((v,k)=>v-start[k]-projection*delta[k]))/chord:Math.abs(dx*(q[1]-start[1])-dy*(q[0]-start[0]))/(chord*chord);
            maximumBowFraction=Math.max(maximumBowFraction,bow);
            if(i)arc+=Math.hypot(...q.map((v,k)=>v-p.points[i-1][k]));
        }
        maximumTortuosity=Math.max(maximumTortuosity,arc/chord);
        if(!space){if(occupied.overlaps(p.points))intersections++;occupied.add(p.points);}
    }
    const connected=model.paths.every((p,i)=>p.id===i&&p.parent<p.id&&p.points.length===p.radii.length&&p.points.flat().every(Number.isFinite)&&p.children.every(id=>model.paths[id]?.parent===p.id));
    const taper=model.paths.every(p=>p.baseRadius>=p.tipRadius&&p.radii.every((r,i)=>Number.isFinite(r)&&r>0&&(!i||r<=p.radii[i-1]+1e-10))&&
        (p.parent<0||p.baseRadius<=radiusAt(model.paths[p.parent],p.parentT)+1e-10));
    const shortening=model.paths.every(p=>p.parent<0||p.span<model.paths[p.parent].span);
    const boundedCurvature=model.paths.every(p=>Math.abs(p.bend)<=p.curveLimit+1e-10);
    const baseOwned=model.paths.every(p=>p.baseId===model.base.id&&model.base.anchors.some(a=>a.id===p.anchor))&&
        model.base.anchors.every(a=>{const p=model.paths[a.shoot];return p.parent===-1&&p.anchor===a.id&&Math.hypot(...p.points[0].map((v,i)=>v-a.point[i]))<1e-9;});
    const maximumSlenderness=Math.max(0,...model.paths.map(p=>p.span/p.baseRadius));
    const slendernessValid=!model.settings.maximumSlenderness||maximumSlenderness<=model.settings.maximumSlenderness+1e-9;
    let maximumSupportedSlenderness=0,nodeSpacingValid=true,tipAreaValid=true;
    const reaches=Array(model.paths.length).fill(0);
    for(const p of [...model.paths].reverse()){
        for(let i=0;i<p.points.length;i++){
            const t=i/(p.points.length-1),reach=Math.max(p.span*(1-t),...p.children.filter(id=>model.paths[id].parentT>=t).map(id=>(model.paths[id].parentT-t)*p.span+reaches[id]));
            maximumSupportedSlenderness=Math.max(maximumSupportedSlenderness,reach/p.radii[i]);if(!i)reaches[p.id]=reach;
        }
        const sites=[...new Set(p.children.map(id=>model.paths[id]).filter(child=>child.kind==='lateral').map(child=>child.parentT))].sort((a,b)=>a-b);
        const interval=model.settings.nodeSpacing*Math.pow(.65,p.order);
        if(sites.some((t,i)=>i&&(t-sites[i-1])*p.span<interval-1e-9))nodeSpacingValid=false;
        const tipArea=p.children.filter(id=>model.paths[id].parentT===1).reduce((sum,id)=>sum+model.paths[id].baseRadius**2,0);
        if((model.settings.forkAsymmetry||p.level>=model.settings.depth)&&tipArea>radiusAt(p,1)**2+1e-9)tipAreaValid=false;
    }
    const supportValid=!model.settings.supportedSlenderness||maximumSupportedSlenderness<=model.settings.supportedSlenderness+1e-9;
    const hierarchy=model.paths.every(p=>p.phase===(p.level<=model.settings.depth?'framework':'ramification')&&
        p.ramificationLevel===Math.max(0,p.level-model.settings.depth)&&p.level<=model.growthLevels&&
        (p.parent<0?p.level===0:p.level===model.paths[p.parent].level+1)&&
        (!p.kind.startsWith('ramification-')||p.order===model.paths[p.parent].order+1&&
            (p.kind==='ramification-fork'?p.parentT===1:p.parentT>0&&p.parentT<1)));
    const roots=auditRoots(model.roots,model.paths,model.base,model.settings,space);
    const spatial=space?space.auditGeometry(model):null;
    return {hierarchy,baseOwned,maximumSlenderness,slendernessValid,maximumSupportedSlenderness,supportValid,nodeSpacingValid,tipAreaValid,
        attachmentError,maximumBowFraction,maximumTortuosity,intersections,connected,taper,shortening,boundedCurvature,roots,
        ...(spatial?{spatial}:{}),passed:hierarchy&&baseOwned&&slendernessValid&&supportValid&&nodeSpacingValid&&tipAreaValid&&connected&&taper&&shortening&&boundedCurvature&&attachmentError<1e-9&&(!model.settings.competition||intersections===0)&&roots.passed&&(!spatial||spatial.passed)};
}
