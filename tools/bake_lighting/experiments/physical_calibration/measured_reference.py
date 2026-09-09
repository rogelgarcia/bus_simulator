"""Audit actual photographic data before allowing a synthetic scene to be called a matched measurement."""
import numpy as np
import OpenImageIO as oiio
from cornell_data import read_mat4,extract_images


def audit(directory, output, write_png, three_aces):
    files=extract_images(directory)
    observations=[]
    for file in files:
        image=oiio.ImageInput.open(str(file))
        if not image:
            raise RuntimeError('Unreadable measured EXR')
        data=image.read_image(format=oiio.FLOAT)
        names=list(image.spec().channelnames)
        image.close()
        if names!=['Y'] or not np.isfinite(data).all():
            raise RuntimeError('Unexpected measured camera data')
        preview='measured_'+file.stem+'.png'
        write_png(output/preview,three_aces(np.repeat(np.maximum(data,0),3,axis=2),16))
        observations.append({'file':str(file),'preview':preview,'shape':list(data.shape),'percentiles':np.quantile(data,[0,.01,.5,.9,.99,1]).tolist(),'displayGain':16})
    responses={name:read_mat4(directory/(name+'.mat')) for name in ['source_response','camera_response','filters','lens']}
    spectra={name:{key:{'samples':int(value.size),'min':float(value.min()),'max':float(value.max())} for key,value in arrays.items() if key!='README'} for name,arrays in responses.items()}
    return {'status':'unavailable','dataAcquired':True,'decodedImages':observations,'responseArrays':spectra,
        'reason':'Photographic target equivalence is not established: the measured tall block has a mirror-like face, while the supplied scene table specifies diffuse white blocks. Photograph framing also differs (1280x1024 versus the published square synthetic camera). Exact photographic material/camera parameters are absent. Do not fit exposure or score these as paired renders.',
        'observationBasis':'Inspection of the original 550nm EXR and the original diffuse-scene material/camera tables. This is a reference-identity limitation, not missing downloaded files.',
        'spectralLimitation':'Camera/filter/lens response data extend beyond the published 400-700 nm surface reflectances. A full camera prediction requires validated scene identity and spectral coverage. Center-wavelength monochromatic renders are not filter-integrated photographs.',
        'normalization':'All measured previews use one fixed gain 16 and ACESFilmic solely for inspection. No image-derived gains; no normalized preview is used for a physical score.'}
