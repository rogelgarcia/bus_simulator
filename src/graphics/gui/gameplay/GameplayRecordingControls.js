// Recording controls retain the compressed result for clipboard retries or download.
import { applyMaterialSymbolToButton } from '../shared/materialSymbols.js';

function element(tag, className, text = '') {
    const node=document.createElement(tag); node.className=className; node.textContent=text;
    if (tag==='button') node.type='button';
    return node;
}

export class GameplayRecordingControls {
    constructor(panel, recorder) {
        this.panel=panel; this.recorder=recorder;
        this.root=element('div','gpd-recording'); this.root.hidden=true;
        this.status=element('div','gpd-recording-status'); this.status.setAttribute('role','status');
        this.stopButton=element('button','gpd-btn','Stop'); this.stopButton.setAttribute('aria-label','Stop recording');
        this.copyButton=element('button','gpd-btn','Copy again');
        this.downloadButton=element('button','gpd-btn','Download');
        this.closeButton=element('button','gpd-btn','');
        applyMaterialSymbolToButton(this.closeButton,{name:'close',label:'Dismiss recording'});
        this.root.append(this.status,this.stopButton,this.copyButton,this.downloadButton,this.closeButton);
        panel.root.prepend(this.root);
        panel.btnRecord.addEventListener('click',()=>this.start());
        this.stopButton.addEventListener('click',()=>void this.stop());
        this.copyButton.addEventListener('click',()=>void this.copy());
        this.closeButton.addEventListener('click',()=>{this.root.hidden=true;this.text=null;});
        this.downloadButton.addEventListener('click',()=>{
            const url=URL.createObjectURL(new Blob([this.text],{type:'text/plain'})), link=document.createElement('a');
            link.href=url; link.download='bus-recording.busrec'; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
        });
        recorder.onLimit=()=>void this.stop('frame_limit');
        recorder.onChange=()=>this.refresh();
    }

    start() {
        this.text=null; this.root.hidden=false;
        try {
            this.recorder.start(); this.panel.setMinimized(true);
            this._interval=setInterval(()=>this.refresh(),250);
        } catch (error) { this.status.textContent=error.message; }
    }

    refresh() {
        if (this._destroyed) return;
        const busy=this.recorder.active || this.recorder.stopping;
        this.panel.btnRecord.disabled=busy;
        this.stopButton.hidden=!this.recorder.active; this.copyButton.hidden=!this.text;
        this.downloadButton.hidden=!this.text; this.closeButton.hidden=busy;
        this.root.classList.toggle('is-recording',this.recorder.active);
        if (this.recorder.active) {
            const seconds=Math.floor((performance.now()-this.recorder.startedAt)/1000);
            this.status.textContent=`Recording ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} · ${this.recorder.count} frames`;
        } else if (this.recorder.stopping) this.status.textContent='Compressing recording…';
    }

    async stop(reason = 'user') {
        if (!this.recorder.active) return;
        clearInterval(this._interval);
        try {
            this.text=await this.recorder.stop(reason);
            if (this._destroyed) return;
            this.refresh(); await this.copy();
        } catch (error) {
            if (this._destroyed) return;
            this.status.textContent=`Recording failed: ${error.message}`; this.refresh();
        }
    }

    async copy() {
        if (!this.text) return;
        try {
            try { await navigator.clipboard.writeText(this.text); }
            catch {
                const field=element('textarea','gpd-clipboard-buffer'); field.value=this.text; this.root.append(field);
                try { field.select(); if (!document.execCommand('copy')) throw new Error('Clipboard blocked'); }
                finally { field.remove(); }
            }
            if (!this._destroyed) this.status.textContent=`Copied · ${this.recorder.count} frames · ${(this.text.length/1024).toFixed(1)} KiB`;
        } catch {
            if (!this._destroyed) this.status.textContent='Copy blocked — retry Copy again or Download';
        }
    }

    destroy() {
        this._destroyed=true; clearInterval(this._interval); this.recorder.destroy(); this.root.remove(); this.text=null;
    }
}
