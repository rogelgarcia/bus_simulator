// Reviews three specimen angles and the same saved branchlet with and without its surrounding tree.
export function validatePresentation(renders,primary){
    const rows=renders.filter(r=>r.view.startsWith('pose_'));
    if(!rows.length)return 0;
    const expected=['pose_side','pose_rear',...(primary?['pose_branch_in','pose_branch_out']:[])];
    if(rows.length!==expected.length||expected.some(view=>rows.filter(r=>r.state==='enhanced'&&r.view===view).length!==1))throw Error('Incomplete specimen presentation');
    if(primary){
        const a=rows.find(r=>r.view==='pose_branch_in'),b=rows.find(r=>r.view==='pose_branch_out');
        for(const field of ['sourceSha256','width','samples','lightingRevision'])if(a[field]!==b[field])throw Error('Branchlet presentation settings differ');
        if(JSON.stringify(a.camera)!==JSON.stringify(b.camera))throw Error('Branchlet presentation cameras differ');
    }
    return rows.length;
}

const card=(id,view,title,note)=>`<div class="cell"><div class="caption"><h3>${title}</h3><div class="muted">${note}</div></div><a href="${id}/enhanced_${view}.png"><img class="image" src="${id}/enhanced_${view}.png"></a></div>`;

export function presentationContent(summary,species,title){
    const models=summary.models.filter(r=>r.id.startsWith(species+'/'));
    if(!summary.renders.some(r=>r.id.startsWith(species+'/')&&r.view.startsWith('pose_')))return '';
    for(const model of models)if(!validatePresentation(summary.renders.filter(r=>r.id===model.id),model.id.endsWith('mature_01')))throw Error('Every mature form needs presentation poses');
    const forms=models.map(model=>`<h2>${model.id.split('/')[1]} — full tree</h2><div class="variants">${[['full','Front'],['pose_side','Side'],['pose_rear','Rear three-quarter']].map(([view,label])=>card(model.id,view,label,'Same saved model · fixed studio lighting')).join('')}</div>`).join('');
    const id=species+'/mature_01';
    const pairs=[['Front','leaves','shoot'],['Oblique','pose_branch_in','pose_branch_out']].map(([label,inside,outside])=>`<h2>${label} branchlet close-up</h2><div class="pair">${card(id,inside,'Within the canopy','Surrounding tree visible')}${card(id,outside,'Isolated branchlet','Same branchlet, camera, scale and lighting')}</div>`).join('');
    return `<h1>${title} — viewing angles</h1><p>Three views of each mature form, followed by matched branchlet close-ups in the canopy and isolated from it. Click any image for full resolution.</p>${forms}${pairs}`;
}
