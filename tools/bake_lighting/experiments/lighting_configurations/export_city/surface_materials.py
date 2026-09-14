"""Import native surface-evaluated material inputs without embedding illumination."""
import json
from pathlib import Path
import bpy
import numpy as np
import OpenImageIO as oiio

def restore_native_surface_uv(obj):
    if obj.get('bus_sim_surface_uv_basis')=='native-bottom-up':return False
    layer=obj.data.uv_layers[1]
    values=np.empty(len(layer.uv)*2,dtype=np.float32);layer.uv.foreach_get('vector',values)
    values[1::2]=1-values[1::2];layer.uv.foreach_set('vector',values)
    obj['bus_sim_surface_uv_basis']='native-bottom-up'
    return True

def apply_surface_materials(records, directory):
    audit=[]
    for record in records:
        obj=bpy.data.objects.get(record['object'])
        if obj is None or obj.type!='MESH':raise RuntimeError('Missing material surface object '+record['object'])
        if len(obj.data.uv_layers)<2:raise RuntimeError('Missing surface UV layer '+obj.name)
        restore_native_surface_uv(obj)
        images={}
        for kind,name in record['files'].items():
            data=np.fromfile(Path(directory)/name,dtype='<f4').reshape(record['height'],record['width'],4)
            mask=data[:,:,3]>.5
            if not np.any(mask) or not np.all(np.isfinite(data)):raise RuntimeError('Invalid material surface '+name)
            if kind=='normal':
                x=data[:,:,0].copy();y=data[:,:,1].copy();z=data[:,:,2].copy()
                data[:,:,0]=x;data[:,:,1]=1-z;data[:,:,2]=y
            for _ in range(record.get('padding',4)+2):
                sums=np.zeros_like(data);count=np.zeros(mask.shape,dtype=np.float32)
                for axis,shift in [(0,1),(0,-1),(1,1),(1,-1)]:
                    valid=np.roll(mask,shift,axis);values=np.roll(data,shift,axis)
                    if axis==0:valid[0 if shift>0 else -1,:]=False
                    else:valid[:,0 if shift>0 else -1]=False
                    sums+=values*valid[:,:,None];count+=valid
                fill=(~mask)&(count>0);data[fill]=sums[fill]/count[fill,None];mask|=fill
            path=Path(directory)/(Path(name).stem+'.exr')
            writer=oiio.ImageOutput.create(str(path));writer.open(str(path),oiio.ImageSpec(record['width'],record['height'],3,oiio.FLOAT));writer.write_image(np.flipud(data[:,:,:3]).copy());writer.close()
            image=bpy.data.images.load(str(path));image.colorspace_settings.name='Non-Color';image.pack();images[kind]=image
        for slot in obj.material_slots:
            base=slot.material
            if not base or not base.use_nodes:raise RuntimeError('Unsupported material slot '+obj.name)
            mat=base.copy();slot.material=mat;nodes,links=mat.node_tree.nodes,mat.node_tree.links
            uv=nodes.new('ShaderNodeUVMap');uv.uv_map=obj.data.uv_layers[1].name
            textures={}
            for kind,image in images.items():
                node=nodes.new('ShaderNodeTexImage');node.name='Native surface '+kind;node.image=image;node.interpolation='Linear';node.extension='EXTEND';links.new(uv.outputs[0],node.inputs['Vector']);textures[kind]=node
            split=nodes.new('ShaderNodeSeparateColor');links.new(textures['orm'].outputs['Color'],split.inputs[0])
            normal=nodes.new('ShaderNodeVectorMath');normal.operation='MULTIPLY_ADD';normal.inputs[1].default_value=(2,2,2);normal.inputs[2].default_value=(-1,-1,-1);links.new(textures['normal'].outputs['Color'],normal.inputs[0])
            for bsdf in [n for n in nodes if n.type=='BSDF_PRINCIPLED']:
                links.new(textures['color'].outputs['Color'],bsdf.inputs['Base Color']);links.new(split.outputs['Red'],bsdf.inputs['Roughness']);links.new(split.outputs['Green'],bsdf.inputs['Metallic']);links.new(normal.outputs[0],bsdf.inputs['Normal'])
            for name,socket,kind in [('AI568 Base Color',textures['color'].outputs['Color'],'Color'),('AI568 Roughness',split.outputs['Red'],'Value'),('AI568 Texture AO',split.outputs['Blue'],'Value'),('AI568 World Normal',textures['normal'].outputs['Color'],'Color')]:
                aov=nodes.new('ShaderNodeOutputAOV');aov.aov_name=name;links.new(socket,aov.inputs[kind])
            mat['bus_sim_surface_material']=json.dumps(record)
        audit.append({'object':obj.name,'slots':len(obj.material_slots),'size':[record['width'],record['height']],'pixelsPerMeter':record['pixelsPerMeter'],'aoPolicy':record['aoPolicy']})
    for layer in bpy.context.scene.view_layers:
        for name,kind in [('AI568 Base Color','COLOR'),('AI568 Roughness','VALUE'),('AI568 Texture AO','VALUE'),('AI568 World Normal','COLOR')]:
            aov=layer.aovs.add();aov.name=name;aov.type=kind
    return audit
