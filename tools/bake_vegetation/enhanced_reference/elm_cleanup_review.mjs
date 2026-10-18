// Checks actual rendered foliage retention and presents the conservative elm cleanup.
export function validateCleanup(row,renders){
    if(row.revision!=='enhanced-elm-clean-foliage-v6')return 0;
    const proof=row.foliageCleanup,policy=proof.policy;
    if(proof.projectedCoverage.some(r=>r.retainedFraction<policy.minimumProjectedRetention)||proof.retainedOccupiedVolumeFraction!==1||proof.withinSprayCrowdingAfter>=proof.withinSprayCrowdingBefore)throw Error('Elm cleanup failed its geometric preservation limits');
    for(const view of ['front','side','rear']){
        const pair=['previous','enhanced'].map(state=>renders.find(r=>r.state===state&&r.view==='coverage_'+view));
        if(pair.some(r=>!r)||JSON.stringify(pair[0].camera)!==JSON.stringify(pair[1].camera))throw Error('Missing matched elm coverage renders');
        const ratio=pair[1].foliageCoverage.fraction/pair[0].foliageCoverage.fraction;
        if(ratio<.94)throw Error('Elm lost too much rendered foliage coverage');
    }
    if(row.id.endsWith('mature_01')){
        for(const state of ['previous','enhanced']){
            const pair=['leaves','shoot'].map(view=>renders.find(r=>r.state===state&&r.view===view));
            if(pair.some(r=>!r)||JSON.stringify(pair[0].camera)!==JSON.stringify(pair[1].camera))throw Error('Missing elm spray comparison');
        }
    }
    return 7;
}

export function cleanupContent(summary,s,title){
    const models=summary.models.filter(m=>m.id.startsWith(s+'/')&&m.revision==='enhanced-elm-clean-foliage-v6');
    if(!models.length)return '';
    const card=(id,state,view,label)=>`<div class="cell"><div class="caption"><h3>${label}</h3>Saved geometry · Eevee · identical lighting</div><a href="${id}/${state}_${view}.png"><img class="image" src="${id}/${state}_${view}.png"></a></div>`;
    const rows=models.map(m=>{
        const ratios=['front','side','rear'].map(view=>{
            const r=state=>summary.renders.find(r=>r.id===m.id&&r.state===state&&r.view==='coverage_'+view).foliageCoverage.fraction;
            return (100*r('enhanced')/r('previous')).toFixed(1)+'%';
        });
        return `<tr><td>${m.id.split('/')[1]}</td><td>${m.foliageCleanup.previousLeafCount.toLocaleString()}</td><td>${m.leafCount.toLocaleString()}</td><td>${(100*m.foliageCleanup.removedLeaves/m.foliageCleanup.previousLeafCount).toFixed(1)}%</td><td>${ratios.join(' / ')}</td></tr>`;
    }).join('');
    const pairs=models.map(m=>`<h2>${m.id.split('/')[1]} — full tree</h2><div class="pair">${card(m.id,'previous','full','Before')}${card(m.id,'enhanced','full','After cleanup')}</div>`).join('');
    const id=models[0].id;
    return `<h1>${title} — selective leaf cleanup</h1><p>Crowded leaves are removed selectively. The trunk, every branchlet, leaf shapes and surviving placements are preserved. Every spray retains its extent and at least 78% of its leaves. Eight directional footprint checks and occupied 0.5 m cells protect the clustered crown; these are geometric proxies, not a measurement of botanical volume.</p><table><thead><tr><th>Model</th><th>Before</th><th>After</th><th>Removed</th><th>Rendered coverage retained<br>front / side / rear</th></tr></thead><tbody>${rows}</tbody></table><p>Coverage is measured from matched foliage-only Eevee alpha masks. The retained crown remains three-dimensional; no viewing camera controls individual leaves.</p>${pairs}<h2>Same outer branchlet</h2><div class="pair">${card(id,'previous','shoot','Before — isolated')}${card(id,'enhanced','shoot','After — isolated')}</div><h2>Within the crown</h2><div class="pair">${card(id,'previous','leaves','Before — in tree')}${card(id,'enhanced','leaves','After — in tree')}</div>`;
}
