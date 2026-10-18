// Builds the study controls from the same schema used to validate exported graphs.
import {defaults,presets,controls,groups,countProfiles} from './parameters.mjs';
import {generate,descendants} from './model.mjs';
import {branchCurve} from './geometry.mjs';
import {svg} from './draw.mjs';
import {species} from './species.mjs';
import {installStudyHelp} from './help.mjs';
const $=id=>document.getElementById(id);
const response=await fetch('./study-data.json');if(!response.ok)throw Error('Missing baked study data');
const review=await response.json();
let model,selected=1,selectedDomain='branch',timer=null,activeSpecies='american_elm',startingPreset='american_elm';
$('preset').innerHTML='<optgroup label="Species starting points">'+Object.entries(species).map(([id,p])=>`<option value="${id}">${p.name}</option>`).join('')+'</optgroup><optgroup label="Generic experiments"><option value="organic">Previous elm study</option><option value="forked">Two to four tip forks</option><option value="straight">Straight / no randomness</option></optgroup><option value="custom" disabled>Custom settings</option>';
$('speciesCards').innerHTML=Object.entries(species).map(([id,p])=>`<article><button data-preset="${id}"><img src="presets/${id}.svg" alt="${p.name} numeric preset drawing"><strong>${p.name}</strong><span>${p.habit}</span></button></article>`).join('');
const sourceLinks=p=>p.sources.map(s=>`<a href="${s.url}" target="_blank" rel="noreferrer">${s.label}</a>`).join(' · ');
$('speciesRows').innerHTML=Object.entries(species).map(([id,p])=>`<tr><td>${p.name}<br><small><i>${p.botanical}</i></small></td><td>${p.structure}<br>${p.size}<br>${p.surface}<br>${sourceLinks(p)}</td><td>${p.mapping}<br><b>Starting values:</b> ${presets[id].minChildren}–${presets[id].maxChildren} children; ${presets[id].forkAngle}° side angle; ${presets[id].bend}° max bend.<br><b>Limitation:</b> ${p.limitation}</td></tr>`).join('');
const shapeControl=`<label>Bending model<select id="bendMode"><option value="localized">Curved zone + tip recovery</option><option value="gradual">Continuous turn · previous behavior</option></select></label><div id="shapePreview"></div><p class="control-note">Example at maximum strength. Each branch gets a seeded strength and direction. Geometric controls inspired by bending and straightening, not a physics solver.</p>`;
$('parameterGroups').innerHTML=groups.map(group=>`<details ${['Ramification levels','Root system'].includes(group.title)?'open':''}><summary>${group.title}</summary>${group.title==='Branch shape'?shapeControl:group.title==='Trunk shape'?'<div id="trunkPreview"></div>':group.title==='Root system'?'<label class="check"><input id="rootsEnabled" type="checkbox"> Generate roots</label>':''}${group.controls.map(p=>`<label>${p.label}<output id="${p.key}Value"></output><input id="${p.key}" type="range" min="${p.min}" max="${p.max}" step="${p.step}">${p.hint?`<small>${p.hint}</small>`:''}</label>`).join('')}</details>`).join('');
$('countProfile').innerHTML=Object.entries(countProfiles).map(([key,p])=>`<option value="${key}">${p.label} · ${p.min}–${p.max}</option>`).join('')+'<option value="custom" disabled>Custom range</option>';
$('levelCounts').innerHTML=Array.from({length:8},(_,i)=>`<label>Level ${i+1}${i===0?' · trunk':''}<select id="count${i}" aria-label="Children at level ${i+1}">${[1,2,3,4].map(n=>`<option value="${n}">${n}</option>`).join('')}</select></label>`).join('');
function options(){return {species:activeSpecies,seed:Number($('seed').value),...Object.fromEntries(controls.map(p=>[p.key,Number($(p.key).value)])),
    architecture:$('architecture').value,arrangement:$('arrangement').value,bendMode:$('bendMode').value,countMode:$('countMode').value,
    minChildren:Number($('minChildren').value),maxChildren:Number($('maxChildren').value),branchCounts:Array.from({length:8},(_,i)=>Number($('count'+i).value)),competition:$('competition').checked,rootsEnabled:$('rootsEnabled').checked};}
