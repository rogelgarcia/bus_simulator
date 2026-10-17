# city_compose.py -- what every hero COMPOSITION does with the reusable city (AI 651, 2026-10-17).
#
# A composition is a small .blend of its own that LINKS the city (city.blend: its top-level collections and its world,
# by name from site.json) and the hero's building files, finishes the site with block_kit.py, and owns everything the
# city deliberately leaves out: the sun lamp (lamps cannot read the light-scale attribute), the light units, the
# cameras, the film and the building's own wear controls. Nothing of the city is copied, so rebuilding the city
# (build_city.py) reaches every composition the next time it is opened -- no composition rebuild.
#
#   link_city(S, site, furniture)   the city's collections (and SITE_FURNITURE if asked) and its world, linked
#   light_units(S, site, hero)      city_light_scale + exposure on the scene, and the sun lamp at the hero's units
#   film(S, ...)                    Cycles on OptiX, AgX Medium High Contrast, as both legacy scenes have it
#   cameras(S, views, clip)         one camera per view (eye, aim, lens[, frame w:h])
import math
import os

import bpy
from mathutils import Vector

import city_site as CS


def link_city(S, site, furniture=False, city_blend=CS.CITY_BLEND, log=print):
    names = list(site["collections"]["city"]) + ([site["collections"]["site_furniture"]] if furniture else [])
    with bpy.data.libraries.load(city_blend, link=True, relative=True) as (src, dst):
        missing = [n for n in names if n not in src.collections]
        assert not missing, f"the city has no collection(s) {missing}: rebuild it (city/build_city.py)"
        assert site["world"] in src.worlds, f"the city has no world {site['world']}"
        dst.collections = names
        dst.worlds = [site["world"]]
    for c in dst.collections:
        S.collection.children.link(c)
    S.world = dst.worlds[0]
    log(f"CITY: linked {', '.join(f'{c.name} ({len(c.all_objects)})' for c in dst.collections)} and the world "
        f"{S.world.name} from {city_blend}")
    return dst.collections


def light_units(S, site, hero, log=print):
    u = site["light"]["units"][hero]
    S[site["light"]["property"]] = float(u["scale"])
    S.view_settings.exposure = float(u["exposure"])
    sd = bpy.data.lights.new("scene_sun", 'SUN'); sd.energy = float(u["sun"]) * float(u["scale"])
    sd.angle = math.radians(site["sun"].get("angle_deg", 0.53))
    sun = bpy.data.objects.new("scene_sun", sd); S.collection.objects.link(sun)
    d = Vector(CS.sun_direction(site))
    sun.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    log(f"LIGHT: {hero} units, city_light_scale {u['scale']:.4f}, exposure {u['exposure']:.4f}, sun {sd.energy:.2f} at "
        f"azimuth {site['sun']['azimuth_deg']:.1f}, {site['sun']['elevation_deg']:.1f} up")
    return sun


def film(S, samples=128, res=(1920, 1200), pct=100):
    S.render.engine = 'CYCLES'
    try:
        cp = bpy.context.preferences.addons["cycles"].preferences; cp.compute_device_type = "OPTIX"; cp.get_devices()
        for d in cp.devices:
            d.use = d.type in ('OPTIX', 'CPU')
        S.cycles.device = 'GPU'
    except Exception:
        S.cycles.device = 'CPU'
    S.cycles.samples = samples; S.cycles.use_adaptive_sampling = True; S.cycles.adaptive_threshold = 0.01
    S.cycles.use_denoising = True
    try:
        S.cycles.denoiser = 'OPTIX' if S.cycles.device == 'GPU' else 'OPENIMAGEDENOISE'
    except Exception:
        pass
    S.render.film_transparent = False
    S.render.resolution_x, S.render.resolution_y = res
    S.render.resolution_percentage = pct
    S.render.image_settings.file_format = 'PNG'; S.render.image_settings.color_depth = '8'
    S.view_settings.view_transform = 'AgX'; S.view_settings.gamma = 1.0
    try:
        S.view_settings.look = 'AgX - Medium High Contrast'
    except Exception as e:
        print("look not set:", e)


def cameras(S, views, clip, collection=None):
    cams = {}
    col = collection or S.collection
    for nm, view in views.items():
        loc, tgt, lens = view[:3]
        cd = bpy.data.cameras.new(nm); cd.lens = lens; cd.clip_end = clip
        c = bpy.data.objects.new(nm, cd); col.objects.link(c)
        c.location = Vector(loc)
        c.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        if len(view) > 3 and view[3]:
            c["frame"] = list(view[3])
        cams[nm] = c
    return cams


def layer_collection(S, name):
    def walk(lc):
        if lc.collection.name == name:
            return lc
        for ch in lc.children:
            r = walk(ch)
            if r:
                return r
    return walk(S.view_layers[0].layer_collection)
