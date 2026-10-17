// Actual curved centerlines and local attachment frames, shared by build and audit.
export const radians=value=>value*Math.PI/180;
export function branchCurve(start,heading,span,bend,profile,mode='gradual',center=.5,spread=.8,recovery=0,joinHeading=heading,joinFraction=0){
    // Bounded growth bend plus optional distal counter-curvature, not a mechanics solver.
    const lo=Math.max(0,center-spread/2),hi=Math.min(1,center+spread/2),peak=lo+(hi-lo)*(1-.35*recovery);
    const ease=t=>{const u=Math.max(0,Math.min(1,t));return u*u*(3-2*u);};
    const points=[start],steps=mode==='gradual'?20:Math.max(40,Math.ceil(8/(peak-lo)));
    for(let i=0;i<steps;i++){
        const t=(i+.5)/steps;
        const turn=mode==='gradual'?Math.pow(t,profile):ease((t-lo)/(peak-lo))-(recovery?recovery*ease((t-peak)/(1-peak)):0);
        const join=joinFraction?(joinHeading-heading)*(1-ease(i/(steps-1)/joinFraction)):0;
        const angle=heading+radians(bend)*turn+join,p=points.at(-1);
        points.push([p[0]+Math.cos(angle)*span/steps,p[1]+Math.sin(angle)*span/steps]);
    }
    return points;
}
export function samplePath(path,t){
    const scaled=t*(path.points.length-1),i=Math.min(path.points.length-2,Math.floor(scaled)),f=scaled-i;
    const a=path.points[i],b=path.points[i+1];
    return {point:[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f],heading:Math.atan2(b[1]-a[1],b[0]-a[0])};
}
export function radiusAt(p,t){
    if(p.supportRadii){const v=t*(p.supportRadii.length-1),i=Math.min(p.supportRadii.length-2,Math.floor(v));return p.supportRadii[i]+(p.supportRadii[i+1]-p.supportRadii[i])*(v-i);}
    const tip=p.profileTipRadius??p.tipRadius,radius=tip+(p.baseRadius-tip)*Math.pow(1-t,p.taperProfile);
    if(p.terminalStart===undefined)return radius;
    const end=Math.max(0,Math.min(1,(t-p.terminalStart)/(1-p.terminalStart)));
    return radius*(1-(1-p.tipRadius/tip)*end*end*(3-2*end));
}
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
export function intersects(a,b,c,d){
    const ab=sub(b,a),cd=sub(d,c),den=cross(ab,cd);
    if(Math.abs(den)<1e-10)return false;
    const u=cross(sub(c,a),cd)/den,v=cross(sub(c,a),ab)/den;
    return u>1e-6&&u<1-1e-6&&v>1e-6&&v<1-1e-6;
}
// Spatial hashing keeps high child-count configurations usable in the browser.
export function crossingIndex(){
    const cells=new Map(),segments=[];
    function keys(a,b){
        const result=[];
        for(let x=Math.floor(Math.min(a[0],b[0]));x<=Math.floor(Math.max(a[0],b[0]));x++)
            for(let y=Math.floor(Math.min(a[1],b[1]));y<=Math.floor(Math.max(a[1],b[1]));y++)result.push(`${x},${y}`);
        return result;
    }
    return {
        overlaps(points){
            for(let i=1;i<points.length;i++){
                const a=points[i-1],b=points[i],seen=new Set();
                for(const key of keys(a,b))for(const id of cells.get(key)??[]){
                    if(seen.has(id))continue;seen.add(id);
                    const [c,d]=segments[id];if(intersects(a,b,c,d))return true;
                }
            }
            return false;
        },
        add(points){
            for(let i=1;i<points.length;i++){
                const a=points[i-1],b=points[i],id=segments.length;segments.push([a,b]);
                for(const key of keys(a,b)){if(!cells.has(key))cells.set(key,[]);cells.get(key).push(id);}
            }
        }
    };
}
