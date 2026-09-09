"""One-sun source ownership and measured relative sky irradiance for Cycles."""
import bpy, math, json, sys
import numpy as np
from pathlib import Path
from mathutils import Vector
from lighting_scales import scale_emission

Y709=np.array([.2126,.7152,.0722])
def image_array(image):
    pixels=np.empty(image.size[0]*image.size[1]*4,dtype=np.float32);image.pixels.foreach_get(pixels)
    return pixels.reshape(image.size[1],image.size[0],4)
def irradiance(rgba):
    h,w=rgba.shape[:2];latitude=((np.arange(h)+.5)/h-.5)*math.pi
    weights=np.maximum(np.sin(latitude),0)*np.cos(latitude)*(math.pi/h)*(2*math.pi/w)
    return (rgba[:,:,:3]*weights[:,None,None]).sum(axis=(0,1))
def make_image(name,rgba,output):
    image=bpy.data.images.new(name,width=rgba.shape[1],height=rgba.shape[0],alpha=True,float_buffer=True)
    image.colorspace_settings.name='Linear Rec.709';image.pixels.foreach_set(rgba.astype(np.float32).ravel());image.filepath_raw=str(output/name)+'.exr';image.file_format='OPEN_EXR';image.save();return image
def setup_environments(scene, source, lighting, output):
    output=Path(output);output.mkdir(parents=True,exist_ok=True)
    az=math.radians(source['atmosphere']['sun']['azimuthDeg']);el=math.radians(source['atmosphere']['sun']['elevationDeg'])
    sun_three=Vector((math.cos(el)*math.sin(az),math.sin(el),math.cos(el)*math.cos(az)))
    sun=Vector((sun_three.x,-sun_three.z,sun_three.y))
    # Sample the actual Nishita world using a separate empty panoramic scene.
    probe=bpy.data.scenes.new('Environment calibration');probe.render.engine='CYCLES';probe.cycles.samples=1;probe.cycles.use_denoising=False
    probe.render.resolution_x=512;probe.render.resolution_y=256;probe.render.resolution_percentage=100
    camera=bpy.data.objects.new('Environment sensor',bpy.data.cameras.new('Environment sensor'));probe.collection.objects.link(camera);probe.camera=camera
    camera.data.type='PANO';camera.data.panorama_type='EQUIRECTANGULAR';camera.rotation_euler=(math.pi/2,0,0)
    world=bpy.data.worlds.new('Nishita calibration');world.use_nodes=True;probe.world=world
    sky=world.node_tree.nodes.new('ShaderNodeTexSky');sky.sky_type='SINGLE_SCATTERING';sky.sun_disc=False;sky.sun_elevation=el;sky.sun_rotation=math.atan2(sun.y,sun.x);sky.altitude=.1;sky.air_density=1;sky.aerosol_density=1;sky.ozone_density=1
    world.node_tree.links.new(sky.outputs['Color'],world.node_tree.nodes.get('Background').inputs['Color'])
    env_file=output/'nishita_sensor.exr';probe.render.filepath=str(env_file);probe.render.image_settings.file_format='OPEN_EXR';probe.render.image_settings.color_depth='32'
    bpy.ops.render.render(scene=probe.name,write_still=True)
    measured=bpy.data.images.load(str(env_file),check_existing=False);measured.colorspace_settings.name='Linear Rec.709';measured_sky=float(irradiance(image_array(measured))@Y709)
    if measured_sky<=0:raise RuntimeError('Nishita irradiance sensor failed')
    raw=bpy.data.images.load(source['hdri'],check_existing=False);raw.colorspace_settings.name='Linear Rec.709';rgba=image_array(raw)
    # Use maintained photographed-sun separation, preserving original HDR data.
    root=Path(__file__).resolve().parents[4]
    sys.path.insert(0,str(root/'receiver_lightmaps'/'blender'))
    from environment_sun import separate_environment_sun
    separated,solar=separate_environment_sun(rgba,lighting['hdri']['solarRemovalRadiusDegrees'])
    sky_image=make_image('photographic_sky_without_solar_disc',separated,output)
    hdr_sky=float(irradiance(separated)@Y709)
    h,w=128,256;lat=((np.arange(h)+.5)/h-.5)*math.pi
    over=np.ones((h,w,4),np.float32);level=np.where(lat>0,(1+2*np.sin(lat))/3,.12)
    over[:,:,:3]=level[:,None,None]*np.array([.95,.98,1.0])[None,None,:]
    overcast=make_image('overcast_relative_sky',over,output)
    # Match the game's camera-only procedural base/haze, without optical glare.
    settings=source['atmosphere'];sky_settings=settings['sky'];haze=settings['haze']
    def linear_hex(value):
        v=np.array([int(value[i:i+2],16)/255 for i in (1,3,5)])
        return np.where(v<=.04045,v/12.92,((v+.055)/1.055)**2.4)
    camera_lat=((np.arange(2048)+.5)/2048-.5)*math.pi
    y=np.sin(camera_lat);t=np.maximum(y,0)**sky_settings['curve'];horizon=linear_hex(sky_settings['horizonColor']);zenith=linear_hex(sky_settings['zenithColor']);ground=linear_hex(sky_settings['groundColor'])
    base=horizon[None,:]*(1-t[:,None])+zenith[None,:]*t[:,None];g=np.clip(-y/.18,0,1);g=g*g*(3-2*g);base=base*(1-g[:,None])+ground[None,:]*g[:,None]
    if haze['enabled']:
        weight=np.clip(np.exp(-(t/max(1e-4,haze['thickness']))**haze['curve'])*haze['intensity'],0,1);tint=(1-haze['tintStrength'])+linear_hex(haze['tintColor'])*haze['tintStrength'];base=base*(1-weight[:,None])+tint[None,:]*weight[:,None]
    camera_sky=np.ones((2048,4,4),np.float32);camera_sky[:,:,:3]=base[:,None,:]*sky_settings['exposure'];source_sky=make_image('source_camera_sky',camera_sky,output)
    result={'sun':list(sun),'sunThree':list(sun_three),'nishitaIrradiance':measured_sky,'hdrIrradiance':hdr_sky,
        'overcastIrradiance':float(irradiance(over)@Y709),'solarSeparation':solar,
        'policy':'Relative calibration against integrated diffuse-horizontal sky radiance. No asserted watts-to-lux conversion.',
        'sunSourceIntensity':source['lighting']['sunIntensity'],'images':{'photographic':sky_image.name,'overcast':overcast.name,'sourceCamera':source_sky.name}}
    bpy.data.scenes.remove(probe);bpy.data.objects.remove(camera,do_unlink=True)
    return result

