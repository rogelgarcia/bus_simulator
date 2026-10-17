// Hover/focus explanations rendered outside scrolling panels to avoid clipping.
export function createHelpPopup(){
    const popup=document.createElement('section');
    popup.id='studyHelp';popup.className='help-popup';popup.hidden=true;
    popup.setAttribute('role','dialog');popup.setAttribute('aria-modal','false');
    popup.innerHTML='<div class="help-heading"><strong id="studyHelpTitle"></strong><button type="button" aria-label="Close explanation">×</button></div><div id="studyHelpBody"></div>';
    popup.setAttribute('aria-labelledby','studyHelpTitle');document.body.append(popup);
    const bindings=new Map(),listeners=[],title=popup.querySelector('strong'),body=popup.querySelector('#studyHelpBody');
    let active=null,timeout=null;
    const listen=(target,type,fn,options)=>{target.addEventListener(type,fn,options);listeners.push(()=>target.removeEventListener(type,fn,options));};
    const cancel=()=>{clearTimeout(timeout);timeout=null;};
    function hide(){
        cancel();if(active){active.setAttribute('aria-expanded','false');active.removeAttribute('aria-describedby');}
        active=null;popup.hidden=true;
    }
    function position(){
        const anchor=active.getBoundingClientRect(),rect=popup.getBoundingClientRect(),gap=10,pad=12;
        const left=Math.max(pad,Math.min(anchor.left,innerWidth-rect.width-pad));
        const below=anchor.bottom+gap,above=anchor.top-gap-rect.height;
        popup.style.left=left+'px';popup.style.top=Math.max(pad,Math.min(below+rect.height<=innerHeight-pad?below:above,innerHeight-rect.height-pad))+'px';
    }
    function show(target){
        cancel();if(active&&active!==target)hide();active=target;
        title.textContent=target.textContent.trim();body.innerHTML=bindings.get(target)();
        for(const element of body.querySelectorAll('[id]'))element.removeAttribute('id');
        target.setAttribute('aria-expanded','true');target.setAttribute('aria-describedby','studyHelpBody');
        popup.hidden=false;position();
    }
    function scheduleHide(){
        cancel();timeout=setTimeout(()=>{
            if(!popup.matches(':hover')&&!active?.matches(':hover')&&!popup.contains(document.activeElement)&&!active?.contains(document.activeElement))hide();
        },180);
    }
    function bind(target,content){
        if(!target||bindings.has(target))throw Error('Invalid or duplicate help title');
        bindings.set(target,typeof content==='function'?content:()=>content);
        target.classList.add('help-title');target.tabIndex=0;
        target.setAttribute('aria-haspopup','dialog');target.setAttribute('aria-controls',popup.id);target.setAttribute('aria-expanded','false');
        listen(target,'pointerenter',()=>show(target));listen(target,'pointerleave',scheduleHide);
        listen(target,'focus',()=>show(target));listen(target,'blur',scheduleHide);
        listen(target,'click',event=>{if(target.tagName!=='SUMMARY'){event.preventDefault();event.stopPropagation();}show(target);});
        listen(target,'keydown',event=>{
            if((event.key==='Enter'||event.key===' ')&&target.tagName!=='SUMMARY'){
                event.preventDefault();show(target);popup.querySelector('button').focus();
            }
        });
    }
    listen(popup,'pointerenter',cancel);listen(popup,'pointerleave',scheduleHide);
    listen(popup,'focusin',cancel);listen(popup,'focusout',scheduleHide);
    listen(popup.querySelector('button'),'click',()=>{const previous=active;previous?.focus();hide();});
    listen(document,'keydown',event=>{if(event.key==='Escape'&&active){const previous=active;if(popup.contains(document.activeElement))previous.focus();hide();}});
    listen(document,'pointerdown',event=>{if(active&&!active.contains(event.target)&&!popup.contains(event.target))hide();});
    listen(document,'scroll',event=>{
        if(popup.contains(event.target))return;
        if(active?.matches(':hover')||active?.contains(document.activeElement))position();else hide();
    },true);
    listen(window,'resize',hide);
    return Object.freeze({bind,destroy(){cancel();for(const remove of listeners)remove();bindings.clear();popup.remove();}});
}
