// Owns the study editor, per-model drafts and explicit configuration export.
import {LAYER_IDS,COLORS,clone,counts,createExport,parseExport} from './model.js';
import {createViews} from './views.js';

const $=selector=>document.querySelector(selector);
const fail=error=>{$('#error').hidden=false;$('#error').textContent=error.message;};
const labels=['Inner','Middle','Outer'];
async function start(){
    const response=await fetch('study.json');if(!response.ok)throw Error('Study manifest could not be loaded.');const study=await response.json();
    if(!study.models.length)throw Error('No rendered models in this study.');
    let configs=Object.fromEntries(study.models.map(m=>[m.id,clone(m.preset)])),reviewed={},index=0,layer=2,views,points=new Float32Array(),history=[],loadVersion=0;
    const storageKey='canopy-layer-study:'+study.identity;
    try{const draft=localStorage.getItem(storageKey);if(draft)({configs,reviewed}=parseExport(draft,study));}catch(error){$('#save-status').textContent='Saved draft could not be loaded: '+error.message;}
    const current=()=>study.models[index],config=()=>configs[current().id];
    const display=()=>({layer,opacity:Number($('#opacity').value),visible:$('#overlay-visible').checked,solo:$('#solo').checked});
    const remember=()=>{history.push({id:current().id,config:clone(config()),reviewed:reviewed[current().id]});if(history.length>80)history.shift();};
    function save(){
        const exported=JSON.stringify(createExport(study,configs,reviewed),null,2);$('#json-output').value=exported;
        try{localStorage.setItem(storageKey,exported);$('#save-status').textContent='Draft saved in this browser. Export to share it.';}catch(error){$('#save-status').textContent='Browser storage unavailable. Export JSON to keep your changes.';}
        $('#review-progress').textContent=`${Object.values(reviewed).filter(Boolean).length} / ${study.models.length} models reviewed`;
        $('#undo').disabled=!history.length;
    }
    function redraw(){
        views?.redraw();$('#reviewed').checked=!!reviewed[current().id];
        document.querySelectorAll('[data-center]').forEach(input=>input.value=config().center[Number(input.dataset.center)].toFixed(3));
        document.querySelectorAll('[data-radius]').forEach(input=>{
            const axis=Number(input.dataset.radius),min=layer?config().layers[layer-1].radii[axis]*2+.02:.02;
            const max=layer<2?config().layers[layer+1].radii[axis]*2-.02:current().views[0].span*1.6;
            input.min=min.toFixed(4);input.max=max.toFixed(4);input.value=(config().layers[layer].radii[axis]*2).toFixed(3);
        });
        document.querySelectorAll('[data-layer]').forEach(button=>button.setAttribute('aria-pressed',Number(button.dataset.layer)===layer));
        const allocation=counts(points,config()),total=points.length/3;
        $('#allocation').innerHTML=allocation.map((n,i)=>`<div class="allocation-row"><span>${labels[i]||'Outside'}</span><div class="meter"><span style="width:${total?n/total*100:0}%;background:${COLORS[i]||'#a9bdb4'}"></span></div><span>${total?(n/total*100).toFixed(1):'0'}% · ${n.toLocaleString()}</span></div>`).join('');
    }
    function changed(){reviewed[current().id]=false;redraw();save();}
    function resize(axis,diameter){
        const min=layer?config().layers[layer-1].radii[axis]+.01:.01,max=layer<2?config().layers[layer+1].radii[axis]-.01:current().views[0].span*.8;
        config().layers[layer].radii[axis]=Math.max(min,Math.min(max,diameter/2));changed();
    }
    $('#center-fields').innerHTML=['X','Y','Z ↑'].map((axis,i)=>`<label><span>${axis} (m)</span><input type="number" step="0.05" data-center="${i}" aria-label="Center ${axis}"></label>`).join('');
    $('#size-fields').innerHTML=['Width · X','Depth · Y','Height · Z'].map((axis,i)=>`<div class="size-field"><label class="size-heading">${axis}<input type="number" step="0.05" data-radius="${i}" aria-label="${axis} diameter"></label><input type="range" step="0.01" data-radius="${i}" aria-label="${axis} slider"></div>`).join('');
    $('#layer-tabs').innerHTML=labels.map((name,i)=>`<button data-layer="${i}" style="--layer:${COLORS[i]}">${name}</button>`).join('');
    document.querySelectorAll('[data-layer]').forEach(button=>button.onclick=()=>{layer=Number(button.dataset.layer);redraw();});
    document.querySelectorAll('[data-center]').forEach(input=>input.onchange=()=>{if(!Number.isFinite(input.valueAsNumber)){redraw();return;}remember();config().center[Number(input.dataset.center)]=Math.max(-100,Math.min(100,input.valueAsNumber));changed();});
    document.querySelectorAll('[data-radius]').forEach(input=>{
        if(input.type==='range'){
            input.onpointerdown=remember;input.onkeydown=event=>{if(event.key.startsWith('Arrow'))remember();};
            input.oninput=()=>resize(Number(input.dataset.radius),input.valueAsNumber);
        }else input.onchange=()=>{if(!Number.isFinite(input.valueAsNumber)){redraw();return;}remember();resize(Number(input.dataset.radius),input.valueAsNumber);};
    });
    for(const [id,factor] of [['shrink',.95],['grow',1.05]])$('#'+id).onclick=()=>{remember();const radii=[...config().layers[layer].radii];for(let axis=0;axis<3;axis++)resize(axis,radii[axis]*2*factor);};
    for(const id of ['opacity','overlay-visible','solo'])$('#'+id).oninput=redraw;
    $('#reset').onclick=()=>{remember();configs[current().id]=clone(current().preset);changed();};
    $('#undo').onclick=()=>{const last=history.pop();if(!last)return;configs[last.id]=last.config;reviewed[last.id]=last.reviewed;select(study.models.findIndex(m=>m.id===last.id)).catch(fail);};
    $('#reviewed').onchange=()=>{reviewed[current().id]=$('#reviewed').checked;save();};
    async function select(next){
        const token=++loadVersion;index=next;views?.destroy();points=new Float32Array();document.body.dataset.loading='true';
        $('#model-title').textContent=current().name+' / '+current().id.split('/')[1].replace('_',' ');$('#botanical').textContent=current().botanical;
        $('#variants').innerHTML=study.models.map((m,i)=>m.id.split('/')[0]===current().id.split('/')[0]?`<button data-model="${i}" aria-pressed="${i===index}">${m.id.split('/')[1].replace('_',' ')}</button>`:'').join('');
        document.querySelectorAll('[data-model]').forEach(button=>button.onclick=()=>select(Number(button.dataset.model)).catch(fail));
        document.querySelectorAll('[data-species]').forEach(button=>button.setAttribute('aria-pressed',current().id.startsWith(button.dataset.species+'/')));
        views=createViews($('#views'),current(),{getConfig:config,getDisplay:display,onStart:remember,onMove:center=>{config().center=center;changed();},onEnd:save});redraw();save();
        try{
            const result=await fetch(current().leafCenters.file);if(!result.ok)throw Error('Could not load leaf centers.');const data=await result.arrayBuffer();
            if(token!==loadVersion)return;points=new Float32Array(data);if(points.length!==current().leafCount*3)throw Error('Incorrect leaf sample count.');
            redraw();location.hash=current().id;
        }finally{if(token===loadVersion)document.body.dataset.loading='false';}
    }
    const species=[...new Set(study.models.map(m=>m.id.split('/')[0]))];
    $('#species').innerHTML=species.map(id=>`<button data-species="${id}">${study.models.find(m=>m.id.startsWith(id+'/')).name}</button>`).join('');
    document.querySelectorAll('[data-species]').forEach(button=>button.onclick=()=>select(study.models.findIndex(m=>m.id.startsWith(button.dataset.species+'/'))).catch(fail));
    $('#copy').onclick=async()=>{
        try{await navigator.clipboard.writeText($('#json-output').value);$('#export-status').textContent='Copied all model configurations. Paste them into the chat.';}
        catch(error){$('#json-output').focus();$('#json-output').select();$('#export-status').textContent='JSON selected. Press Ctrl+C to copy.';}
    };
    $('#download').onclick=()=>{const url=URL.createObjectURL(new Blob([$('#json-output').value],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='canopy-layers.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('#export-status').textContent='Configuration downloaded.';};
    $('#import').onclick=()=>$('#import-file').click();
    $('#import-file').onchange=async event=>{
        const file=event.target.files[0];if(!file)return;
        try{const imported=parseExport(await file.text(),study);configs=imported.configs;reviewed=imported.reviewed;history=[];redraw();save();$('#export-status').textContent='Imported all model configurations.';}catch(error){$('#export-status').textContent='Import rejected: '+error.message;}
        event.target.value='';
    };
    const initial=study.models.findIndex(m=>m.id===decodeURIComponent(location.hash.slice(1)));await select(initial<0?0:initial);
}
start().catch(fail);
