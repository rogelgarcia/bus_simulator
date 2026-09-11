"""Reversible experiment-only shader translations; original material datablocks stay intact."""
import re,math,json
from pathlib import Path
import bpy
import numpy as np

def set_value(shader,name,value):
    socket=shader.inputs[name]
    for link in list(socket.links):shader.id_data.links.remove(link)
    socket.default_value=value

def set_f0(shader,rgb):
    peak=max(rgb)
    if not 0<peak<.95:raise RuntimeError('Invalid legacy F0')
    root=math.sqrt(peak);set_value(shader,'IOR',(1+root)/(1-root));set_value(shader,'Specular IOR Level',.5)
    set_value(shader,'Specular Tint',(*[v/peak for v in rgb],1))

def interior_image(contract):
    c=contract['windowInterior'];n=c['size'];a=np.empty((n,n,4),np.float32);a[:,:,:3]=c['backgroundLinear'];a[:,:,3]=1
    y,x=np.indices((n,n));a[((x//16+y//16+c['seed'])%2)==0,:3]=c['alternateLinear']
    a[((x%16)>4)&((x%16)<11)&((y%16)>3)&((y%16)<12),:3]=c['silhouetteLinear']
    image=bpy.data.images.new(c['id'],width=n,height=n,float_buffer=True);image.colorspace_settings.name='Non-Color';image.pixels.foreach_set(a.ravel());image.update();image.pack();return image

def correct_generated_normal(material):
    tree=material.node_tree;normals=[n for n in tree.nodes if n.type=='NORMAL_MAP']
    if len(normals)!=1 or not normals[0].inputs['Color'].is_linked:raise RuntimeError('Missing generated normal-map adapter: '+material.name)
    socket=normals[0].inputs['Color'];source=socket.links[0].from_socket
    split=tree.nodes.new('ShaderNodeSeparateXYZ');combine=tree.nodes.new('ShaderNodeCombineXYZ');tree.links.new(source,split.inputs[0])
    for i,c in enumerate([0,2,1]):tree.links.new(split.outputs[c],combine.inputs[i])
    tree.links.new(combine.outputs[0],socket)

def city_candidates(job):
    print('AI566_CITY_READ_AUDIT',flush=True)
    rows={r['id']:r for r in json.loads((Path(job['output'])/'runtime_audit.json').read_text())['records']}
    windows=set(job['inventory']['windowIds']);glazing=set(job['inventory']['glazingIds']);grass=set(job['inventory']['grassIds']);normal_ids=set(job['inventory']['generatedNormalIds']);image=interior_image(job['contract'])
    print('AI566_CITY_INTERIOR_READY',flush=True)
    mapping={};changes=[];originals=list(bpy.data.materials)
    for original in originals:
        match=re.match(r'^(MAT_\d+_[^.]+)(?:\.\d+)?$',original.name)
        if not match or match[1] not in rows:continue
        record=rows[match[1]];ident=record['id'];names={'original':original.name}
        for variant in job['defaults']['cityVariants']:
            changed=ident in normal_ids or record['type']=='MeshPhongMaterial' and max(record['inputs'].get('specular',[0]))>0
            changed=changed or variant=='plausible' and (ident in windows|glazing|grass)
            if not changed:names[variant]=original.name;continue
            m=original.copy();m.name=original.name+'__'+variant;m.use_fake_user=True;s=m.node_tree.nodes.get('Principled BSDF')
            if s is None:raise RuntimeError('Missing explicit material adapter: '+original.name)
            before={k:list(s.inputs[k].default_value) if k in ['Base Color','Specular Tint'] else s.inputs[k].default_value for k in ['Base Color','Roughness','Metallic','IOR','Specular IOR Level','Specular Tint']}
            if ident in normal_ids:correct_generated_normal(m)
            if record['type']=='MeshPhongMaterial':set_f0(s,record['inputs']['specular'])
            if variant=='plausible':
                p=job['profiles']['plausible'];bus=p['bus'].get(record['name'])
                if bus:
                    set_value(s,'Metallic',0);set_value(s,'Roughness',bus['roughness']);set_f0(s,[bus['f0']]*3)
                if ident in grass:
                    socket=s.inputs['Roughness'];value=socket.default_value;source=socket.links[0].from_socket if socket.is_linked else None
                    remap=m.node_tree.nodes.new('ShaderNodeMath');remap.operation='MULTIPLY_ADD';remap.inputs[0].default_value=value;remap.inputs[1].default_value=p['grassRoughnessRemap'][1];remap.inputs[2].default_value=p['grassRoughnessRemap'][0]
                    if source:m.node_tree.links.new(source,remap.inputs[0])
                    m.node_tree.links.new(remap.outputs[0],socket)
                if ident in glazing:
                    set_value(s,'Base Color',(*p['buildingGlazing']['color'],1));set_value(s,'Metallic',0);set_value(s,'Roughness',p['buildingGlazing']['roughness']);set_f0(s,[.04]*3)
                if ident in windows:
                    texture=m.node_tree.nodes.new('ShaderNodeTexImage');texture.image=image;texture.interpolation='Closest';m.node_tree.links.new(texture.outputs['Color'],s.inputs['Base Color'])
                    for k,v in [('Metallic',0),('Roughness',.8),('Alpha',1),('Transmission Weight',0),('Emission Strength',0)]:set_value(s,k,v)
                    set_f0(s,[.04]*3)
            names[variant]=m.name
            after={k:list(s.inputs[k].default_value) if k in ['Base Color','Specular Tint'] else s.inputs[k].default_value for k in before}
            if record['scope']=='bus' and after['Base Color']!=before['Base Color']:raise RuntimeError('Bus color changed')
            changes.append({'source':ident,'material':original.name,'candidate':m.name,'variant':variant,'before':before,'after':after,'roughnessLinked':s.inputs['Roughness'].is_linked,'generatedNormalCorrection':ident in normal_ids,'windowContract':ident in windows and variant=='plausible'})
        mapping[original.name]=names
    bindings=[]
    print('AI566_CITY_MATERIALS_READY '+str(len(changes)),flush=True)
    for obj in bpy.context.scene.objects:
        if obj.type!='MESH':continue
        for i,slot in enumerate(obj.material_slots):
            if slot.material and slot.material.name in mapping and len(set(mapping[slot.material.name].values()))>1:bindings.append({'object':obj.name,'slot':i,'variants':mapping[slot.material.name]})
    # Blender text insertion becomes extremely slow for a multi-megabyte single line.
    text=bpy.data.texts.new('AI566_material_bindings.json');text.write(json.dumps(bindings,indent=2))
    return {'changes':changes,'bindings':len(bindings),'windowContract':job['contract']['windowInterior'],'unmodifiedSources':len(originals),'policy':'Original datablocks preserved; every render assigns a declared candidate. No source asset publication.'}

def assign(scene,variant):
    bindings=json.loads(bpy.data.texts['AI566_material_bindings.json'].as_string())
    for b in bindings:bpy.data.objects[b['object']].material_slots[b['slot']].material=bpy.data.materials[b['variants'][variant]]
    scene['AI566_material_variant']=variant
