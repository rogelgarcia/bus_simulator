// Validates spaced linden foliage and presents the preserved and revised canopy.
export function validateLinden(row,renders,prior){
    if(row.revision!=='enhanced-linden-spaced-sprays-v5')return 0;
    const spacing=row.crowding,twigs=spacing.branchletSpacing;
    if(spacing.minimumAcceptedProxyClearance<spacing.minimumRequiredProxyClearance||twigs.minimumSampleClearance<twigs.requiredSampleClearance||!twigs.withinSprayCompetition)throw Error('Invalid linden spacing proof');
    if(!row.id.endsWith('mature_01'))return 0;
    for(const state of prior?['previous','enhanced']:['enhanced']){
        const pair=['leaves','shoot'].map(view=>renders.find(r=>r.state===state&&r.view===view));
        if(pair.some(r=>!r)||JSON.stringify(pair[0].camera)!==JSON.stringify(pair[1].camera))throw Error('Missing matched linden branchlet views');
    }
    return prior?1:0;
}

export function lindenContent(summary,s,title){
    const models=summary.models.filter(r=>r.id.startsWith(s+'/')&&r.revision==='enhanced-linden-spaced-sprays-v5');
    if(!models.length)return '';
    const id=s+'/mature_01';
    const renderer=summary.renders.find(r=>r.id===id&&r.state==='enhanced').engine==='BLENDER_EEVEE'?'Eevee':'CPU Cycles';
    const card=(state,view,label)=>`<div class="cell"><div class="caption"><h3>${label}</h3>Actual saved geometry · ${renderer}</div><a href="${id}/${state}_${view}.png"><img class="image" src="${id}/${state}_${view}.png"></a></div>`;
    const rows=models.map(m=>`<tr><td>${m.id.split('/')[1]}</td><td>${m.previousLeafCount?.toLocaleString()??'—'}</td><td>${m.leafCount.toLocaleString()}</td><td>${m.previousLeafCount?(100*(1-m.leafCount/m.previousLeafCount)).toFixed(1)+'%':'—'}</td></tr>`).join('');
    return `<h1>${title} — cleaner foliage</h1><p>Staggered branchlets compete for space. Alternate leaves follow physical twig length and share a spacing check across the canopy. Small bends and rotations retain organic leaf depth. The accepted trunk and structural growth are preserved.</p><table><thead><tr><th>Model</th><th>Previous leaves</th><th>Revised leaves</th><th>Reduction</th></tr></thead><tbody>${rows}</tbody></table><h2>Whole tree — same camera</h2><div class="pair">${card('previous','full','Previous dense foliage')}${card('enhanced','full','Reorganized foliage')}</div><h2>Isolated branchlets</h2><p>Each is extracted from its saved tree; local framing is independent.</p><div class="pair">${card('previous','shoot','Previous branchlet')}${card('enhanced','shoot','Revised branchlet')}</div><h2>Revised branchlet inside and outside the crown</h2><div class="pair">${card('enhanced','leaves','Inside the canopy')}${card('enhanced','shoot','Same branchlet isolated')}</div>`;
}
