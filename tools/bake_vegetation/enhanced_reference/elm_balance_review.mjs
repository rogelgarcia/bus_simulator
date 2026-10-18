// Presents matched canopy details at their original render resolution and checks improved foliage coverage.
const revision='enhanced-elm-balanced-foliage-v7';
const spacedRevisions=['enhanced-elm-spaced-fans-v8','enhanced-elm-branch-domes-v9','enhanced-elm-filled-fans-v10'];
const regions=[['left','Left shoulder'],['upper','Upper crown'],['right','Right shoulder'],['fringe','Outer fringe']];

export function validateBalance(row,renders){
    if(![revision,...spacedRevisions].includes(row.revision))return 0;
    const proof=row.foliageBalance;
    const spaced=spacedRevisions.includes(row.revision);
    const filled=row.revision==='enhanced-elm-filled-fans-v10';
    if(filled){
        if(row.canopyVisibility?.views.length!==3)throw Error('Missing depth-tested crown visibility');
        for(const view of row.canopyVisibility.views){
            if(view.visibleFoliageRetention<.98||view.worstRegionChangePoints< -5)throw Error('Local crown fullness regressed: '+view.view);
            const pair=['previous','enhanced'].map(state=>renders.find(r=>r.state===state&&r.view==='visibility_'+view.view));
            if(pair.some(r=>!r)||JSON.stringify(pair[0].camera)!==JSON.stringify(pair[1].camera))throw Error('Missing matched depth-tested masks');
        }
    }
    if(!spaced&&proof.before&&proof.after.clusterBodyLeaves<=proof.before.clusterBodyLeaves)throw Error('Elm cluster bodies were not filled');
    if(spaced&&row.crowding.minimumAcceptedSprayClearance<row.crowding.minimumRequiredSprayClearance)throw Error('Leaves still stack within their spray');
    for(const view of ['front','side','rear']){
        const pair=['previous','enhanced'].map(state=>renders.find(r=>r.state===state&&r.view==='coverage_'+view));
        if(pair.some(r=>!r)||JSON.stringify(pair[0].camera)!==JSON.stringify(pair[1].camera))throw Error('Missing matched canopy coverage');
        if(pair[1].foliageCoverage.fraction<pair[0].foliageCoverage.fraction*(spaced?.92:1.02))throw Error('Foliage coverage requirement failed');
    }
    if(!row.id.endsWith('mature_01'))return 7+(filled?6:0);
    for(const [region] of regions){
        const pair=['previous','enhanced'].map(state=>renders.find(r=>r.state===state&&r.view==='region_'+region));
        if(pair.some(r=>!r||r.width<2048)||JSON.stringify(pair[0].camera)!==JSON.stringify(pair[1].camera))throw Error('Missing matched high-resolution elm close-ups');
    }
    return 15+(filled?6:0);
}

