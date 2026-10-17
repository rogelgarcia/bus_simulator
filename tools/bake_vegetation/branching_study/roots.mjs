// A bounded soil-section graph, independent of the shoot grammar and its random streams.
import {radians,samplePath,radiusAt} from './geometry.mjs';
export const rootLimit=600;
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));

function rootCurve(start,end,heading,bend,o){
    const dx=end[0]-start[0],dy=end[1]-start[1],length=Math.hypot(dx,dy),weight=Math.abs(bend)/50;
    const bow=length*Math.sin(radians(bend))*.2;
    const bound=p=>[clamp(p[0],Math.min(start[0],end[0]),Math.max(start[0],end[0])),clamp(p[1],-o.rootDepth,0)];
    const a=bound([start[0]+dx/3*(1-weight)+Math.cos(heading)*length/3*weight-dy/length*bow,
        start[1]+dy/3*(1-weight)+Math.sin(heading)*length/3*weight+dx/length*bow]);
    const b=bound([end[0]-dx/3-dy/length*bow,end[1]-dy/3+dx/length*bow]);
    return Array.from({length:25},(_,i)=>{
        const t=i/24,u=1-t;
        return [0,1].map(axis=>u*u*u*start[axis]+3*u*u*t*a[axis]+3*u*t*t*b[axis]+t*t*t*end[axis]);
    });
}

function collar(trunk,o,sample=samplePath){
    const end=Math.min(.4,trunk.baseRadius*2*o.rootFlareHeight/trunk.span);
    const positions=Array.from({length:25},(_,i)=>end*i/24);
    return {id:trunk.anchor,host:{domain:'shoot',id:trunk.id,t:0},kind:'root-collar',level:0,order:0,parent:-1,span:trunk.span*end,
        points:positions.map(t=>sample(trunk,t).point),
        radii:positions.map(t=>radiusAt(trunk,t)+trunk.baseRadius*o.rootFlare*(1-t/end)**2)};
}

/** Build lateral roots, optional sinkers and a taproot below the fixed ground plane. */
export function generateRoots(o,shoots,base,random,space=null){
    const sample=space?.samplePath??samplePath;
    const paths=[],stopped={size:0,boundary:0,budget:0};
    const system={paths,collar:null,collars:[],crown:null,baseId:base.id,groundY:0,rootLimit,stopped};
    if(!o.rootsEnabled||!base.anchors.length){system.audit=auditRoots(system,shoots,base,o,space);return system;}
    system.collars=base.anchors.map(a=>collar(shoots[a.shoot],o,sample));system.collar=system.collars[0];
    const anchors=[...base.anchors].sort((a,b)=>a.point[0]-b.point[0]),single=anchors.length===1;
    if(!single)system.crown={id:0,kind:'shared-root-crown',parent:-1,level:0,order:0,
        span:anchors.at(-1).point[0]-anchors[0].point[0],points:anchors.map(a=>a.point),radii:anchors.map(a=>a.radius*(1+o.rootFlare)),anchors:anchors.map(a=>a.id)};
    const left=anchors[0].point[0]-o.rootReach,right=anchors.at(-1).point[0]+o.rootReach;
    const bound=p=>space?space.boundRoot(p,o,base):[clamp(p[0],left,right),clamp(p[1],-o.rootDepth,-o.rootDepth*.025)];
    const pending=[];
    for(let i=0;i<o.rootCount;i++){
        const side=i%2===0?-1:1,rank=Math.floor(i/2),perSide=Math.ceil((o.rootCount-(i%2))/2);
        const layer=perSide===1?.25:rank/(perSide-1),rng=random(o.seed,'roots/main/'+i);
        const lengthFactor=1+(rng()-.5)*o.rootRandomness;
        const anchor=anchors[side<0?rank%anchors.length:anchors.length-1-rank%anchors.length],trunk=shoots[anchor.shoot];
        const host=single?{domain:'shoot',id:trunk.id,t:0}:{domain:'base',id:base.id,anchor:anchor.id};
        pending.push({parent:-1,parentT:0,host,start:[...anchor.point],
            end:space?space.mainRootEnd(anchor,i,o,random,layer,lengthFactor):bound([anchor.point[0]+side*o.rootReach*(.64-.14*layer)*lengthFactor,-o.rootDepth*(.13+.34*layer)*lengthFactor]),
            heading:side<0?-Math.PI+radians(20+35*layer):-radians(20+35*layer),
            level:0,order:0,kind:'lateral-root',key:'roots/main/'+i,side,
            baseRadius:trunk.baseRadius*o.rootBaseRatio*(1-.2*layer)});
    }
    if(o.rootTaproot>0){
        const anchor=anchors[Math.floor(anchors.length/2)];
        pending.push({parent:-1,parentT:0,host:single?{domain:'shoot',id:anchor.shoot,t:0}:{domain:'base',id:base.id,anchor:anchor.id},start:[...anchor.point],
            end:[anchor.point[0],-o.rootDepth*o.rootTaproot,...(space?[anchor.point[2]]:[])],heading:-Math.PI/2,level:0,order:0,kind:'taproot',key:'roots/tap',side:1,
            baseRadius:anchor.radius*o.rootBaseRatio});
    }
    for(let index=0;index<pending.length;index++){
        const bud=pending[index],rng=random(o.seed,bud.key),length=distance(bud.start,bud.end);
        if(paths.length>=rootLimit){stopped.budget++;continue;}
        if(length<Math.max(.01,o.rootReach*.012)||bud.baseRadius*2000<o.rootMinimumDiameter){stopped.size++;continue;}
        const bend=o.rootBend===0?0:bud.side*o.rootBend*(1-o.rootRandomness*rng());
        const points=space?space.rootCurve(bud.start,bud.end,bend,o,base):rootCurve(bud.start,bud.end,bud.heading,bend,o);
        const span=points.slice(1).reduce((sum,p,i)=>sum+distance(points[i],p),0);
        const profileTipRadius=bud.baseRadius*(1-o.rootTaper);
        const p={...bud,id:paths.length,bend,span,points,profileTipRadius,tipRadius:profileTipRadius*.06,taperProfile:1.4,terminalStart:.9,children:[]};
        delete p.start;delete p.end;paths.push(p);
        if(p.parent>=0)paths[p.parent].children.push(p.id);
        if(p.level+1>=o.rootLevels)continue;
        const queue=(key,t,kind,target,heading)=>{
            const frame=sample(p,t),end=bound(target),size=distance(frame.point,end);
            if(size<Math.max(.01,o.rootReach*.012)||size>=span*.95){stopped.boundary++;return;}
            pending.push({parent:p.id,parentT:t,start:frame.point,end,heading,kind,key,side:p.side,
                level:p.level+1,order:p.order+1,baseRadius:radiusAt(p,t)*(1-o.rootThicknessLoss)});
        };
        for(let i=0;i<o.rootChildren;i++){
            const key=p.key+'/side/'+i,childRng=random(o.seed,key),step=o.rootChildren===1?.5:i/(o.rootChildren-1);
            const t=.28+.52*step+(childRng()-.5)*.12*o.rootRandomness,frame=sample(p,t);
            const turn=(i%2===0?1:-1)*p.side*o.rootForkAngle*(1+(childRng()-.5)*o.rootRandomness);
            const heading=frame.heading+radians(turn),childLength=span*o.rootLengthRatio*(1+(childRng()-.5)*o.rootRandomness*.5);
            queue(key,t,'side-root',space?space.sideRootEnd(frame,turn,childLength):[frame.point[0]+Math.cos(heading)*childLength,frame.point[1]+Math.sin(heading)*childLength],heading);
        }
        if(p.kind==='lateral-root'&&random(o.seed,p.key+'/sinker-chance')()<o.rootSinkers){
            const t=.3+.3*rng(),frame=sample(p,t),length=Math.min(span*.65,o.rootDepth+frame.point[1]);
            queue(p.key+'/sinker',t,'sinker',[frame.point[0]+p.side*length*.12,frame.point[1]-length*.92,...(space?[frame.point[2]]:[])],-Math.PI/2);
        }
    }
    for(const p of paths)p.radii=p.points.map((_,i)=>radiusAt(p,i/(p.points.length-1)));
    system.audit=auditRoots(system,shoots,base,o,space);return system;
}

