// Draws the actual generated polylines; no interpolation or display-time bending.
const colors=['#594b39','#746149','#987441','#b48445','#738469','#527e7e','#4a7186','#6677a2'];
const round=n=>Number(n.toFixed(5));
export function svg(paths,{forks=false,orderColors=false,stage=99,labels=false,roots=null,soil=false,viewBox=null,exposure=null}={}){
    const collars=roots?.collars??(roots?.collar?[roots.collar]:[]);
    const all=[...(roots?.paths??[]),...(roots?.crown?[roots.crown]:[]),...collars,...paths];
    if(!all.length)return '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="No structure within size limits" viewBox="0 0 100 40"><text x="5" y="20" font-size="4" fill="#63786a">No structure within size limits</text></svg>';
    const visible=all.filter(p=>p.level<=stage);
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(const p of all)for(let i=0;i<p.points.length;i++){const [x,y]=p.points[i],r=p.radii[i];minX=Math.min(minX,x-r);maxX=Math.max(maxX,x+r);minY=Math.min(minY,y-r);maxY=Math.max(maxY,y+r);}
    if(viewBox){[minX,minY,maxX,maxY]=viewBox;}
    const scale=Math.max(maxX-minX,maxY-minY,.01),margin=scale*.07;
    let body='';
    if(soil){
        body+=`<rect x="${round(minX-margin)}" y="0" width="${round(maxX-minX+2*margin)}" height="${round(Math.max(0,-minY+margin))}" fill="#e6ddca" fill-opacity=".62"/>`;
        body+=`<path d="M${round(minX-margin)} 0H${round(maxX+margin)}" stroke="#a39b85" stroke-width="${round(scale*.0015)}" stroke-dasharray="${round(scale*.009)} ${round(scale*.006)}"/>`;
    }
    for(const p of visible){
        const left=[],right=[];
        for(let i=0;i<p.points.length;i++){
            const a=p.points[Math.max(0,i-1)],b=p.points[Math.min(p.points.length-1,i+1)],d=Math.hypot(b[0]-a[0],b[1]-a[1]);
            const r=p.radii[i],nx=-(b[1]-a[1])/d,ny=(b[0]-a[0])/d;
            left.push([p.points[i][0]+nx*r,-p.points[i][1]-ny*r]);right.push([p.points[i][0]-nx*r,-p.points[i][1]+ny*r]);
        }
        const root=roots?.paths.includes(p),collar=collars.includes(p)||p===roots?.crown,attribute=collar?'':`data-${root?'root':'branch'}="${p.id}"`;
        const shape=[...left,...right.reverse()].map(a=>a.map(round).join(',')).join(' '),fill=orderColors?colors[p.order%colors.length]:'#4c493f';
        body+=`<polygon points="${shape}" fill="${fill}" ${attribute}><title>${root?'Root':collar?'Collar':'Branch'} ${p.id} · level ${p.level} · ${p.kind} · ${p.span.toFixed(2)} m</title></polygon>`;
        if(p.parent>=0){const q=p.points[0];body+=`<circle cx="${round(q[0])}" cy="${round(-q[1])}" r="${round(p.baseRadius)}" fill="${fill}" ${attribute}/>`;}
        if(forks&&p.parent>=0){const q=p.points[0];body+=`<circle cx="${round(q[0])}" cy="${round(-q[1])}" r="${round(scale*.0036)}" fill="#ce5c2b"/>`;}
    }
    if(exposure!==null){
        body+=`<rect x="${round(minX-margin)}" y="${round(exposure)}" width="${round(maxX-minX+2*margin)}" height="${round(Math.max(0,-minY+margin-exposure))}" fill="#eee9dd"/>`;
        body+=`<path d="M${round(minX-margin)} ${round(exposure)}H${round(maxX+margin)}" stroke="#afa58c" stroke-width="${round(scale*.001)}"/>`;
    }
    if(labels)body+=`<text x="${round(minX)}" y="${round(-minY+margin*.7)}" font-size="${round(scale*.025)}" fill="#6e756d">Each line is a connected branch. Select a branch to inspect it.</text>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Generated 2D ${roots?'branch and root':'branch'} structure" viewBox="${[minX-margin,-maxY-margin,maxX-minX+2*margin,maxY-minY+2*margin].map(round).join(' ')}">${body}</svg>`;
}
