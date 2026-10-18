// Branch-local vector geometry for the shared grammar; metres, right-handed Y-up.
import {initialAxes} from './architecture.mjs';
import {branchCurve,radians} from './geometry.mjs';
import {rootSpace} from './spatial_roots.mjs';
export const add=(a,b)=>a.map((v,i)=>v+b[i]);
export const sub=(a,b)=>a.map((v,i)=>v-b[i]);
export const mul=(a,s)=>a.map(v=>v*s);
export const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const unit=a=>mul(a,1/Math.hypot(...a));
export const project=(a,d)=>sub(a,mul(d,dot(a,d)));
const up=[0,1,0],tau=Math.PI*2,golden=Math.PI*(3-Math.sqrt(5));
const elevation=d=>Math.atan2(d[1],Math.hypot(d[0],d[2]));
export function perpendicular(d,preferred=up){
    const p=project(preferred,d);return unit(Math.hypot(...p)>1e-8?p:project(Math.abs(d[0])<.8?[1,0,0]:[0,0,1],d));
}
export function turn(d,n,angle){return unit(add(mul(d,Math.cos(angle)),mul(n,Math.sin(angle))));}
export function blend(a,b,t){
    const angle=Math.acos(Math.max(-1,Math.min(1,dot(a,b))));
    if(angle<1e-8)return [...a];
    return turn(a,perpendicular(a,b),angle*t);
}
export function sampleSpatialPath(path,t){
    const scaled=t*(path.points.length-1),i=Math.min(path.points.length-2,Math.floor(scaled)),f=scaled-i;
    const a=path.points[i],d=sub(path.points[i+1],a),direction=unit(d);
    return {point:add(a,mul(d,f)),direction,heading:elevation(direction)};
}
export const acceptSpatialDirection=(direction,lower)=>direction[1]>=Math.sin(radians(lower))-1e-12;
export function auditSpatialGeometry(model){
    let maximumStepError=0,maximumJoinError=0,frames=true;
    const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
    for(const p of model.paths){
        frames&&=[p.direction,p.normal,...(p.joinDirection?[p.joinDirection]:[])].every(d=>d.length===3&&d.every(Number.isFinite)&&Math.abs(Math.hypot(...d)-1)<1e-9)&&Math.abs(dot(p.direction,p.normal))<1e-9;
        for(let i=0;i<p.points.length;i++){
            const q=p.points[i];frames&&=q.length===3;
            for(let k=0;k<3;k++){low[k]=Math.min(low[k],q[k]);high[k]=Math.max(high[k],q[k]);}
            if(i)maximumStepError=Math.max(maximumStepError,Math.abs(Math.hypot(...sub(q,p.points[i-1]))-p.span/(p.points.length-1)));
        }
        if(p.parent>=0&&model.settings.junctionBlend){
            const tangent=sampleSpatialPath(model.paths[p.parent],p.parentT).direction;
            maximumJoinError=Math.max(maximumJoinError,Math.hypot(...sub(tangent,unit(sub(p.points[1],p.points[0])))));
        }
    }
    return {frames,maximumStepError,maximumJoinError,bounds:{min:low,max:high},passed:frames&&maximumStepError<1e-9&&maximumJoinError<1e-9};
}

/** Spatial settings affect orientation only; shared numeric species presets still own the grammar. */
export function createSpatialGeometry(configuration={}){
    const config={azimuthOffset:0,forkTwist:68,azimuthJitter:22,...configuration};
    if(Object.keys(config).some(k=>!['azimuthOffset','forkTwist','azimuthJitter'].includes(k))||Object.values(config).some(v=>!Number.isFinite(v)))throw Error('Invalid spatial orientation settings');
    const phase=(o,random,key)=>tau*random(o.seed,key)()+radians(config.azimuthOffset);
    return {
        configuration:config,samplePath:sampleSpatialPath,acceptDirection:acceptSpatialDirection,auditGeometry:auditSpatialGeometry,...rootSpace,
        initialAxes(o,random){
            return initialAxes(o,random).map((p,i)=>{
                const a=phase(o,random,'spatial/base-phase')+i*golden,rank=Math.sqrt((i+.5)/o.basalCount);
                const radial=[Math.cos(a),0,Math.sin(a)],single=o.basalCount===1;
                const start=single?[0,0,0]:mul(radial,o.basalSpread*.5*rank);
                const angle=single?0:radians(o.caneLean)*rank;
                const direction=turn(up,radial,angle);
                return {...p,start,origin:[...start],direction,normal:perpendicular(direction,radial),heading:elevation(direction),outward:1};
            });
        },
        childFrame(path,site,frame,turnDegrees,o,random){
            const d=frame.direction,rng=random(o.seed,path.key+'/spatial-plane');
            let normal,angle=radians(turnDegrees);
            if(path.order===0&&site.kind!=='continuation'&&!site.kind.startsWith('ramification-')){
                const node=o.architecture==='mixed'&&path.level===0?(site.t-o.trunkClearance)/(1-o.trunkClearance)*(path.proposedChildren-1):o.arrangement==='paired'?Math.floor((site.slot-1)/2):site.slot;
                const azimuth=phase(o,random,'spatial/crown-phase')+node*golden+path.level*golden+(rng()-.5)*radians(config.azimuthJitter);
                normal=perpendicular(d,[Math.cos(azimuth),0,Math.sin(azimuth)]);
                angle=Math.abs(angle)*(o.arrangement==='paired'&&site.slot%2===0?-1:1);
            }else{
                const inherited=perpendicular(d,path.normal),across=unit(cross(d,inherited));
                const twist=radians(config.forkTwist)+(rng()-.5)*radians(config.azimuthJitter);
                normal=add(mul(inherited,Math.cos(twist)),mul(across,Math.sin(twist)));
            }
            let direction=turn(d,normal,angle);
            if(site.kind.startsWith('ramification-')&&o.ramificationOutward){
                const outward=sub(frame.point,[path.origin[0],o.trunkLength,path.origin[2]]);
                if(Math.hypot(...outward)>1e-8)direction=blend(direction,unit(outward),o.ramificationOutward);
            }
            if(!site.kind.startsWith('ramification-')&&o.tilt)direction=turn(direction,perpendicular(direction),radians(o.tilt)*Math.cos(elevation(direction)));
            return {direction,joinDirection:d,normal:perpendicular(direction,normal),heading:elevation(direction)};
        },
        branchCurve(bud,shape,o){
            const local=branchCurve([0,0],0,bud.span,shape.bend,shape.profile,shape.mode,shape.center,shape.spread,shape.recovery);
            const normal=bud.kind==='trunk'?bud.normal:perpendicular(bud.direction),steps=local.length-1,points=[[...bud.start]];
            for(let i=0;i<steps;i++){
                const delta=sub(local[i+1],local[i]),angle=Math.atan2(delta[1],delta[0]);
                let direction=turn(bud.direction,normal,angle);
                if(bud.parent>=0&&o.junctionBlend){
                    const t=Math.min(1,i/(steps-1)/o.junctionBlend),weight=t*t*(3-2*t);
                    direction=blend(bud.joinDirection,direction,weight);
                }
                points.push(add(points.at(-1),mul(direction,bud.span/steps)));
            }
            return points;
        },
        rotateFrame(p,angle){
            const rotate=([x,y,z])=>[Math.cos(angle)*x-Math.sin(angle)*y,Math.sin(angle)*x+Math.cos(angle)*y,z];
            for(const key of ['direction','normal','joinDirection'])if(p[key])p[key]=rotate(p[key]);
        }
    };
}