export function balanceContent(summary,s,title){
    const models=summary.models.filter(m=>m.id.startsWith(s+'/')&&[revision,...spacedRevisions].includes(m.revision));
    if(!models.length)return '';
    const id=models[0].id,spaced=spacedRevisions.includes(models[0].revision);
    const filled=models[0].revision==='enhanced-elm-filled-fans-v10';
    const before=filled?'Fuller v7 baseline':'Before';
    const card=(model,state,view,label)=>`<div class="cell"><div class="caption"><h3>${label}</h3>Eevee · click to open full-resolution image</div><a href="${model}/${state}_${view}.png" target="_blank"><img class="image" src="${model}/${state}_${view}.png" alt="${label}"></a></div>`;
    const rows=models.map(m=>{
        const ratios=['front','side','rear'].map(view=>{
            const area=state=>summary.renders.find(r=>r.id===m.id&&r.state===state&&r.view==='coverage_'+view).foliageCoverage.fraction;
            const gain=100*(area('enhanced')/area('previous')-1);return (gain>=0?'+':'')+gain.toFixed(1)+'%';
        });
        return `<tr><td>${m.id.split('/')[1]}</td><td>${m.previousLeafCount?.toLocaleString()??'—'}</td><td>${m.leafCount.toLocaleString()}</td><td>${ratios.join(' / ')}</td></tr>`;
    }).join('');
    const comparisons=models.map(m=>`<h2>${m.id.split('/')[1]}</h2><div class="pair">${card(m.id,'previous','full',before)}${card(m.id,'enhanced','full','Rebalanced canopy')}</div>`).join('');
    const detail=regions.map(([region,label])=>`<section id="elm_region_${region}"><h2>${label}</h2><div class="pair">${card(id,'previous','region_'+region,'Before — '+label)}${card(id,'enhanced','region_'+region,'After — '+label)}</div></section>`).join('');
    const dome=models[0].revision==='enhanced-elm-branch-domes-v9'||filled;
    const heading=dome?'Branch-local domes and open leaf spacing':spaced?'Open leaf spacing across each branchlet fan':'Fuller branch-supported clusters';
    const description=(filled?'All before images and measurements use the fuller v7 baseline, rather than the rejected v9 study. ':'')+(dome?'Each branch-owned cluster guides coherent leaf fans around its sides and top. Side-facing fans receive priority, while curved leaves retain bounded natural variation. Local projected spacing reduces stacked blades; separate fans may naturally overlap.':spaced?'Leaves on the same fan compete for space in its shared plane as well as in 3D. Slight depth offsets cannot hide stacked blades. Some natural overlap between separate fans remains.':'More leaf sites are offered inside each cluster body; sparse distant tips receive fewer. Sprays face outward and upward with bounded natural variation.');
    const shoot=spaced?`<section id="elm_spray_spacing"><h2>Branchlet spacing — matched camera</h2><div class="pair">${card(id,'previous','shoot','Before')}${card(id,'enhanced','shoot','Revised fan and leaves')}</div></section>`:'';
    const visibility=filled?`<h2>Canopy fullness with wood occlusion</h2><p>The earlier total foliage-only pixel count did not measure exposed wood or local gaps. These measurements keep the wood visible and use the same reference crown envelope for both versions. Green = visible leaves; red = exposed wood; transparent = gaps. Natural gaps between clusters remain part of this envelope.</p><table><tr><th>Model / view</th><th>Visible leaves: before → after</th><th>Exposed wood: before → after</th><th>Gaps: before → after</th><th>Worst local change</th></tr>${models.flatMap(m=>m.canopyVisibility.views.map(v=>`<tr><td>${m.id.split('/')[1]} / ${v.view}</td>${['foliage','wood','gaps'].map(k=>`<td>${(100*v.previous[k]).toFixed(1)}% → ${(100*v.enhanced[k]).toFixed(1)}%</td>`).join('')}<td>${v.worstRegionChangePoints.toFixed(1)} pp</td></tr>`)).join('')}</table><div class="pair">${card(id,'previous','visibility_side','Before — visible surfaces')}${card(id,'enhanced','visibility_side','After — visible surfaces')}</div>`:'';
    return `<h1>${title} — ${heading}</h1><p>${description} Every leaf remains attached to its twig. ${filled?'Twig fans turn with their leaves; redundant thin shoots are pruned before filling usable gaps. The accepted trunk and leaf shapes are preserved.':'The accepted wood and leaf shapes are preserved.'}</p><p>Close-ups: <a href="#elm_spray_spacing">Branchlet</a> · ${regions.map(([r,label])=>`<a href="#elm_region_${r}">${label}</a>`).join(' · ')}. Click any image to open the original PNG and zoom.</p>${shoot}${visibility}<table><thead><tr><th>Model</th><th>Previous leaves</th><th>Rebalanced leaves</th><th>Total foliage-only pixel area change<br>front / side / rear (not crown fullness)</th></tr></thead><tbody>${rows}</tbody></table>${comparisons}${detail}<h2>Branchlet inside and outside the tree</h2><div class="pair">${card(id,'enhanced','leaves','Inside the crown')}${card(id,'enhanced','shoot','Same branchlet isolated')}</div>`;
}
