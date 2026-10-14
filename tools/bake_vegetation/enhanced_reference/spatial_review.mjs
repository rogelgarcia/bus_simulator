// Verifies and presents the spatial fork revision with matched old/new angles and real leaf meshes.
export function validateSpatial(renders,primary,revision){
    if(!['enhanced-plane-spatial-growth-v14','enhanced-plane-open-leaves-v15','enhanced-plane-balanced-crown-v16'].includes(revision))return 0;
    const expected=[['previous','compare_side'],['previous','compare_rear'],['enhanced','wood_side'],['enhanced','wood_rear'],
        ...(primary?['previous','enhanced'].flatMap(state=>[[state,'blade'],[state,'blade_edge']]):[['previous','full'],['enhanced','bare']])];
    for(const [state,view] of expected)if(renders.filter(r=>r.state===state&&r.view===view).length!==1)throw Error('Missing spatial review '+state+'/'+view);
    for(const angle of ['side','rear']){
        const a=renders.find(r=>r.state==='previous'&&r.view==='compare_'+angle),b=renders.find(r=>r.state==='enhanced'&&r.view==='pose_'+angle);
        if(JSON.stringify(a.camera)!==JSON.stringify(b.camera))throw Error('Spatial comparison cameras differ');
    }
    if(primary)for(const view of ['blade','blade_edge']){
        const a=renders.find(r=>r.state==='previous'&&r.view===view),b=renders.find(r=>r.state==='enhanced'&&r.view===view);
        for(const key of ['camera','width','samples','lightingRevision'])if(JSON.stringify(a[key])!==JSON.stringify(b[key]))throw Error('Individual leaf comparison differs: '+key);
    }
    return expected.length;
}

export function spatialContent(summary,species){
    const models=summary.models.filter(m=>m.id.startsWith(species+'/')&&['enhanced-plane-spatial-growth-v14','enhanced-plane-open-leaves-v15','enhanced-plane-balanced-crown-v16'].includes(m.revision));
    if(!models.length)return '';
    const card=(id,state,view,title)=>`<div class="cell"><div class="caption"><h3>${title}</h3></div><a href="${id}/${state}_${view}.png"><img class="image" src="${id}/${state}_${view}.png"></a></div>`;
    const crown=models[0].revision==='enhanced-plane-balanced-crown-v16';
    const opened=models[0].revision==='enhanced-plane-open-leaves-v15';
    const comparisons=models.map(model=>`<h2>${model.id.split('/')[1]} — ${opened?'same branches, revised leaves':'branching in depth'}</h2>`+['side','rear'].map(angle=>`<div class="variants">${card(model.id,'previous','compare_'+angle,(crown?'Preserved v15 — ':opened?'Preserved v14 — ':'Preserved v13 — ')+angle)}${card(model.id,'enhanced','pose_'+angle,'Revised — '+angle)}${card(model.id,'enhanced','wood_'+angle,'Same geometry — foliage hidden')}</div>`).join('')).join('');
    const id=models[0].id;
    const blades=['blade','blade_edge'].map(view=>`<h2>Individual leaf — ${view==='blade'?'oblique':'edge'}</h2><div class="pair">${card(id,'previous',view,'Previous blade')}${card(id,'enhanced',view,crown?'Same accepted v15 leaf geometry':opened?'Shallow arch with relaxed, lowered edges':'Cupped blade with bowed midrib and curled lobes')}</div>`).join('');
    const introduction=crown?'The generator measures crown breadth from 36 horizontal directions. Branch families turn into underfilled sectors; modest growth is distributed along structural branches as needed. Leaf-bearing shoots move rigidly, keeping their leaf shapes, sizes and counts. Bole and root paths, pipe radii and the accepted v15 leaves are preserved. No spherical clipping boundary is imposed.':opened?'The leaf margins now bend gently away from the dark upper face, which stays broad and open. Actual saved blade depth is reduced by over 60%; modest arch, twist and lobe variation remain. Wood, branchlets, leaf counts and instance transforms are identical to v14. The same scale, cameras and lighting show the shape change.':'Six scaffold families per tree rise in distinct directions, keeping their connected descendants and attached foliage. The rising limbs produce a more compact crown outline; the canopy section shows the change in projected foliage area. Blade comparisons use the actual saved prototype mesh at the same 30 cm scale, neutral tint, camera and lighting. Leaf counts are unchanged.';
    return `<h1>London plane — ${crown?'balanced crown growth':opened?'open leaf surfaces':'spatial branches and curved leaves'}</h1><p>${introduction}</p>${opened?blades+comparisons:comparisons+blades}`;
}
