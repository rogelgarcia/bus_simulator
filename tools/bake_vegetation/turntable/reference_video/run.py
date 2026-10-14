# Produces checked per-shot clips, then orders all full trees before the close-up chapter.
import hashlib
import importlib.util
import json
import sys
import time
from pathlib import Path
import bpy

here=Path(__file__).parent
for folder in [here.parent.parent/'enhanced_reference',here.parent.parent/'lod0',here.parent]:sys.path.insert(0,str(folder))
from common import write_json
from run import video_settings
spec=importlib.util.spec_from_file_location('reference_video_scene',here/'scene.py')
presentation=importlib.util.module_from_spec(spec);spec.loader.exec_module(presentation)
SHOTS=list(presentation.SHOTS)


def sha(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()


def ordered(models):
    return [(model,'full') for model in models]+[(model,shot) for model in models for shot in SHOTS[1:]]


def validate_clip(file,row,options):
    if row['renderIdentity']!=options['renderIdentity'] or sha(file)!=row['sha256']:raise RuntimeError('Clip identity mismatch: '+str(file))
    clip=bpy.data.movieclips.load(str(file),check_existing=False)
    try:
        if clip.frame_duration!=row['frames'] or list(clip.size)!=[options['width'],options['width']*9//16]:raise RuntimeError('Incomplete or incorrectly sized clip')
    finally:bpy.data.movieclips.remove(clip)


def produce(options):
    for model,shot in ordered(options['models']):
        directory=Path(options['output'])/model['id'].split('/')[-1]/shot;directory.mkdir(parents=True,exist_ok=True)
        record=directory/'clip.json';movie=directory/'clip.mp4'
        if options['phase']=='render' and record.exists():
            validate_clip(movie,json.loads(record.read_text()),options);print('[Reference video] Reusing '+str(directory),flush=True);continue
        if options['phase']=='render':
            proof=json.loads((directory/'proof.json').read_text())
            if proof['renderIdentity']!=options['renderIdentity'] or proof['sourceSha256']!=model['sha256']:raise RuntimeError('Matching proof frames are required')
            for image in proof['images']:
                if sha(directory/image['file'])!=image['sha256']:raise RuntimeError('Proof image changed')
        started=time.time();scene,report=presentation.prepare(options,model,shot)
        report['renderIdentity']=options['renderIdentity']
        if options['phase']=='prepare':
            video_settings(scene,directory/'clip_')
            bpy.ops.wm.save_as_mainfile(filepath=str(directory/'scene.blend'))
            write_json(directory/'scene.json',report)
        elif options['phase']=='proof':
            scene.render.image_settings.media_type='IMAGE';scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB'
            frames=[1,1+scene.frame_end//2] if shot=='full' else [1,scene.frame_end]
            images=[]
            for frame in frames:
                scene.frame_set(frame);file=directory/f'proof_{frame:04d}.png';scene.render.filepath=str(file);bpy.ops.render.render(write_still=True)
                images.append({'file':file.name,'frame':frame,'sha256':sha(file)})
            write_json(directory/'proof.json',{**report,'images':images,'elapsedSeconds':time.time()-started})
        else:
            video_settings(scene,directory/'clip_')
            bpy.ops.wm.save_as_mainfile(filepath=str(directory/'scene.blend'))
            bpy.ops.render.render(animation=True)
            generated=directory/f'clip_{scene.frame_start:04d}-{scene.frame_end:04d}.mp4'
            if not generated.is_file():raise RuntimeError('Expected rendered clip: '+str(generated))
            if movie.exists():raise RuntimeError('Unverified movie already exists; preserve it and use a new output')
            generated.replace(movie)
            row={**report,'file':str(movie.relative_to(options['output'])).replace('\\','/'),'sha256':sha(movie),'elapsedSeconds':time.time()-started}
            validate_clip(movie,row,options);write_json(record,row)
        print(f'[Reference video] {model["id"]} / {shot} / {options["phase"]}: {time.time()-started:.1f}s',flush=True)


def assemble(options):
    bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene
    scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=options['width'];scene.render.resolution_y=options['width']*9//16
    scene.render.resolution_percentage=100;scene.render.fps=options['fps'];scene.render.threads_mode='FIXED';scene.render.threads=options['threads']
    scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.render.use_sequencer=True;scene.render.use_compositing=False
    editor=scene.sequence_editor_create();cursor=1;chapters=[]
    for model,shot in ordered(options['models']):
        directory=Path(options['output'])/model['id'].split('/')[-1]/shot
        row=json.loads((directory/'clip.json').read_text());file=Path(options['output'])/row['file'];validate_clip(file,row,options)
        if row['sourceSha256']!=model['sha256'] or row['sourceId']!=model['id'] or row['shot']!=shot:raise RuntimeError('Unexpected chapter source')
        strip=editor.strips.new_movie(row['sourceId']+' / '+shot,str(file),channel=1,frame_start=cursor)
        if strip.frame_duration!=row['frames']:raise RuntimeError('Sequence duration mismatch')
        chapters.append({**row,'startSeconds':(cursor-1)/options['fps']});cursor+=row['frames']
    scene.frame_start=1;scene.frame_end=cursor-1;destination=Path(options['output'])
    final=destination/'showcase.mp4'
    if final.exists():raise RuntimeError('Final movie already exists; preserve it and use a new output')
    video_settings(scene,destination/'showcase_');bpy.ops.wm.save_as_mainfile(filepath=str(destination/'edit.blend'));bpy.ops.render.render(animation=True)
    (destination/f'showcase_0001-{scene.frame_end:04d}.mp4').replace(final)
    row={'file':final.name,'sha256':sha(final),'renderIdentity':options['renderIdentity'],'frames':scene.frame_end,'fps':options['fps'],
         'durationSeconds':scene.frame_end/options['fps'],'width':options['width'],'height':options['width']*9//16,
         'engine':'BLENDER_EEVEE','representation':'enhanced-reference','chapters':chapters}
    validate_clip(final,row,options);write_json(destination/'video.json',row)
    print('[Reference video] Validated '+str(final),flush=True)


options=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text())
if options['phase']=='assemble':assemble(options)
else:produce(options)
