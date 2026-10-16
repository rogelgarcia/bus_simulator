// Validates and presents orthogonal crown views from the authenticated saved models.
const volumeView=view=>view.startsWith('volume_')||view==='wood_volume_above';
const volumeRevision=revision=>['enhanced-oak-volumetric-forks-v5','enhanced-oak-spaced-shoots-v6','enhanced-oak-ascending-fill-v7','enhanced-oak-fork-shoulders-v8','enhanced-elm-arching-growth-v2','enhanced-elm-spreading-v3','enhanced-elm-rounded-v4','enhanced-elm-clustered-v5'].includes(revision);

export function validateVolume(renders,primary,revision){
    const rows=renders.filter(r=>volumeView(r.view));
    if(!volumeRevision(revision)){
        if(rows.length)throw Error('Unexpected volume views');
        return 0;
    }
    const views=['volume_side','volume_rear','volume_above',...(primary?['wood_volume_above']:[])];
    const states=primary?['enhanced','previous']:['enhanced'];
    if(rows.length!==views.length*states.length||states.some(state=>views.some(view=>rows.filter(r=>r.state===state&&r.view===view).length!==1)))throw Error('Incomplete crown volume review');
    if(primary)for(const view of views){
        const a=rows.find(r=>r.state==='enhanced'&&r.view===view),b=rows.find(r=>r.state==='previous'&&r.view===view);
        if(JSON.stringify(a.camera)!==JSON.stringify(b.camera))throw Error('Crown comparison cameras differ');
    }
    return rows.length;
}

const card=(id,state,view,label)=>`<div class="cell"><div class="caption"><h3>${label}</h3>Actual saved model · fixed studio lighting</div><a href="${id}/${state}_${view}.png"><img class="image" src="${id}/${state}_${view}.png"></a></div>`;

export function volumeContent(summary,species,title){
    const models=summary.models.filter(r=>r.id.startsWith(species+'/'));
    if(!models.some(r=>volumeRevision(r.revision)))return '';
    const forms=models.map(m=>`<h2>${m.id.split('/')[1]}</h2><div class="grid">${[['full','Front'],['volume_side','Side — 90°'],['volume_rear','Rear — 180°'],['volume_above','From above']].map(([v,label])=>card(m.id,'enhanced',v,label)).join('')}</div>`).join('');
    const id=species+'/mature_01';
    const spacing=models.filter(m=>m.crowding?.branchletSpacing).map(m=>{const p=m.crowding.branchletSpacing;return `<li>${m.id.split('/')[1]}: ${p.acceptedSprays} separated sprays, ${p.fineShootPaths.toLocaleString()} fine shoot segments, ${m.leafCount.toLocaleString()} leaves.</li>`;}).join('');
    const comparisons=[['volume_side','Side comparison'],['volume_above','Crown depth'],['wood_volume_above','Branch structure from above — foliage hidden']].map(([v,label])=>`<h2>${label}</h2><div class="pair">${card(id,'previous',v,'Previous enhanced reference')}${card(id,'enhanced',v,'Revised branching')}</div>`).join('');
    const growth=models.some(m=>m.revision==='enhanced-elm-clustered-v5')?'Five arching axes carry 15 overlapping foliage regions with recessed gaps between side masses. Fine sprays use distinct attachment nodes and clearance against their own laterals as well as neighbouring sprays.':models.some(m=>['enhanced-elm-arching-growth-v2','enhanced-elm-spreading-v3','enhanced-elm-rounded-v4','enhanced-elm-clustered-v5'].includes(m.revision))?'Five staggered axes rise and arch outward. Rotated lateral buds fill crown depth; terminal sprays compete for space, and alternate curved leaves retain small gaps and local orientation.':models.some(m=>m.revision==='enhanced-oak-fork-shoulders-v8')?'Raised shoulders follow each fork into its supporting limb. Bark follows the branch axes and blends locally at the union. The upward growth and spaced foliage from the previous version are retained.':models.some(m=>m.revision==='enhanced-oak-ascending-fill-v7')?'Wood follows an upward growth bias while retaining its azimuth. Short lateral sprays grow at separate nodes only where clearance permits; neighbouring sprays still compete for space.':'One fine spray per terminal support. Neighbouring sprays compete for space; leaf nodes fill the existing shoots without adding stacked fans.';
    return `<h1>${title} — branching in three dimensions</h1><p>Intermediate branches emerge around each parent axis. Camera settings match between the preserved and revised specimens; no camera controls the generated tree.</p>${spacing?`<p>${growth}</p><ul>${spacing}</ul>`:''}${forms}${comparisons}`;
}
