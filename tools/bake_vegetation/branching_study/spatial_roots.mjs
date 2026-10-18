// Radial roots use the shared root grammar with independent three-dimensional destinations.
import {radians} from './geometry.mjs';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const rootSpace={
    boundRoot(p,o,base){
        const extent=Math.max(...base.anchors.map(a=>Math.hypot(a.point[0],a.point[2]))),radius=Math.hypot(p[0],p[2]);
        const scale=Math.min(1,(o.rootReach+extent)/Math.max(radius,1e-9));
        return [p[0]*scale,clamp(p[1],-o.rootDepth,-o.rootDepth*.025),p[2]*scale];
    },
    mainRootEnd(anchor,i,o,random,layer,factor){
        const phase=random(o.seed,'roots/radial-phase')()*Math.PI*2;
        const angle=phase+i*Math.PI*2/o.rootCount+(random(o.seed,'roots/radial/'+i)()-.5)*o.rootRandomness;
        const reach=o.rootReach*(.64-.14*layer)*factor;
        return [anchor.point[0]+Math.cos(angle)*reach,-o.rootDepth*(.13+.34*layer)*factor,anchor.point[2]+Math.sin(angle)*reach];
    },
    sideRootEnd(frame,turn,length){
        const d=frame.direction,angle=Math.atan2(d[2],d[0])+radians(turn),slope=clamp(d[1],-.65,-.08);
        return [frame.point[0]+Math.cos(angle)*length*Math.sqrt(1-slope*slope),frame.point[1]+slope*length,frame.point[2]+Math.sin(angle)*length*Math.sqrt(1-slope*slope)];
    },
    rootCurve(start,end,bend,o,base){
        const delta=end.map((v,i)=>v-start[i]),length=Math.hypot(...delta),h=Math.hypot(delta[0],delta[2]);
        const normal=h>1e-9?[-delta[2]/h,0,delta[0]/h]:[1,0,0],bow=length*Math.sin(radians(bend))*.2;
        const control=t=>rootSpace.boundRoot(start.map((v,i)=>v+delta[i]*t+normal[i]*bow),o,base);
        const a=control(1/3),b=control(2/3);
        return Array.from({length:25},(_,i)=>{const t=i/24,u=1-t;return start.map((v,k)=>u*u*u*v+3*u*u*t*a[k]+3*u*t*t*b[k]+t*t*t*end[k]);});
    }
};
