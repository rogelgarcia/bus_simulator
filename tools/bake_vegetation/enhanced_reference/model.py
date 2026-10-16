# Authors a new three-form species collection without mutating preserved references.
import hashlib
import json
from pathlib import Path
import bpy
import numpy as np
from common import write_json,triangles,array
from architecture import scaffold
from foliage import grow,templates,instances
from wood import roots,build_wood
from surface import material


def build(o):
    output=Path(o['output']);summary=[]
    for model in o['models']:
        species,variant=model.split('/');p=o['profiles'][species];directory=output/model;directory.mkdir(parents=True,exist_ok=True);file=directory/'enhanced.blend'
        if file.exists():raise RuntimeError('Preserve existing candidate '+str(file))
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bark,barkmeta=material(o,species,'bark');front,leafmeta=material(o,species,'leaf_front');back,_=material(o,species,'leaf_back')
        paths,lobes,rng,dimensions=scaffold(p,int(variant[-1]));roots(paths,p,rng)
        leaves,shoots,crowding=grow(p,paths,lobes,rng)
        print(f'[Enhanced] {model}: {len(paths)} connected paths, {len(leaves)} leaves',flush=True)
        oak=p.get('growth',{}).get('architecture')=='open-oak'
        elm=p.get('growth',{}).get('architecture')=='arching-elm'
        paired='pairedFoliage' in p
        forms=templates(o,species,[front,back],leafmeta,detailed_petioles=oak or elm or paired);foliage=instances(model,leaves,forms)
        wood,twigs=build_wood(model,paths,p,bark,barkmeta,rng)
        origins=np.asarray([l['origin'] for l in leaves]);centers=origins+np.asarray([l['matrix'][:,1] for l in leaves])*.52
        if oak or elm or paired:centers=np.asarray([l['bladeCenter'] for l in leaves])
        if not np.isfinite(centers).all() or len(leaves)<3000:raise RuntimeError('Invalid canopy')
        parent_errors=[]
        for path in paths:
            if path['parent']<0:continue
            parent=paths[path['parent']]['points'];a=parent[:-1];d=np.diff(parent,axis=0);t=np.clip(np.sum((path['points'][0]-a)*d,axis=1)/np.sum(d*d,axis=1),0,1);distance=np.linalg.norm(path['points'][0]-a-d*t[:,None],axis=1)
            parent_errors.append(float(distance.min()))
        if max(parent_errors)>.45:raise RuntimeError('Detached branch origin')
        if any(np.max(np.diff(r['radii']))>1e-8 for r in paths):raise RuntimeError('Branch fattens toward its tip')
        template_counts=[triangles(m) for m in forms];expanded=sum(template_counts[l['form']] for l in leaves)
        bounds={'min':np.minimum(centers.min(axis=0)-p['leafLength'],[0,0,0]).tolist(),'max':(centers.max(axis=0)+p['leafLength']).tolist()}
        revision='enhanced-plane-branchlets-v8' if p.get('growth',{}).get('architecture')=='distributed-plane' else 'enhanced-shared-forks-v3' if 'growth' in p else 'enhanced-botanical-v1'
        if p.get('growth',{}).get('architecture')=='conical-linden':revision='enhanced-linden-conical-v4'
        if oak:revision='enhanced-oak-fork-shoulders-v8'
        if elm:revision='enhanced-elm-clustered-v5'
        if paired:revision='enhanced-arrowwood-spaced-pairs-v2'
        stats={'id':model,'revision':revision,'baselineSha256':next(r['sha256'] for r in o['sources'] if r['id']==model),'previousSha256':next((r['sha256'] for r in o['previousSources'] if r['id']==model),None),'codeIdentity':o['codeIdentity'],
            'leafCount':len(leaves),'branchPaths':len(paths),'crownLobes':len(lobes),'woodTriangles':triangles(wood.data),'branchletTriangles':triangles(twigs.data),
            'leafTemplateTriangles':template_counts,'instancedLeafTriangles':expanded,'alphaCards':0,'bounds':bounds,'dimensions':dimensions,'crowding':crowding,
            'maximumBranchAnchorDistance':max(parent_errors),'sourceMaterials':'AI generated','frontBackMaterials':True,'barkTileMetres':p['barkTileMetres'],'files':['enhanced.blend','architecture.json'],
            'limitations':['Artist-authored growth model, not physiological simulation','Imported maps are AI generated, not scans','Local crowding proxy does not prove leaf nonintersection','Reference geometry is not a runtime LOD']}
        for obj in [foliage,wood,twigs]:obj['species']=species;obj['variant']=variant;obj['referenceRevision']=revision
        if 'boleMinimumRadiusRatios' in wood:stats['boleMinimumRadiusRatios']=list(wood['boleMinimumRadiusRatios'])
        if 'boleSections' in wood:stats['boleSections']=json.loads(wood['boleSections'])
        if oak or elm:
            from oak_growth import crown_profile
            stats['crownProfile']=crown_profile(np.asarray([leaf['bladeCenter'] for leaf in leaves]))
            if stats['crownProfile']['widthAspect']<.70 or stats['crownProfile']['widthToHeight']<(.65 if elm else .85):raise RuntimeError('Crown is too narrow')
        if revision=='enhanced-linden-conical-v4':
            from linden_growth import crown_profile
            from wood_continuity import leader_sections,inspect_leader
            stats['crownProfile']=crown_profile(origins,dimensions)
            if stats['crownProfile']['upperToLowerRadius']>=.80:raise RuntimeError('Linden foliage lost its tapered silhouette')
            stats['leaderSections']=leader_sections(paths);stats['leaderContinuity']=inspect_leader(wood,stats['leaderSections'])
            if not stats['leaderContinuity']['passed']:raise RuntimeError('Missing wood along the central leader: '+str(stats['leaderContinuity']))
        if 'barkProjectionMethod' in wood:stats['barkProjection']={'method':wood['barkProjectionMethod'],'maximumDistance':wood['barkProjectionMaximumDistance']}
        if 'forkBlendedFaces' in wood:stats['forkSurface']={'shoulders':True,'blendedFaces':wood['forkBlendedFaces'],'chartBlendWidth':wood['forkBlendWidth']}
        if p.get('shrubRootCollars'):stats['rootCollars']={'count':sum(bool(r.get('rootCollar')) for r in paths),'barkReliefScale':p['barkReliefScale']}
        bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(file),compress=True)
        stats['sha256']=hashlib.sha256(file.read_bytes()).hexdigest();stats['file']=str(file.relative_to(output)).replace('\\','/')
        write_json(directory/'model.json',stats);write_json(directory/'architecture.json',{'paths':[{**r,'points':r['points'].tolist(),'radii':r['radii'].tolist()} for r in paths], 'shoots':shoots})
        summary.append(stats);write_json(output/'build-last.json',{'models':summary})
        print('[Enhanced] Saved '+model,flush=True)
