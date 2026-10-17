// Shared basal initialization and context profiles; species supply ordinary numeric settings.
import {radians,samplePath,radiusAt} from './geometry.mjs';
import {ramificationSites,ramificationDimensions} from './ramification.mjs';
const clamp=n=>Math.max(0,Math.min(1,n));
const mix=(a,b,t)=>a+(b-a)*t;

export function initialAxes(o,random){
    return Array.from({length:o.basalCount},(_,i)=>{
        const single=o.basalCount===1,rng=random(o.seed,'base/'+i),rank=single?0:2*i/(o.basalCount-1)-1;
        const position=single?0:(rank+(rng()-.5)*.4/o.basalCount)*o.basalSpread/2;
        const vigor=single?1:1-o.caneVariation*(.3*Math.abs(rank)+.7*rng());
        return {start:[position,0],origin:[position,0],heading:radians(90-rank*o.caneLean+(single?0:(rng()-.5)*o.angleVariation)),
            span:o.trunkLength*vigor,parent:-1,parentT:0,level:0,order:0,side:single||rank<0?1:-1,
            kind:single?'trunk':'basal-cane',role:single?'trunk':'basal-cane',key:single?'r':`c${i}`,
            baseId:0,anchor:i,baseRadius:o.baseDiameter/2*(single?1:vigor*(.75+.25*rng())),outward:Math.sign(rank)};
    });
}

export function plantBase(paths){
    const initial=paths.filter(p=>p.parent<0),anchors=initial.map(p=>({id:p.anchor,shoot:p.id,point:[...p.points[0]],radius:p.baseRadius}));
    return {id:0,kind:initial.length>1?'root-crown':'single-stem',origin:[0,0],anchors,
        radius:Math.sqrt(initial.reduce((sum,p)=>sum+p.baseRadius**2,0))};
}

export function daughterSites(path,o,random){
    if(path.level>=o.depth&&o.ramificationLevels)return ramificationSites(path,o,random);
    const rng=random(o.seed,path.key+'/sites'),count=path.proposedChildren;
    if(o.architecture==='fork'||o.architecture==='mixed'&&path.level===0){
        const dominant=Math.floor(count/2);
        const ranks=Array.from({length:count},(_,i)=>i).filter(i=>i!==dominant).sort((a,b)=>Math.abs(2*b/(count-1)-1)-Math.abs(2*a/(count-1)-1));
        return Array.from({length:count},(_,i)=>({t:o.contextStrength&&path.level===0&&o.architecture==='mixed'?
            i===dominant?1:o.trunkClearance+(1-o.trunkClearance)*ranks.indexOf(i)/(count-1):1-o.contextStrength*(i===dominant?0:.1+.07*i),
            turn:count===1?0:o.forkAngle*(2*i/(count-1)-1),kind:'fork',slot:i,
            allocation:i===dominant?1:1-o.forkAsymmetry*(.65+.35*random(o.seed,path.key+'/fork/'+i)())}));
    }
    const split=count>1&&path.order>0&&path.role!=='terminal'&&random(o.seed,path.key+'/split')()<o.forkChance;
    const sideCount=count-1-(split?1:0),paired=o.arrangement==='paired',requested=paired?Math.ceil(sideCount/2):sideCount;
    const start=path.level===0?o.trunkClearance:o.branchStart,end=path.level===0?Math.max(o.branchEnd,start):o.branchEnd;
    const interval=o.nodeSpacing*Math.pow(.65,path.order),available=(end-start)*o.stagger*path.span;
    const groups=interval>0?Math.min(requested,Math.floor(available/interval)):requested;
    const spacing=groups>1?available/(groups-1):0,slack=Math.max(0,spacing-interval),positions=[];
    for(let group=0;group<groups;group++){
        const fraction=groups===1?.5:group/(groups-1);
        const jitter=(rng()-.5)*Math.min(spacing*o.nodeJitter,slack);
        positions.push(Math.max(start,Math.min(end,end-(available*(1-fraction)-jitter)/path.span)));
    }
    const sites=[{t:1,turn:-path.side*o.continuationAngle,kind:'continuation',slot:0,allocation:1}];
    for(let i=0;i<Math.min(sideCount,groups*(paired?2:1));i++)sites.push({t:positions[paired?Math.floor(i/2):i],
        turn:(i%2===0?path.side:-path.side)*o.forkAngle,kind:'lateral',slot:i+1,allocation:1});
    if(split){
        sites[0].turn=-path.side*o.forkAngle*.18;
        sites.push({t:1,turn:path.side*o.forkAngle*.75,kind:'fork',slot:count,allocation:1-o.forkAsymmetry});
    }
    return sites;
}

