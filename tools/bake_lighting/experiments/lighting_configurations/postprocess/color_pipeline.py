"""Scene-linear inputs, explicit display transforms, and image metadata helpers."""
import json, hashlib, os
from pathlib import Path
import numpy as np
import OpenImageIO as oiio
import PyOpenColorIO as ocio
oiio.attribute('threads',max(1,min(6,(os.cpu_count() or 2)//2)))

Y=np.array([.2126,.7152,.0722],dtype=np.float32)
def pass_indices(names,suffix,channels,optional=False,layer=None):
    indices=[]
    for channel in channels:
        ending=suffix+'.'+channel
        found=[i for i,name in enumerate(names) if (layer is not None and name==layer+'.'+ending) or (layer is None and (name.endswith('.'+ending) or name==ending))]
        if not found:
            if optional:return None
            raise RuntimeError(f'Missing {layer or "unique layer"}.{ending}')
        if len(found)!=1:raise RuntimeError(f'Ambiguous {ending}; specify a camera layer')
        indices.append(found[0])
    return indices

class ExrPasses:
    """Decode one pose once; avoid decompressing a multilayer image for every lobe."""
    def __init__(self,file,layer):
        image=oiio.ImageInput.open(str(file))
        if not image:raise RuntimeError(f'Cannot open {file}: {oiio.geterror()}')
        try:
            self.names=list(image.spec().channelnames);self.layer=layer
            if any(not name.startswith(layer+'.') for name in self.names):
                raise RuntimeError(f'{file} contains unrelated render layers; regenerate it')
            self.pixels=image.read_image(format=oiio.FLOAT)
            if self.pixels is None:raise RuntimeError(f'Cannot decode {file}: {image.geterror()}')
        finally:image.close()
    def read(self,suffix='Combined',optional=False,channels=('R','G','B')):
        indices=pass_indices(self.names,suffix,channels,optional,self.layer)
        return None if indices is None else np.ascontiguousarray(self.pixels[:,:,indices])

def read_pass(file, suffix='Combined', optional=False,channels=('R','G','B'),layer=None):
    image=oiio.ImageInput.open(str(file))
    if not image:raise RuntimeError('Cannot read '+str(file))
    try:
        indices=pass_indices(list(image.spec().channelnames),suffix,channels,optional,layer)
        if indices is None:return None
        start,end=min(indices),max(indices)+1
        pixels=image.read_image(0,0,start,end,oiio.FLOAT)
        if pixels is None:raise RuntimeError(f'Cannot decode {file}, {suffix}: {image.geterror()}')
        return np.ascontiguousarray(pixels[:,:,[i-start for i in indices]])
    finally:image.close()
def write_png(file,rgb,depth=8):
    dtype=np.uint8 if depth==8 else np.uint16;scale=255 if depth==8 else 65535
    data=np.rint(np.clip(rgb,0,1)*scale).astype(dtype);out=oiio.ImageOutput.create(str(file));spec=oiio.ImageSpec(data.shape[1],data.shape[0],3,oiio.UINT8 if depth==8 else oiio.UINT16)
    spec.attribute('oiio:ColorSpace','sRGB');spec.attribute('png:compressionLevel',1);out.open(str(file),spec);out.write_image(data);out.close()
def srgb_encode(rgb):return np.where(rgb<=.0031308,12.92*rgb,1.055*np.maximum(rgb,0)**(1/2.4)-.055)
def srgb_decode(rgb):return np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
def three_aces(rgb,multiplier):
    # Three.js r183 ACESFilmic/RRTAndODTFit matrices and rational fit (MIT).
    a=np.array([[.59719,.35458,.04823],[.076,.90834,.01566],[.02840,.13383,.83777]],np.float32)
    b=np.array([[1.60475,-.53108,-.07367],[-.10208,1.10813,-.00605],[-.00327,-.07276,1.07602]],np.float32)
    value=(rgb*(multiplier/.6))@a.T
    value=(value*(value+.0245786)-.000090537)/(value*(.983729*value+.432951)+.238081)
    return srgb_encode(np.clip(value@b.T,0,1))
def display(rgb,recipe,stops,color_config,ocio_config,grade=None):
    value=np.ascontiguousarray(rgb*(2.0**stops),dtype=np.float32)
    if grade:value*=np.array(grade['rgbGain'],np.float32)
    if recipe['type']=='three_aces_filmic':encoded=three_aces(value,recipe['exposureMultiplier'])
    else:
        transform=ocio.DisplayViewTransform(src=color_config['workingSpace'],display=color_config['display'],view=recipe['view'])
        if grade and grade.get('look'):
            transform=ocio.GroupTransform([ocio.LookTransform(src=color_config['workingSpace'],dst=color_config['workingSpace'],looks=grade['look']),transform])
        processor=ocio_config.getProcessor(transform).getDefaultCPUProcessor()
        encoded=value.copy();processor.applyRGB(encoded.reshape(-1,3))
    if grade and grade['saturation']!=1:
        linear=srgb_decode(np.maximum(encoded,0));luma=(linear@Y)[:,:,None];encoded=srgb_encode(luma+(linear-luma)*grade['saturation'])
    return np.clip(encoded,0,1)
def sha(file):
    h=hashlib.sha256()
    with open(file,'rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()
def save_json(file,value):
    file=Path(file);file.parent.mkdir(parents=True,exist_ok=True);temp=file.with_suffix(file.suffix+'.partial');temp.write_text(json.dumps(value,indent=2));temp.replace(file)
