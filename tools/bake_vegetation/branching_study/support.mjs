// Ports V2's downstream-reach support sizing to planar axes with continuous attachment coordinates.
import {radiusAt} from './geometry.mjs';
export function sizeSupport(paths,limit,continuousStems=false){
    if(!limit)return {enabled:false,maximum:0};
    let maximum=0;
    for(const p of [...paths].reverse()){
        const count=p.points.length,reach=Array(count).fill(0),required=Array(count).fill(0),pipeArea=Array(count).fill(0);
        const tipChildren=p.children.map(id=>paths[id]).filter(child=>child.parentT===1);
        if(tipChildren.length>1)required[count-1]=Math.sqrt(tipChildren.reduce((sum,child)=>sum+child.baseRadius**2,0));
        for(const id of p.children){
            const child=paths[id],t=child.parentT,index=Math.floor(t*(count-1));
            for(let i=0;i<=Math.ceil(t*(count-1));i++)pipeArea[i]+=child.baseRadius**2;
            for(let i=0;i<=index;i++)reach[i]=Math.max(reach[i],p.span*(t-i/(count-1))+child.supportReach[0]);
            required[index]=Math.max(required[index],child.baseRadius);
            if(index<count-1)required[index+1]=Math.max(required[index+1],child.baseRadius);
        }
        let radii=[];
        for(let i=count-1;i>=0;i--){
            const t=i/(count-1);reach[i]=Math.max(reach[i],p.span*(1-t));
            const supportingRadius=Math.sqrt(pipeArea[i]+(tipChildren.length?0:p.tipRadius**2));
            radii[i]=Math.max(radiusAt(p,t),reach[i]/limit,required[i],supportingRadius,i<count-1?radii[i+1]:0);
        }
        if(continuousStems&&p.order===0){p.supportMinimumRadii=radii;radii=smoothStemSupport(radii);}
        maximum=Math.max(maximum,...reach.map((r,i)=>r/radii[i]));
        p.supportReach=reach;p.supportRadii=radii;p.baseRadius=radii[0];p.tipRadius=radii.at(-1);
    }
    return {enabled:true,rule:'downstream arc reach and distributed daughter cross-sections',limit,maximum};
}

function smoothStemSupport(required){
    const steps=required.length-1,base=required[0];
    return required.map((_,i)=>{
        const t=i/steps;let radius=base*(1+.08*(1-t));
        for(let j=1;j<=steps;j++){
            const start=(j-1)/steps,u=Math.max(0,Math.min(1,(t-start)/Math.min(.3,1-start)));
            radius-=(required[j-1]-required[j])*u*u*u*(10+u*(-15+6*u));
        }
        return radius;
    });
}
