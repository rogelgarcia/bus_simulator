# Shares measured canopy cutouts across mature forms while bounding silhouette and coverage changes.
import json
from pathlib import Path
import bpy
import numpy as np
from common import clear_scene, write_json
from source import load_model
from capture import capture_tiles, serial_panel


def descriptors(options,species,variant,level):
    directory=Path(options['previous'])/species
    record=next(r for r in json.loads((directory/'index.json').read_text())['models'] if r['id']==variant and r['level']==level)
    image=bpy.data.images.load(str(directory/'textures'/f'{variant}_lod{level}'/'distant_color.png'),check_existing=False)
    width,height=image.size;alpha=np.array(image.pixels[:],np.float32).reshape((height,width,4))[:,:,3]
    result=[]
    for view in record['views']:
        if view['role']!='leaves':continue
        u0,v0,u1,v1=view['uv'];patch=alpha[round(v0*height):round(v1*height),round(u0*width):round(u1*width)]
        ys=np.linspace(0,patch.shape[0]-1,64).astype(int);xs=np.linspace(0,patch.shape[1]-1,64).astype(int)
        # Compare canopy masses, not the coincidental positions of individual leaf pixels.
        mask=patch[np.ix_(ys,xs)].reshape(8,8,8,8).mean(axis=(1,3))
        result.append({'mask':mask,'coverage':float(np.mean(patch>=.5)),'aspect':view['size'][0]/view['size'][1]})
    bpy.data.images.remove(image);return result


def choose_prototypes(candidates):
    assignments={};prototypes=[]
    for level in [3,4]:
        ids=[i for i,c in enumerate(candidates) if c['level']==level]
        masks=np.array([candidates[i]['descriptor']['mask'] for i in ids])
        overlap=np.zeros((len(ids),len(ids)));valid=np.zeros_like(overlap,dtype=bool)
        for i,a in enumerate(ids):
            for j,b in enumerate(ids):
                x,y=candidates[a]['descriptor'],candidates[b]['descriptor']
                overlap[i,j]=np.minimum(masks[i],masks[j]).sum()/max(float(np.maximum(masks[i],masks[j]).sum()),1e-6)
                aspect=max(x['aspect']/y['aspect'],y['aspect']/x['aspect'])
                coverage=max(x['coverage']/y['coverage'],y['coverage']/x['coverage'])
                valid[i,j]=overlap[i,j]>=(.68 if level==3 else .82) and aspect<=(1.30 if level==3 else 1.10) and coverage<=(1.30 if level==3 else 1.12)
        uncovered=set(range(len(ids)));selected=[]
        while uncovered:
            best=max(range(len(ids)),key=lambda j:(sum(valid[i,j] for i in uncovered),sum(overlap[i,j] for i in uncovered),-j))
            selected.append(best);uncovered-={i for i in uncovered if valid[i,best]}
        for i,a in enumerate(ids):
            chosen=max((j for j in selected if valid[i,j]),key=lambda j:overlap[i,j])
            prototype=ids[chosen]
            if prototype not in prototypes:prototypes.append(prototype)
            assignments[a]=(prototypes.index(prototype),float(overlap[i,chosen]))
    return prototypes,assignments


def build_leaf_bank(options,species,profile,panels_for):
    clear_scene();candidates=[]
    for variant in ['mature_01','mature_02','mature_03']:
        parts,_=load_model(options,species,variant)
        resolved={**profile,**profile['variants'][variant]}
        for level in [3,4]:
            panels=panels_for(parts,resolved,level);measurements=descriptors(options,species,variant,level)
            for index,(item,descriptor) in enumerate(zip(panels,measurements)):
                candidates.append({'variant':variant,'level':level,'index':index,'panel':item,'descriptor':descriptor})
    selected,assignments=choose_prototypes(candidates)
    print(f'[Distant] Selected {len(selected)} reusable cards for {len(candidates)} placements',flush=True)
    panels=[candidates[i]['panel'] for i in selected]
    directory=Path(options['output'])/species/'shared_leaves'
    capture_tiles(options,panels,directory,options['tile'],normal_filter=True,prefix='shared_leaf')
    mappings={}
    for index,target in enumerate(candidates):
        prototype,similarity=assignments[index];source=candidates[selected[prototype]];view=panels[prototype]
        scale=np.sqrt(np.prod(target['panel']['size'])*target['descriptor']['coverage']/(np.prod(view['size'])*source['descriptor']['coverage']))
        mappings[f"{target['variant']}/{target['level']}/{target['index']}"]={
            'prototype':prototype,'source':f"{source['variant']}/{source['level']}/{source['index']}",
            'uv':view['uv'],'size':(view['size']*scale).tolist(),'alphaOccupancy':view['alphaOccupancy'],'silhouetteIoU':similarity}
    bank={'schema':1,'species':species,'tileResolution':options['tile'],'placements':len(candidates),'uniqueCards':len(panels),
          'mappings':mappings,'prototypes':[serial_panel(p) for p in panels]}
    write_json(directory/'index.json',bank)
    print(f'[Distant] {species}: {len(candidates)} leaf placements reuse {len(panels)} cards at {options["tile"]} px',flush=True)
    return bank


def apply_leaf_bank(options,species,model,level,panels,bank):
    images={}
    for channel in ['color','normal','orm']:
        image=bpy.data.images.load(str(Path(options['output'])/species/'shared_leaves'/f'shared_leaf_{channel}.png'),check_existing=True)
        image.name='shared_leaf_'+channel;image.colorspace_settings.name='sRGB' if channel=='color' else 'Non-Color';images[channel]=image
    for index,item in enumerate(panels):
        mapping=bank['mappings'][f'{model}/{level}/{index}']
        item.update(uv=mapping['uv'],size=np.array(mapping['size']),alphaOccupancy=mapping['alphaOccupancy'],
                    reusedCard=mapping['prototype'],reusedFrom=mapping['source'],silhouetteIoU=mapping['silhouetteIoU'])
    return images
