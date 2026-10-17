// Terminal subdivision uses real daughter forks, independently of framework recursion.
import {samplePath,radiusAt,radians} from './geometry.mjs';

/** Two unequal daughter axes replace the endpoint; neither is a forced continuation. */
export function ramificationSites(path,o,random){
    const rng=random(o.seed,path.key+'/ramification'),dominant=rng()<.5?-1:1;
    const asymmetry=o.forkAsymmetry*(.4+.6*rng());
    const sites=[-1,1].map((side,i)=>({t:1,kind:'ramification-fork',slot:i+8,
        turn:side*o.ramificationAngle*(side===dominant?.65:1),allocation:side===dominant?1:1-asymmetry}));
    if(rng()<o.ramificationSideBuds)sites.push({t:.38+.2*rng(),kind:'ramification-lateral',slot:10,
        turn:-dominant*o.ramificationAngle*1.5,allocation:.7});
    return sites;
}

/** Preserve useful fork divergence at every tier instead of collapsing angles by order. */
export function ramificationDimensions(path,site,o,random,space=null){
    const rng=random(o.seed,path.key+'.'+site.slot+'/dimensions'),frame=(space?.samplePath??samplePath)(path,site.t);
    const span=path.span*o.ramificationRatio*site.allocation*(1+(rng()-.5)*o.lengthVariation);
    const turn=site.turn+(rng()-.5)*o.angleVariation,departure=frame.heading+radians(turn);
    const outward=Math.atan2(frame.point[1]-o.trunkLength,frame.point[0]-path.origin[0]);
    const correction=Math.atan2(Math.sin(outward-departure),Math.cos(outward-departure));
    const heading=departure+correction*o.ramificationOutward;
    const tier=path.level-o.depth+1,role=tier===1?'scaffold':tier===2?'lateral':'terminal';
    return {survive:1,frame,heading,span,baseRadius:radiusAt(path,site.t)*(1-o.radiusLoss)*Math.sqrt(site.allocation),
        role,order:path.order+1,crownT:path.crownT??0,lengthScale:o.ramificationRatio,
        ...(space?{spatial:space.childFrame(path,site,frame,turn,o,random)}:{})};
}
