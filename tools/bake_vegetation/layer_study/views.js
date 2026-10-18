// Draws calibrated projected shell bands and maps pointer motion back into model coordinates.
import {COLORS,project,projectedRadii,moveInView} from './model.js';

export function createViews(container,model,{getConfig,getDisplay,onMove,onStart,onEnd}){
    container.innerHTML=model.views.map(view=>`<figure class="view"><figcaption><b>${view.id[0].toUpperCase()+view.id.slice(1)}</b><span>${view.id==='front'?'+X →':view.id==='back'?'← +X':view.id==='right'?'+Y →':'← +Y'} · Z ↑</span></figcaption><div class="viewport"><img alt="${model.name}, ${view.id} orthographic view" src="${view.file}"><canvas aria-label="Drag canopy center in ${view.id} view" tabindex="0"></canvas></div></figure>`).join('');
    const canvases=[...container.querySelectorAll('canvas')],listeners=[];
    const redraw=()=>canvases.forEach((canvas,index)=>{
        const size=canvas.clientWidth,ratio=devicePixelRatio||1;canvas.width=Math.round(size*ratio);canvas.height=Math.round(size*ratio);
        const ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);const config=getConfig(),display=getDisplay(),view=model.views[index];
        const center=project(config.center,view).map(v=>v*size),radii=config.layers.map(layer=>projectedRadii(layer.radii,view).map(v=>v*size));
        if(!display.visible)return;
        for(let layer=2;layer>=0;layer--){
            if(display.solo&&layer!==display.layer)continue;
            ctx.beginPath();ctx.ellipse(...center,...radii[layer],0,0,Math.PI*2);
            if(layer)ctx.ellipse(...center,...radii[layer-1],0,0,Math.PI*2,true);
            ctx.fillStyle=COLORS[layer];ctx.globalAlpha=display.opacity;ctx.fill('evenodd');ctx.globalAlpha=1;
            ctx.beginPath();ctx.ellipse(...center,...radii[layer],0,0,Math.PI*2);ctx.strokeStyle=COLORS[layer];ctx.lineWidth=layer===display.layer?2.6:1.25;ctx.stroke();
        }
        ctx.strokeStyle='#112d28';ctx.fillStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(...center,8,0,Math.PI*2);ctx.fill();ctx.stroke();
        ctx.beginPath();ctx.moveTo(center[0]-15,center[1]);ctx.lineTo(center[0]+15,center[1]);ctx.moveTo(center[0],center[1]-15);ctx.lineTo(center[0],center[1]+15);ctx.stroke();
        ctx.fillStyle='#132d26';ctx.font='11px system-ui';ctx.fillText('CENTER',center[0]+17,center[1]-10);
    });
    canvases.forEach((canvas,index)=>{
        let drag=null;const view=model.views[index];
        const uv=event=>{const rect=canvas.getBoundingClientRect();return [(event.clientX-rect.left)/rect.width,(event.clientY-rect.top)/rect.height];};
        const down=event=>{
            if(!getDisplay().visible)return;
            const point=uv(event),center=project(getConfig().center,view);
            if(Math.hypot(point[0]-center[0],point[1]-center[1])*canvas.clientWidth>26)return;
            onStart();drag={point,center:[...getConfig().center]};canvas.setPointerCapture(event.pointerId);canvas.classList.add('dragging');event.preventDefault();
        };
        const move=event=>{if(!drag)return;const point=uv(event);onMove(moveInView(drag.center,point.map((v,i)=>v-drag.point[i]),view));};
        const up=()=>{if(drag){drag=null;canvas.classList.remove('dragging');onEnd();}};
        const key=event=>{
            const offsets={ArrowLeft:[-.002,0],ArrowRight:[.002,0],ArrowUp:[0,-.002],ArrowDown:[0,.002]};
            if(!offsets[event.key])return;event.preventDefault();onStart();onMove(moveInView(getConfig().center,offsets[event.key].map(v=>v*(event.shiftKey?5:1)),view));onEnd();
        };
        for(const [name,handler] of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',up],['keydown',key]]){canvas.addEventListener(name,handler);listeners.push(()=>canvas.removeEventListener(name,handler));}
    });
    const observer=new ResizeObserver(redraw);observer.observe(container);redraw();
    return {redraw,destroy(){observer.disconnect();listeners.forEach(fn=>fn());}};
}
