# Reuses only authenticated comparison frames whose model, camera and rendering settings match.
import hashlib
import json
import shutil
from pathlib import Path


def reuse(prior,model,state,view,pose,revision,identity,o):
    if not prior or (state=='enhanced' and identity!=prior['sha256']):return None
    folder=Path(prior['file']).parent;proof=Path(o['previous'])
    if not proof.is_absolute():proof=Path(o['root'])/proof
    source_state='current' if state=='current' else 'enhanced'
    row=next((r for r in json.loads(proof.read_text())['renders'] if r['id']==model and r['state']==source_state and r['view']==view
              and r['sourceSha256']==identity and r['width']==o['width'] and r['samples']==o['samples'] and r['camera']==pose
              and r.get('lightingRevision','studio-v1')==revision),None)
    if not row:return None
    source=folder/Path(row['file']).name
    if hashlib.sha256(source.read_bytes()).hexdigest()!=row['sha256']:raise RuntimeError('Cached comparison image changed')
    target=Path(o['output'])/model/f'{state}_{view}.png'
    if target.exists():return None
    shutil.copyfile(source,target)
    return {**row,'state':state,'file':str(target.relative_to(o['output'])).replace('\\','/'),'reusedFrom':str(source)}
