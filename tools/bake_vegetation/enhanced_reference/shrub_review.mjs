// Requires the actual root and leaf-pair evidence for the focused shrub revision.
export function validateShrub(row,renders,prior){
    if(row.revision!=='enhanced-arrowwood-spaced-pairs-v2')return 0;
    if(row.rootCollars?.count!==52||row.crowding.minimumAcceptedProxyClearance<row.crowding.minimumRequiredProxyClearance||row.leafCount!==row.crowding.oppositePairs*2)throw Error('Invalid shrub root/leaf-pair proof');
    if(!row.id.endsWith('mature_01'))return 0;
    const states=prior?['previous','enhanced']:['enhanced'];
    for(const state of states){
        for(const view of ['roots','shoot'])if(!renders.some(r=>r.state===state&&r.view===view))throw Error('Missing shrub detail '+state+'/'+view);
        const views=['leaves','shoot'].map(view=>renders.find(r=>r.state===state&&r.view===view));
        if(JSON.stringify(views[0].camera)!==JSON.stringify(views[1].camera))throw Error('Shrub in/out cameras differ');
    }
    return states.length*2;
}

export function shrubContent(summary,s,title){
    const row=summary.models.find(r=>r.id===s+'/mature_01'&&r.revision==='enhanced-arrowwood-spaced-pairs-v2');
    if(!row)return '';
    const renderer=summary.renders.find(r=>r.id===row.id&&r.state==='enhanced').engine==='BLENDER_EEVEE'?'Eevee':'CPU Cycles';
    const panel=(state,view,label)=>`<div class="cell"><div class="caption"><h3>${label}</h3>${renderer} · actual saved geometry</div><a href="${row.id}/${state}_${view}.png"><img class="image" src="${row.id}/${state}_${view}.png"></a></div>`;
    const before=summary.renders.some(r=>r.id===row.id&&r.state==='previous');
    return `<h1>${title} — leaf spacing and root collars</h1><p>Opposite leaves share a node, with wider intervals and gently varied orientations. Nearby blade volumes limit stacking; crowded pairs are omitted. ${row.leafCount.toLocaleString()} leaves in this specimen. Stem bases receive a small continuous flare and smoother bark relief.</p><h2>Stem bases — same camera</h2><div class="pair">${before?panel('previous','roots','Previous roots'):''}${panel('enhanced','roots','Revised roots')}</div><h2>Isolated branchlets</h2><p>Each is an actual branchlet extracted from its model; local framing is chosen independently.</p><div class="pair">${before?panel('previous','shoot','Previous leaf stacking'):''}${panel('enhanced','shoot','Spaced opposite pairs')}</div><h2>Revised branchlet — inside and outside the shrub</h2><div class="pair">${panel('enhanced','leaves','Inside the canopy')}${panel('enhanced','shoot','Same branchlet isolated')}</div>`;
}
