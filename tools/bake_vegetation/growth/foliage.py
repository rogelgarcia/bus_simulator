# Transports canopy anchors and rigid leaves with wood while keeping twig endpoints connected.
import hashlib
import numpy as np
from mathutils import Euler,Matrix,Vector


def retained_signature(obj):
    h=hashlib.sha256();mesh=obj.data
    forms=np.empty(len(mesh.vertices),np.int32);mesh.attributes['leaf_form'].data.foreach_get('value',forms)
    h.update(forms.tobytes())
    scales=np.empty(len(forms)*3,np.float32);mesh.attributes['leaf_scale'].data.foreach_get('vector',scales)
    h.update(scales.reshape(-1,3)[forms!=8].tobytes())
    colors=np.empty(len(forms)*4,np.float32);mesh.attributes['leaf_tint'].data.foreach_get('color',colors);h.update(colors.tobytes())
    return h.hexdigest()


def transport(obj,field):
    mesh=obj.data;n=len(mesh.vertices);before=retained_signature(obj)
    origins=np.empty(n*3,np.float32);mesh.vertices.foreach_get('co',origins);origins=origins.reshape(-1,3)
    rotations=np.empty(n*3,np.float32);mesh.attributes['leaf_rotation'].data.foreach_get('vector',rotations);rotations=rotations.reshape(-1,3)
    scales=np.empty(n*3,np.float32);mesh.attributes['leaf_scale'].data.foreach_get('vector',scales);scales=scales.reshape(-1,3)
    forms=np.empty(n,np.int32);mesh.attributes['leaf_form'].data.foreach_get('value',forms)
    jac=field.jacobian(origins);u,_,v=np.linalg.svd(jac);polar=u@v
    result=np.empty_like(rotations);twig_error=0
    shifted=field(origins)
    for i,row in enumerate(rotations):
        old=Euler(tuple(row)).to_matrix();new=Matrix(polar[i].tolist())@old
        if forms[i]==8:
            end=origins[i]+np.array(old.col[1])*scales[i,1]
            delta=field(end[None,:])[0]-shifted[i];length=np.linalg.norm(delta)
            direction=Vector(delta/length);new=new.col[1].rotation_difference(direction).to_matrix()@new
            scales[i,1]=length
            twig_error=max(twig_error,float(np.linalg.norm(shifted[i]+np.array(new.col[1])*length-field(end[None,:])[0])))
        result[i]=new.to_euler()
    mesh.vertices.foreach_set('co',shifted.astype(np.float32).ravel())
    mesh.attributes['leaf_rotation'].data.foreach_set('vector',result.ravel())
    mesh.attributes['leaf_scale'].data.foreach_set('vector',scales.ravel());mesh.update()
    after=retained_signature(obj)
    if before!=after or twig_error>1e-5:raise RuntimeError('Canopy shape/count/tint or twig endpoint contract failed')
    return {'leafShapeScaleTintBefore':before,'leafShapeScaleTintAfter':after,'instances':n,
            'maximumTwigEndpointErrorMetres':twig_error,'minimumAnchorJacobian':float(np.linalg.det(jac).min())}
