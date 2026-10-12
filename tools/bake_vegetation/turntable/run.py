# Runs resumable species clips and assembles their checked H.264 movies with Blender's video sequencer.
import hashlib
import json
import sys
import time
from pathlib import Path
import bpy

here=Path(__file__).parent
sys.path.insert(0,str(here.parent/'lod0'));sys.path.insert(0,str(here))
from common import write_json
from scene import studio,NAMES


def video_settings(scene,file):
    scene.render.image_settings.media_type='VIDEO';scene.render.ffmpeg.format='MPEG4';scene.render.ffmpeg.codec='H264'
    scene.render.ffmpeg.constant_rate_factor='HIGH';scene.render.ffmpeg.ffmpeg_preset='GOOD'
    scene.render.ffmpeg.audio_codec='NONE';scene.render.filepath=str(file);scene.render.use_file_extension=True


def inspect(options):
    scene=bpy.context.scene;editor=scene.sequence_editor_create()
    values={name:hasattr(scene.eevee,name) for name in ['taa_render_samples','use_raytracing']}
    values['strips']=hasattr(editor,'strips');values['ffmpeg']=bpy.app.build_options.codec_ffmpeg
    values['mediaTypes']=[v.identifier for v in scene.render.image_settings.bl_rna.properties['media_type'].enum_items]
    write_json(Path(options['output'])/'api.json',values);print('[Turntable] API '+str(values),flush=True)


def render(options):
    for model in options['models']:
        if model['species'] not in options['species']:continue
        directory=Path(options['output'])/model['species'];directory.mkdir(parents=True,exist_ok=True)
        record=directory/'clip.json'
        if options['phase']=='render' and record.exists():
            previous=json.loads(record.read_text());file=directory/previous['file']
            if previous['renderIdentity']==options['renderIdentity'] and file.exists() and hashlib.sha256(file.read_bytes()).hexdigest()==previous['sha256']:
                print('[Turntable] Reusing authenticated clip '+model['species'],flush=True);continue
        scene,report=studio(options,model);started=time.time()
        if options['phase']=='proof':
            scene.render.image_settings.media_type='IMAGE';scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB'
            for frame in [1,1+scene.frame_end//4,1+scene.frame_end//2,1+scene.frame_end*3//4]:
                scene.frame_set(frame);scene.render.filepath=str(directory/f'proof_{frame:04d}.png');bpy.ops.render.render(write_still=True)
            report['elapsedSeconds']=time.time()-started;write_json(directory/'proof.json',report)
        else:
            video_settings(scene,directory/'orbit_');bpy.ops.wm.save_as_mainfile(filepath=str(directory/'showroom.blend'))
            bpy.ops.render.render(animation=True)
            files=list(directory.glob('orbit_*.mp4'))
            if len(files)!=1:raise RuntimeError('Expected one rendered orbit movie')
            report.update(file=files[0].name,sha256=hashlib.sha256(files[0].read_bytes()).hexdigest(),elapsedSeconds=time.time()-started)
            write_json(record,report)
        print(f'[Turntable] {model["species"]} completed in {time.time()-started:.1f}s',flush=True)


def assemble(options):
    bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE'
    scene.render.resolution_x=options['width'];scene.render.resolution_y=options['width']*9//16;scene.render.resolution_percentage=100
    scene.render.fps=options['fps'];scene.render.threads_mode='FIXED';scene.render.threads=2
    scene.view_settings.view_transform='Standard';scene.view_settings.look='None'
    scene.render.use_sequencer=True;scene.render.use_compositing=False
    editor=scene.sequence_editor_create();cursor=1;chapters=[]
    for species in options['species']:
        directory=Path(options['output'])/species;row=json.loads((directory/'clip.json').read_text());file=directory/row['file']
        if row['renderIdentity']!=options['renderIdentity'] or hashlib.sha256(file.read_bytes()).hexdigest()!=row['sha256']:raise RuntimeError('Stale or damaged species clip')
        strip=editor.strips.new_movie(NAMES[species],str(file),channel=1,frame_start=cursor)
        if strip.frame_duration!=row['frames']:raise RuntimeError('Incomplete species video')
        element=strip.elements[0]
        if [element.orig_width,element.orig_height]!=[options['width'],options['width']*9//16]:raise RuntimeError('Video dimensions changed')
        chapters.append({**row,'startSeconds':(cursor-1)/options['fps']});cursor+=row['frames']
    scene.frame_start=1;scene.frame_end=cursor-1
    destination=Path(options['output']);video_settings(scene,destination/'species_showroom_')
    bpy.ops.wm.save_as_mainfile(filepath=str(destination/'edit.blend'));bpy.ops.render.render(animation=True)
    files=list(destination.glob('species_showroom_*.mp4'))
    if len(files)!=1:raise RuntimeError('Expected one assembled movie')
    final=destination/'species_showroom.mp4';files[0].replace(final)
    movie=bpy.data.movieclips.load(str(final))
    if movie.frame_duration!=scene.frame_end or list(movie.size)!=[options['width'],options['width']*9//16]:raise RuntimeError('Final movie validation failed')
    write_json(destination/'video.json',{'file':final.name,'frames':scene.frame_end,'fps':options['fps'],'durationSeconds':scene.frame_end/options['fps'],
        'width':options['width'],'height':options['width']*9//16,'engine':'BLENDER_EEVEE','representation':options['representation'],'chapters':chapters,'sha256':hashlib.sha256(final.read_bytes()).hexdigest()})
    print('[Turntable] Validated final video '+str(final),flush=True)


options=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text())
if options['phase']=='inspect':inspect(options)
elif options['phase']=='closeups':
    from closeups import render_closeups
    render_closeups(options)
elif options['phase']=='assemble':assemble(options)
else:render(options)