export function auditRoots(system,shoots,base,o,space=null){
    const sample=space?.samplePath??samplePath;
    let attachmentError=0;
    const connected=system.paths.every((p,i)=>{
        const anchor=p.parent<0&&p.host?.domain==='base'?base.anchors.find(a=>a.id===p.host.anchor):null;
        const host=p.parent<0?shoots[anchor?.shoot??p.host?.id]:system.paths[p.parent];
        if(!host||p.id!==i||p.parent>=i||p.points.length!==p.radii.length)return false;
        if(p.parent<0&&(p.host.domain==='base'?p.host.id!==base.id||!anchor:p.host.domain!=='shoot'||host.parent!==-1))return false;
        const expected=sample(host,p.parentT).point;
        attachmentError=Math.max(attachmentError,distance(expected,p.points[0]));
        return p.points.flat().every(Number.isFinite)&&p.baseRadius<=radiusAt(host,p.parentT)+1e-10;
    });
    const extent=Math.max(0,...base.anchors.map(a=>space?Math.hypot(a.point[0],a.point[2]):Math.abs(a.point[0])));
    const bounded=system.paths.every(p=>p.points.every(([x,y,z])=>(space?Math.hypot(x,z):Math.abs(x))<=o.rootReach+extent+1e-9&&y<=1e-9&&y>=-o.rootDepth-1e-9));
    const taper=system.paths.every(p=>p.radii.every((r,i)=>Number.isFinite(r)&&r>0&&(!i||r<=p.radii[i-1]+1e-10)));
    const shorter=system.paths.every(p=>p.parent<0||p.span<system.paths[p.parent].span);
    const collarValid=system.collars.every(collar=>{const trunk=shoots[collar.host.id];return Boolean(trunk&&distance(collar.points[0],trunk.points[0])<1e-9&&
        collar.points.flat().every(Number.isFinite)&&collar.radii.every((r,i)=>r>0&&(!i||r<=collar.radii[i-1]+1e-9))&&
        distance(collar.points.at(-1),sample(trunk,collar.span/trunk.span).point)<1e-9&&
        Math.abs(collar.radii.at(-1)-radiusAt(trunk,collar.span/trunk.span))<1e-9);});
    const crownValid=!system.crown||system.crown.points.every((p,i)=>{
        const a=base.anchors.find(a=>a.id===system.crown.anchors[i]);return a&&distance(p,a.point)<1e-9&&system.crown.radii[i]>=a.radius;
    });
    return {connected,bounded,taper,shorter,collarValid,crownValid,attachmentError,passed:connected&&bounded&&taper&&shorter&&collarValid&&crownValid&&attachmentError<1e-9};
}