function drawShapePreview(){
    const o=model.settings,points=branchCurve([0,0],0,1,o.bend,o.bendProfile,o.bendMode,o.bendCenter,o.bendSpread,o.bendRecovery);
    $('shapePreview').innerHTML=`<figure><svg viewBox="-.1 -1.05 1.2 1.2" role="img" aria-label="Branch bend preview at ${o.bend} degrees"><path d="M0 0 H1" stroke="#a6ada0" stroke-dasharray=".025 .025" stroke-width=".008"/><polyline points="${points.map(([x,y])=>`${x},${-y}`).join(' ')}" fill="none" stroke="#594b39" stroke-width=".025" stroke-linecap="round"/><circle cx="0" cy="0" r=".025" fill="#ce5c2b"/></svg><figcaption>${o.bend}° maximum bend · ${o.bendMode==='localized'?Math.round(o.bendRecovery*100):0}% recovery</figcaption></figure>`;
}
function formatted(p,value){
    if(p.unit==='percent')return `${Math.round(value*100)}%`;
    if(p.unit==='bias')return value===0?'Mixed':`${Math.round(Math.abs(value)*100)}% ${value<0?'down':'up'}`;
    if(p.unit==='lean')return value===0?'Upright':`${Math.abs(value)}° ${value<0?'left':'right'}`;
    if(p.unit==='tilt')return value===0?'Neutral':`${Math.abs(value)}° ${value<0?'down':'up'}`;
    if(p.unit==='trunkTurn')return value===0?'Straight':`${Math.abs(value)}° ${value<0?'left':'right'}`;
    return value+({deg:'°',m:' m',mm:' mm',profile:'',count:''}[p.unit]);
}
function drawTrunkPreview(){
    const trunk=model.paths[0];
    if(!trunk){$('trunkPreview').textContent='No trunk within size limits';return;}
    const points=trunk.points.map(([x,y])=>`${x/trunk.span},${-y/trunk.span}`).join(' ');
    $('trunkPreview').innerHTML=`<figure><svg viewBox="-1.05 -1.1 2.1 1.2" role="img" aria-label="Actual trunk curve"><path d="M0 0 V-1" stroke="#a6ada0" stroke-dasharray=".025 .025" stroke-width=".008"/><polyline points="${points}" fill="none" stroke="#594b39" stroke-width=".035" stroke-linecap="round"/><circle cx="0" cy="0" r=".025" fill="#ce5c2b"/></svg><figcaption>${Math.abs(trunk.bend).toFixed(1)}° bend · ${Math.round(model.settings.trunkBendRecovery*100)}% recovery</figcaption></figure>`;
}
function draw(){
    const stage=Number($('stage').value),display={stage,forks:$('forks').checked,orderColors:$('colors').checked};
    const roots=$('showRoots').checked?model.roots:null;
    const surface=$('rootView').value==='surface';
    $('tree').innerHTML=svg(model.paths,{...display,roots,soil:!surface&&Boolean(roots?.paths.length),exposure:surface&&roots?Number($('exposureDepth').value)*model.settings.baseDiameter:null});$('stageValue').value=stage<=model.settings.depth?`Framework ${stage} / ${model.settings.depth}`:`Fork tier ${stage-model.settings.depth} / ${model.settings.ramificationLevels}`;
    const source=selectedDomain==='root'?model.roots:model,subset=descendants(source,selected);
    $('detail').innerHTML=selectedDomain==='root'?svg([],{...display,stage:99,forks:true,roots:{paths:subset},soil:true}):svg(subset.length?subset:model.paths,{...display,stage:99,forks:true});
    $('detailTitle').textContent=selectedDomain==='root'?'Inspect one root':'Inspect one branch';
    const axis=source.paths[selected];
    $('axisInfo').textContent=axis?`${axis.role??axis.kind} · level ${axis.level} · ${axis.phase??'root'} ${axis.ramificationLevel??''} · order ${axis.order} · ${axis.span.toFixed(2)} m · base ${(axis.baseRadius*2000).toFixed(1)} mm`:'';
    $('rootDetail').innerHTML=svg([],{roots:model.roots,soil:true,orderColors:display.orderColors,forks:display.forks});
    $('rootCountLabel').textContent=`${model.roots.paths.length} root axes`;
    $('count').textContent=`${model.paths.filter(p=>p.level<=stage).length} branches${roots?' · '+roots.paths.filter(p=>p.level<=stage).length+' roots':''}`;
}
function showSpecies(){
    const p=species[activeSpecies],ref=review.images[activeSpecies];
    $('speciesFacts').innerHTML=p?`<h3>${p.name} <i>${p.botanical}</i></h3><p>${p.habit}. ${p.structure}</p><p><b>Preset interpretation:</b> ${p.mapping}</p><p>${sourceLinks(p)}</p>`:'<h3>Generic branching experiment</h3><p>No species match is claimed for this starting point.</p>';
    $('referenceTitle').textContent=p?p.name+' · supplied study':'Reference';
    const file=ref?.file??(activeSpecies==='american_elm'?review.reference:null);
    $('referenceImageLink').hidden=$('referenceFull').hidden=!file;
    if(file){$('referenceImage').src=file;$('referenceImage').alt=ref?.caption??'User supplied elm bare branching reference';$('referenceImageLink').href=$('referenceFull').href=file;}
    $('referenceCaption').textContent=ref?ref.caption+'. Visual guide; botanical traits are sourced separately.':file?'Original user-supplied bare elm branching reference.':'No species image for generic experiments.';
    $('completeReference').hidden=!ref?.complete;
    if(ref?.complete){$('completeReference').href=ref.complete.file;$('completeReferenceImage').src=ref.complete.file;$('completeReferenceImage').alt=p.name+' · supplied complete silhouette study';}
    $('presetStatus').textContent=`Starting from ${p?.name??'generic rules'}${$('preset').value==='custom'?' · edited values':''}. Shared role, order and crown-height profiles use editable numeric controls. No species script loader.`;
}
function rebuild(){
    if(timer){clearInterval(timer);timer=null;}
    model=generate(options());window.branchStudy=model;
    for(const p of controls)$(p.key+'Value').value=formatted(p,model.settings[p.key]);
    const preset=Object.entries(presets).find(([,values])=>Object.keys(values).every(key=>key==='seed'||JSON.stringify(values[key])===JSON.stringify(model.settings[key])));
    $('preset').value=preset?.[0]??'custom';
    model.preset={id:startingPreset,version:model.presetVersion,edited:preset?.[0]!==startingPreset};showSpecies();
    $('stage').max=Math.max(model.growthLevels,model.settings.rootsEnabled?model.settings.rootLevels-1:0);$('stage').value=$('stage').max;
    selectedDomain='branch';
    selected=model.paths.find(p=>p.order===1&&p.level===2)?.id??0;
    const stopped=model.stopped;
    $('metrics').textContent=`${model.audit.passed?'Geometry checks passed':'Geometry check failed'} · ${model.base.anchors.length} basal stems · ${stopped.spacing} sites omitted for spacing · ${stopped.slenderness} lengths limited · ${model.settings.competition?stopped.crossings+' crossings suppressed':'crossing suppression off'}`;
    $('limit').textContent=[stopped.budget?`Preview limited to ${model.branchLimit.toLocaleString()} branches. Reduce child counts or growth levels for a complete graph.`:'',model.roots.stopped.budget?`Root preview limited to ${model.roots.rootLimit} roots.`:''].filter(Boolean).join(' ');
    for(const p of controls.filter(p=>p.key.startsWith('root')))$(p.key).disabled=!model.settings.rootsEnabled;
    for(let i=0;i<8;i++)$('count'+i).disabled=i>=model.settings.depth;
    $('rangeCounts').hidden=model.settings.countMode!=='range';$('manualCounts').hidden=model.settings.countMode!=='manual';
    $('countProfile').value=Object.entries(countProfiles).find(([,p])=>p.min===model.settings.minChildren&&p.max===model.settings.maxChildren)?.[0]??'custom';
    for(const key of ['bendCenter','bendSpread','bendRecovery'])$(key).disabled=model.settings.bendMode==='gradual';
    $('bendProfile').disabled=model.settings.bendMode!=='gradual';drawShapePreview();drawTrunkPreview();
    for(const key of ['branchStart','branchEnd','trunkClearance','stagger','nodeJitter','arrangement'])$(key).disabled=model.settings.architecture==='fork';
    $('play').textContent='Replay growth';draw();
}
function applyPreset(name){
    const p=presets[name];activeSpecies=p.species;startingPreset=name;
    for(const control of controls)$(control.key).value=p[control.key];
    for(const key of ['architecture','arrangement','bendMode','countMode','minChildren','maxChildren'])$(key).value=p[key];
    for(let i=0;i<8;i++)$('count'+i).value=p.branchCounts[i];
    $('competition').checked=p.competition;$('rootsEnabled').checked=p.rootsEnabled;rebuild();
}
function reset(){$('seed').value=defaults.seed;applyPreset(startingPreset);}
$('growthControls').addEventListener('input',event=>{
    const key=event.target.id;if(!event.target.matches('input,select')||['preset','countProfile','forks','colors','showRoots','rootView','exposureDepth'].includes(key)||!event.target.validity.valid)return;
    if(Number($('branchStart').value)>Number($('branchEnd').value))$(key==='branchStart'?'branchEnd':'branchStart').value=$(key).value;
    if(Number($('minChildren').value)>Number($('maxChildren').value))$(key==='minChildren'?'maxChildren':'minChildren').value=$(key).value;
    rebuild();
});
for(const key of ['forks','colors','stage','showRoots','rootView','exposureDepth'])$(key).addEventListener('input',draw);
$('nextSeed').onclick=()=>{$('seed').value=Number($('seed').value)%999999+1;rebuild();};$('reset').onclick=reset;
$('preset').onchange=()=>{if($('preset').value!=='custom')applyPreset($('preset').value);};
$('speciesCards').onclick=event=>{const button=event.target.closest('[data-preset]');if(button){applyPreset(button.dataset.preset);$('growthControls').scrollIntoView({block:'start',behavior:'smooth'});}};
$('countProfile').onchange=()=>{const p=countProfiles[$('countProfile').value];if(p){$('minChildren').value=p.min;$('maxChildren').value=p.max;rebuild();}};
function selectAxis(event){const data=event.target.dataset,id=data.root??data.branch;if(id!==undefined){selected=Number(id);selectedDomain=data.root===undefined?'branch':'root';draw();}}
$('tree').onclick=selectAxis;$('rootDetail').onclick=selectAxis;
$('play').onclick=()=>{
    if(timer){clearInterval(timer);timer=null;$('play').textContent='Replay growth';return;}
    $('stage').value=0;$('play').textContent='Pause';draw();
    timer=setInterval(()=>{$('stage').value=Number($('stage').value)+1;draw();if(Number($('stage').value)>=Number($('stage').max)){clearInterval(timer);timer=null;$('play').textContent='Replay growth';}},650);
};
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export').onclick=()=>download(`${model.settings.species}-branching-${model.settings.seed}.json`,JSON.stringify(model,null,2),'application/json');
$('downloadSvg').onclick=()=>download(`${model.settings.species}-branching-${model.settings.seed}.svg`,svg(model.paths,{roots:$('showRoots').checked?model.roots:null,soil:$('showRoots').checked&&$('rootView').value==='section',exposure:$('showRoots').checked&&$('rootView').value==='surface'?Number($('exposureDepth').value)*model.settings.baseDiameter:null,forks:$('forks').checked,orderColors:$('colors').checked}),'image/svg+xml');
const help=installStudyHelp({controls,species});
window.addEventListener('pagehide',event=>{if(!event.persisted)help.destroy();},{once:true});
reset();