def apply_lighting(scene,source,config,preset,calibration):
    radiance_scale=preset.get('radianceScale',1)
    environment_scale=preset.get('environmentMultiplier',1)*radiance_scale
    scale_emission(radiance_scale)
    for obj in list(scene.objects):
        if obj.type=='LIGHT':bpy.data.objects.remove(obj,do_unlink=True)
    world=bpy.data.worlds.new('World_'+preset['id']);world.use_nodes=True;scene.world=world
    nodes,links=world.node_tree.nodes,world.node_tree.links;nodes.clear()
    output=nodes.new('ShaderNodeOutputWorld');background=nodes.new('ShaderNodeBackground');links.new(background.outputs[0],output.inputs['Surface'])
    target=config['calibration']['skyIrradianceTarget']*preset['skyScale'];kind=preset['environment'];sun=Vector(calibration['sun'])
    if kind=='nishita':
        sky=nodes.new('ShaderNodeTexSky');sky.sky_type='SINGLE_SCATTERING';sky.sun_disc=False;sky.sun_elevation=math.asin(sun.z);sky.sun_rotation=math.atan2(sun.y,sun.x);sky.altitude=.1;sky.air_density=1;sky.aerosol_density=1;sky.ozone_density=1
        links.new(sky.outputs['Color'],background.inputs['Color']);background.inputs['Strength'].default_value=target/calibration['nishitaIrradiance']
    else:
        texture=nodes.new('ShaderNodeTexEnvironment');texture.image=bpy.data.images[calibration['images']['overcast' if kind=='overcast' else 'photographic']]
        if kind=='hdri':
            # Rotate sun-separated texture about vertical to align its photographed solar azimuth.
            d=calibration['solarSeparation']['directionThree'];native=Vector((d[0],-d[2],d[1]));delta=math.atan2(sun.y,sun.x)-math.atan2(native.y,native.x)
            coords=nodes.new('ShaderNodeTexCoord');rotate=nodes.new('ShaderNodeVectorRotate');rotate.rotation_type='AXIS_ANGLE';rotate.inputs['Axis'].default_value=(0,0,1);rotate.inputs['Angle'].default_value=-delta
            links.new(coords.outputs['Generated'],rotate.inputs['Vector']);links.new(rotate.outputs['Vector'],texture.inputs['Vector'])
        links.new(texture.outputs['Color'],background.inputs['Color'])
        if kind=='source':
            # Hemispherical game irradiance has no unique environment inverse; retain a disclosed uniform fill equivalent.
            hemi=next((light for light in source['lights'] if light['type']=='HemisphereLight'),None)
            fill=np.array(hemi['color'] if hemi else [1,1,1])*source['lighting']['hemiIntensity']/math.pi
            mix=nodes.new('ShaderNodeMixRGB');mix.blend_type='ADD';mix.inputs[0].default_value=1;mix.inputs[2].default_value=(*fill,1)
            scale=nodes.new('ShaderNodeVectorMath');scale.operation='SCALE';scale.inputs[3].default_value=source['lighting']['ibl']['envMapIntensity']
            links.new(texture.outputs['Color'],scale.inputs[0]);links.new(scale.outputs[0],mix.inputs[1]);links.new(mix.outputs[0],background.inputs['Color']);background.inputs['Strength'].default_value=1
        else:background.inputs['Strength'].default_value=target/calibration['overcastIrradiance' if kind=='overcast' else 'hdrIrradiance']
    background.inputs['Strength'].default_value*=environment_scale
    if preset['sun']!='none':
        light=bpy.data.lights.new('Single Sun','SUN');obj=bpy.data.objects.new('Single Sun',light);scene.collection.objects.link(obj)
        obj.rotation_euler=(-sun).to_track_quat('-Z','Y').to_euler();light.energy=source['lighting']['sunIntensity'] if preset['sun']=='source' else config['calibration']['sunReference']
        light.angle=math.radians(preset.get('sunDiameterDegrees',.53));light.color=(1,1,1)
        light.energy*=preset.get('sunMultiplier',1)*radiance_scale
    if kind=='source':
        camera_texture=nodes.new('ShaderNodeTexEnvironment');camera_texture.image=bpy.data.images[calibration['images']['sourceCamera']]
        camera_background=nodes.new('ShaderNodeBackground');links.new(camera_texture.outputs['Color'],camera_background.inputs['Color'])
        camera_background.inputs['Strength'].default_value=environment_scale
        path=nodes.new('ShaderNodeLightPath');mix=nodes.new('ShaderNodeMixShader');links.new(path.outputs['Is Camera Ray'],mix.inputs[0]);links.new(background.outputs[0],mix.inputs[1]);links.new(camera_background.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],output.inputs['Surface'])
    return {'preset':preset,'skyHorizontalTargetRelative':target,'sunEnergyRelative':0 if preset['sun']=='none' else light.energy,
        'sunDirectionBlender':list(sun),'skyStrength':background.inputs['Strength'].default_value,
        'limits':['L00 hemisphere uses uniform-fill inverse approximation; camera sky retains the source base/haze without optical glare. Ray-traced bounces differ from the game.',
                  'L04 retains the photographed diffuse environment, azimuth aligned; its original solar disc/halo is removed and the one explicit source sun owns direct light.']}
