// Pose-grouped immutable comparisons, with multi-select and keyboard image navigation.
const data=await fetch('gallery.json').then(r=>r.json());
const select=document.querySelector('#pose'),gallery=document.querySelector('#gallery'),viewer=document.querySelector('#viewer');
const chosen=new Map();let visible=[],index=0;
for(const pose of data.poses)select.add(new Option(pose,pose));select.value='pose_03';
function figure(item){
    const figure=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption'),label=document.createElement('label'),check=document.createElement('input');
    img.src=item.image;img.alt=item.label;img.loading='lazy';img.addEventListener('click',()=>{index=visible.findIndex(v=>v.image===item.image);if(index<0){visible.push(item);index=visible.length-1;}show();});
    check.type='checkbox';check.checked=chosen.has(item.image);check.addEventListener('change',()=>{if(check.checked)chosen.set(item.image,item);else chosen.delete(item.image);document.querySelector('#count').textContent=chosen.size+' selected';});
    label.append(check,document.createTextNode('Compare'));caption.append(document.createTextNode(item.label),label);figure.append(img,caption);return figure;
}
function row(title,items){const el=document.createElement('section');el.className='row';const h=document.createElement('h2');h.textContent=title;el.append(h);for(const item of items){visible.push(item);el.append(figure(item));}gallery.append(el);}
function update(){
    gallery.replaceChildren();visible=[];const pose=select.value;
    row('Original game · existing baked lighting · grading off',data.tones.map(t=>({image:'baselines/'+pose+'_'+t.id+'_off.png',label:'Game · '+t.label+' · original exposure 1.02'})));
    for(const profile of data.profiles)for(const material of document.querySelector('#neutral').checked?['original','neutral']:['original']){
        row(profile.name+' · '+material+' materials',data.tones.map(t=>{const v=data.variants.find(v=>v.kind==='city'&&v.pose===pose&&v.profile===profile.id&&v.material===material&&v.tone===t.id);return {image:v.image,label:profile.id+' · '+t.label+' · '+data.exposureEv.toFixed(3)+' EV'};}));
    }
    for(const light of ['S01','S02','S04','S08','F04','U04']){
        const controls=data.legacy.filter(v=>v.pose===pose&&v.light===light);
        if(controls.length)row('Legacy artistic control · '+light+' · original matched exposure',data.tones.map(t=>controls.find(c=>c.tone===t.id)));
    }
}
function show(){const item=visible[(index+visible.length)%visible.length];index=(index+visible.length)%visible.length;const large=document.querySelector('#large');large.className='';large.replaceChildren();const img=document.createElement('img');img.src=item.image;img.alt=item.label;large.append(img);document.querySelector('#caption').textContent=item.label;if(!viewer.open)viewer.showModal();}
document.querySelector('#previous').onclick=()=>{index--;show();};document.querySelector('#next').onclick=()=>{index++;show();};document.querySelector('#close').onclick=()=>viewer.close();
document.addEventListener('keydown',event=>{if(viewer.open&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();index+=event.key==='ArrowRight'?1:-1;show();}});
document.querySelector('#compare').onclick=()=>{if(!chosen.size)return;const large=document.querySelector('#large');large.className='comparison';large.replaceChildren(...[...chosen.values()].map(figure));document.querySelector('#caption').textContent='Selected comparisons';viewer.showModal();};
select.addEventListener('change',update);document.querySelector('#neutral').addEventListener('change',update);update();
for(const renderer of ['Cycles','Game'])for(const p of data.profiles){
    const file=data.variants.find(v=>v.id===p.id+'_combined_spheres'&&v.tone==='aces');
    const item={image:renderer==='Cycles'?file.image:'images/native_'+p.id+'_combined_spheres.png',label:p.name+' · '+renderer+' diffuse / reflective spheres'};
    visible.push(item);document.querySelector('#spheres').append(figure(item));
}
