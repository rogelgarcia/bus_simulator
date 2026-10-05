# Recovers continuous photographic crevice height from the original floating-point scan.
import json
import bpy
import numpy as np
from maps import read_pixels,extend_scan
from materials import bark_material


def prepare_height(root,output):
    catalog=json.loads((root/'tools/bake_vegetation/surfaces/sources.json').read_text())
    source=next(row for key,row in catalog['sources']['bark_platanus']['maps'].items() if '_disp_' in key)
    height=extend_scan(read_pixels(root/source['file'],(2048,2048)))[:,:,0]
    low,high=np.percentile(height,[1,99])
    normalized=np.clip((height-low)/(high-low),0,1)**1.35
    h,w=normalized.shape;rgba=np.ones((h,w,4),np.float32);rgba[:,:,:3]=normalized[:,:,None]
    image=bpy.data.images.new('London plane calibrated photographic crevices',width=w,height=h,alpha=False,float_buffer=True)
    image.colorspace_settings.name='Non-Color';image.pixels.foreach_set(np.ascontiguousarray(rgba[::-1]).ravel())
    target=output/'pbr/london_plane/bark_height.exr';image.filepath_raw=str(target);image.file_format='OPEN_EXR';image.save()
    bpy.data.images.remove(image)
    info={'source':source,'rawHeightPercentiles01and99':[float(low),float(high)],'heightFile':'pbr/london_plane/bark_height.exr',
          'method':'Registered original EXR height, percentile calibration and mild valley expansion; no synthetic surface noise',
          'reliefMetres':.028,'upperStemAttenuation':'Depth falls smoothly to 45 percent toward the upper crown',
          'bakeStatus':'Detailed 3D source plus calibrated floating-point height; optimized mesh normal/AO baking deferred'}
    (output/'relief.json').write_text(json.dumps(info,indent=2)+'\n')
    return info


def plane_surface(output,settings,variant):
    paths={channel:output/'pbr/london_plane'/('bark_'+channel+'.png') for channel in ['color','roughness','height','normal']}
    paths['height']=output/'pbr/london_plane/bark_height.exr'
    settings={**settings,'relief':.028}
    material,surface=bark_material('london_plane/'+variant['id'],paths,settings,variant['seed'])
    for node in material.node_tree.nodes:
        if node.bl_idname=='ShaderNodeBump':node.inputs['Distance'].default_value=.012
    def calibrated(points,normals):
        height,info=surface(points,normals)
        attenuation=.45+.55*np.exp(-np.maximum(points[:,2],0)/(variant['height']*.3))
        return .5+(height-.5)*attenuation,{**info,'surfaceRevision':'calibrated-plane-crevices-v1'}
    return material,calibrated


def lock_projection(obj,coordinates,normals):
    for name,data in [('growth_rest_position',coordinates),('growth_rest_normal',normals)]:
        attr=obj.data.attributes.new(name=name,type='FLOAT_VECTOR',domain='POINT');attr.data.foreach_set('vector',data.astype(np.float32).ravel())
    for material in obj.data.materials:
        nodes,links=material.node_tree.nodes,material.node_tree.links
        position=nodes.new('ShaderNodeAttribute');position.attribute_name='growth_rest_position'
        normal=nodes.new('ShaderNodeAttribute');normal.attribute_name='growth_rest_normal'
        for node in list(nodes):
            socket=None;replacement=None
            if node.bl_idname=='ShaderNodeTexCoord':socket=node.outputs['Object'];replacement=position.outputs['Vector']
            if node.bl_idname=='ShaderNodeVectorTransform' and node.vector_type=='NORMAL':socket=node.outputs['Vector'];replacement=normal.outputs['Vector']
            if socket:
                for link in list(socket.links):links.new(replacement,link.to_socket)