export function childDimensions(path,site,o,random,space=null){
    if(site.kind.startsWith('ramification-'))return ramificationDimensions(path,site,o,random,space);
    const rng=random(o.seed,`${path.key}.${site.slot}bud`),survive=rng(),angleSample=rng()-.5,lengthSample=rng()-.5;
    const frame=(space?.samplePath??samplePath)(path,site.t),continuing=site.kind==='continuation',primaryFork=o.architecture==='mixed'&&path.level===0;
    const order=path.order+(continuing?0:1),crownT=clamp((frame.point[1]-o.trunkLength*o.trunkClearance)/Math.max(.1,o.crownHeight-o.trunkLength*o.trunkClearance));
    const role=order>=o.terminalOrder?'terminal':continuing?(path.role==='trunk'?'leader':path.role):order===1?'scaffold':'lateral';
    const profile=continuing?1:mix(o.lowerLengthScale,o.upperLengthScale,crownT)*Math.pow(o.orderLengthScale,Math.max(0,order-1));
    const lengthScale=mix(1,profile*(role==='terminal'?o.terminalLengthScale:continuing&&order>1?.82:1),o.contextStrength);
    const ratio=(continuing||primaryFork?o.mainRatio:o.lateralRatio)*lengthScale*site.allocation*(primaryFork&&site.t===1?o.primaryApicalScale:1);
    const span=path.span*Math.min(.96,ratio*(1+lengthSample*2*o.lengthVariation));
    const angleScale=mix(1,mix(1,o.upperAngleScale,crownT)*Math.pow(.8,Math.max(0,order-1)),o.contextStrength);
    const turn=site.turn*(continuing?1:angleScale)+angleSample*2*o.angleVariation*(continuing?.625:1);
    const direction=frame.heading+radians(turn),heading=direction+radians(o.tilt)*Math.cos(direction);
    const radius=radiusAt(path,site.t)*(1-(continuing?o.leaderLoss:o.radiusLoss))*Math.sqrt(site.allocation);
    return {survive,frame,heading,span,baseRadius:radius,role,order,crownT,lengthScale,
        ...(space?{spatial:space.childFrame(path,site,frame,turn,o,random)}:{})};
}

export function curveSettings(bud,o,random){
    if(bud.kind==='trunk')return {bend:-o.trunkBend*(1-o.trunkBendVariation*random(o.seed,'trunk-shape')()),
        center:o.trunkBendCenter,spread:o.trunkBendSpread,recovery:o.trunkBendRecovery,mode:'localized',profile:1,limit:Math.abs(o.trunkBend)};
    const rng=random(o.seed,bud.key),noise=(rng()-.5)*2;
    const uniform=(1-Math.abs(o.bendBias))*noise+o.bendBias*Math.cos(bud.heading);
    const scale=bud.role==='leader'?o.leaderBendScale:bud.role==='scaffold'||bud.role==='basal-cane'?o.scaffoldBendScale:bud.role==='terminal'?o.terminalBendScale:.55;
    const bias=bud.role==='scaffold'||bud.role==='basal-cane'?o.scaffoldBias:o.bendBias;
    const radial=bud.kind==='basal-cane'?bud.outward:Math.cos(bud.heading);
    let contextual=((1-Math.abs(bias))*noise+bias*radial)*scale;
    if(bias<0&&(bud.role==='scaffold'||bud.role==='basal-cane')){
        const remaining=Math.max(0,Math.min(bud.heading,Math.PI-bud.heading)-radians(6));
        contextual=Math.sign(contextual)*Math.min(Math.abs(contextual),remaining/Math.max(radians(o.bend),1e-9));
    }
    return {bend:o.bend===0?0:o.bend*mix(uniform,contextual,o.contextStrength),center:o.bendCenter,spread:o.bendSpread,
        recovery:o.bendRecovery,mode:o.bendMode,profile:o.bendProfile,limit:o.bend};
}
