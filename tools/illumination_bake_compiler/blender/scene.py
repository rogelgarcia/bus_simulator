"""Clean-scene creation and explicit deterministic Cycles CPU configuration."""

from __future__ import annotations

import platform
from dataclasses import dataclass
from typing import Any

from bsib import PINNED_ARCHIVE_SHA256
from canonical import require_sha256
from errors import fail


EXPECTED_VERSION = (5, 2, 1)
EXPECTED_VERSION_STRING = "5.2.1 LTS"
EXPECTED_BUILD_HASH = "9e2066aef7ef"
PROFILE_ID = "ai529.cycles_cpu_fixture_promotion.v1"


@dataclass(frozen=True)
class BakeProfile:
    data: dict[str, Any]

    @classmethod
    def from_mapping(cls, value: Any) -> "BakeProfile":
        return cls(_validate_profile(value))

    @property
    def adaptive_sampling(self) -> bool:
        return self.data["sampling"]["adaptiveSampling"]

    @property
    def ao_distance_meters(self) -> float:
        return 3.0

    @property
    def bake_margin_pixels(self) -> int:
        return self.data["bake"]["marginPixels"]

    @property
    def frame(self) -> int:
        return self.data["frame"]

    @property
    def resolution(self) -> int:
        return self.data["bake"]["resolution"]

    @property
    def samples(self) -> int:
        return self.data["sampling"]["samples"]

    @property
    def seed(self) -> int:
        return self.data["sampling"]["seed"]

    @property
    def thread_count(self) -> int:
        return self.data["backend"]["threads"]


def assert_blender_runtime(expected_archive_sha256: str) -> dict[str, Any]:
    import bpy

    archive_sha256 = require_sha256(expected_archive_sha256, "Blender archive hash")
    build_hash = _text(bpy.app.build_hash)
    build_platform = _text(getattr(bpy.app, "build_platform", b""))
    machine = platform.machine().lower()
    if tuple(bpy.app.version) != EXPECTED_VERSION or bpy.app.version_string != EXPECTED_VERSION_STRING:
        fail("blender_version_mismatch", "AI 529 requires exactly Blender 5.2.1.", expected=EXPECTED_VERSION_STRING, actual=bpy.app.version_string)
    if build_hash != EXPECTED_BUILD_HASH:
        fail("blender_build_hash_mismatch", "The Blender build hash is not the pinned official build.", expected=EXPECTED_BUILD_HASH, actual=build_hash)
    if archive_sha256 != PINNED_ARCHIVE_SHA256:
        fail("blender_archive_hash_mismatch", "The verified portable archive hash is not the pinned AI 529 archive.", expected=PINNED_ARCHIVE_SHA256, actual=archive_sha256)
    if platform.system() != "Windows" or machine not in ("amd64", "x86_64") or build_platform != "Windows":
        fail("blender_platform_mismatch", "The authoritative compiler requires the official Windows x86_64 build.", system=platform.system(), machine=platform.machine(), buildPlatform=build_platform)
    return {
        "archiveSha256": archive_sha256,
        "backend": "cycles_cpu",
        "blenderBuildHash": build_hash,
        "blenderVersion": list(EXPECTED_VERSION),
        "blenderVersionString": EXPECTED_VERSION_STRING,
        "operatingSystem": "Windows",
        "architecture": "x86_64",
    }


def create_clean_scene(profile: BakeProfile) -> tuple[Any, dict[str, Any]]:
    import bpy

    thread_count = profile.thread_count
    sampling = profile.data["sampling"]
    paths = profile.data["paths"]
    scene_profile = profile.data["scene"]
    bake = profile.data["bake"]
    output = profile.data["output"]
    color = profile.data["colorManagement"]
    lighting = profile.data["lighting"]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = "AI529_Deterministic_Scene"
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.render.threads_mode = "FIXED"
    scene.render.threads = thread_count
    scene.frame_set(profile.frame)
    _set_required(scene.cycles, "seed", profile.seed)
    _set_required(scene.cycles, "use_animated_seed", sampling["animatedSeed"])
    sampling_pattern = _set_known_enum(scene.cycles, "sampling_pattern", (sampling["pattern"],))
    _set_required(scene.cycles, "samples", profile.samples)
    _set_required(scene.cycles, "use_adaptive_sampling", profile.adaptive_sampling)
    _set_required(scene.cycles, "adaptive_threshold", float(sampling["adaptiveThreshold"]))
    _set_required(scene.cycles, "adaptive_min_samples", sampling["adaptiveMinSamples"])
    _set_required(scene.cycles, "time_limit", float(sampling["timeLimitSeconds"]))
    _set_required(scene.cycles, "use_denoising", sampling["denoising"])
    _set_required(scene.cycles, "preview_samples", sampling["previewSamples"])
    _set_required(scene.cycles, "use_preview_denoising", sampling["previewDenoising"])
    _set_required(scene.cycles, "sample_offset", sampling["sampleOffset"])
    _set_required(scene.cycles, "use_sample_subset", sampling["useSampleSubset"])
    _set_required(scene.cycles, "auto_scrambling_distance", sampling["autoScramblingDistance"])
    _set_required(scene.cycles, "scrambling_distance", float(sampling["scramblingDistance"]))
    _set_required(scene.cycles, "use_guiding", sampling["useGuiding"])
    _set_required(scene.cycles, "direct_light_sampling_type", sampling["directLightSamplingType"])
    _set_required(scene.cycles, "max_bounces", paths["maxBounces"])
    _set_required(scene.cycles, "diffuse_bounces", paths["diffuseBounces"])
    _set_required(scene.cycles, "glossy_bounces", paths["glossyBounces"])
    _set_required(scene.cycles, "transmission_bounces", paths["transmissionBounces"])
    _set_required(scene.cycles, "volume_bounces", paths["volumeBounces"])
    _set_required(scene.cycles, "transparent_max_bounces", paths["transparentBounces"])
    _set_required(scene.cycles, "min_light_bounces", paths["minLightBounces"])
    _set_required(scene.cycles, "min_transparent_bounces", paths["minTransparentBounces"])
    _set_required(scene.cycles, "caustics_reflective", scene_profile["causticsReflective"])
    _set_required(scene.cycles, "caustics_refractive", scene_profile["causticsRefractive"])
    _set_required(scene.cycles, "sample_clamp_direct", float(scene_profile["clampDirect"]))
    _set_required(scene.cycles, "sample_clamp_indirect", float(scene_profile["clampIndirect"]))
    _set_required(scene.cycles, "use_light_tree", scene_profile["lightTree"])
    _set_required(scene.render, "use_motion_blur", scene_profile["motionBlur"])
    scene.render.resolution_x = profile.resolution
    scene.render.resolution_y = profile.resolution
    scene.render.resolution_percentage = 100
    scene.render.pixel_aspect_x = 1.0
    scene.render.pixel_aspect_y = 1.0
    scene.render.film_transparent = scene_profile["transparentFilm"]
    scene.render.image_settings.file_format = output["fileFormat"]
    scene.render.image_settings.color_mode = output["colorMode"]
    scene.render.image_settings.color_depth = str(output["colorDepthBits"])
    scene.render.image_settings.exr_codec = output["exrCodec"]
    scene.render.bake.use_clear = bake["clearImage"]
    scene.render.bake.use_selected_to_active = False
    scene.render.bake.margin = profile.bake_margin_pixels
    scene.render.bake.margin_type = bake["marginType"]
    scene.render.bake.target = bake["target"]
    scene.render.bake.use_pass_direct = False
    scene.render.bake.use_pass_indirect = False
    scene.render.bake.use_pass_color = False
    scene.display_settings.display_device = color["displayDevice"]
    scene.view_settings.view_transform = color["viewTransform"]
    scene.view_settings.look = color["look"]
    scene.view_settings.exposure = float(color["exposure"])
    scene.view_settings.gamma = float(color["gamma"])
    scene.view_settings.use_curve_mapping = False
    scene.sequencer_colorspace_settings.name = color["sequencerColorSpace"]
    world = bpy.data.worlds.new("AI529_Declared_World")
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    if background is None:
        fail("world_node_missing", "Factory world nodes did not expose a Background node.")
    background.inputs["Color"].default_value = (*tuple(float(value) for value in lighting["worldColorLinearSrgb"]), 1.0)
    background.inputs["Strength"].default_value = float(lighting["worldStrength"])
    scene.world = world
    scene.camera = None
    profile_record = {
        "alphaCutoutPolicy": "compile_exact_coverage_threshold_to_silhouette_geometry",
        "bakeTarget": bake["target"],
        "colorManagement": "scene_linear_raw_no_display_transform",
        "cyclesDevice": "CPU",
        "depthPrecision": "rgba_float32_openexr_and_canonical_f32le",
        "depthSampling": "orthographic_nearest_visible_surface",
        "dof": False,
        "motionBlur": False,
        "profileId": profile.data["id"],
        "samplingPattern": sampling_pattern,
        "threadCount": thread_count,
        "uvOrigin": "lower_left",
        "world": "explicit_profile_linear_color_and_strength",
    }
    return scene, profile_record


def configure_camera_determinism(camera: Any) -> None:
    camera.data.dof.use_dof = False
    camera.data.lens = 50.0
    camera.data.shift_x = 0.0
    camera.data.shift_y = 0.0


def _set_required(owner: Any, name: str, value: Any) -> None:
    if not hasattr(owner, name):
        fail("blender_property_missing", "The pinned Blender build lacks a required deterministic property.", property=name)
    try:
        setattr(owner, name, value)
    except Exception as error:
        fail("blender_property_rejected", "The pinned Blender build rejected a required deterministic value.", property=name, value=value, reason=str(error))
    if getattr(owner, name) != value:
        fail("blender_property_not_applied", "A required deterministic Blender value did not remain applied.", property=name, expected=value, actual=getattr(owner, name))


def _set_known_enum(owner: Any, name: str, accepted: tuple[str, ...]) -> str:
    if not hasattr(owner, name):
        fail("blender_property_missing", "The pinned Blender build lacks a required deterministic enum.", property=name)
    errors: dict[str, str] = {}
    for value in accepted:
        try:
            setattr(owner, name, value)
            if getattr(owner, name) == value:
                return value
        except Exception as error:
            errors[value] = str(error)
    fail("blender_enum_unsupported", "The pinned Blender build exposes no accepted Classic/Owen-Sobol sampler enum.", property=name, accepted=list(accepted), errors=errors)


def _text(value: Any) -> str:
    return value.decode("ascii", "strict") if isinstance(value, bytes) else str(value)


def _validate_profile(value: Any) -> dict[str, Any]:
    _assert_keys(value, {"alpha", "backend", "bake", "camera", "colorManagement", "frame", "id", "jobs", "lighting", "output", "passes", "paths", "sampling", "scene", "schema"}, "profile")
    shapes = {
        "alpha": {"backgroundDepthSentinel", "cutoutThreshold", "emptyCoverage", "opaqueCoverage"},
        "backend": {"authoritative", "cyclesDevice", "engine", "gpuAllowed", "threads", "threadsMode"},
        "bake": {"clearImage", "marginPixels", "marginType", "resolution", "target", "uvLayer"},
        "camera": {"clipEndMeters", "clipStartMeters", "depthUnits", "orthographicScaleMeters", "projection", "transform"},
        "colorManagement": {"displayDevice", "exposure", "gamma", "look", "sequencerColorSpace", "viewTransform"},
        "lighting": {"receiverColorPolicy", "sunAngleRadians", "sunColorLinearSrgb", "sunDirectionBlender", "sunEnergy", "worldColorLinearSrgb", "worldStrength"},
        "output": {"authoritativeColorSpace", "canonicalDirectory", "canonicalPixelEncoding", "colorDepthBits", "colorMode", "exrCodec", "fileFormat", "lossy", "pathPolicy", "rawDirectory", "rowOrigin"},
        "passes": {"ambientOcclusion", "diffuseDirect", "diffuseIndirect", "shadowBakeForbidden"},
        "paths": {"diffuseBounces", "glossyBounces", "maxBounces", "minLightBounces", "minTransparentBounces", "transmissionBounces", "transparentBounces", "volumeBounces"},
        "sampling": {"adaptiveMinSamples", "adaptiveSampling", "adaptiveThreshold", "animatedSeed", "autoScramblingDistance", "denoising", "directLightSamplingType", "pattern", "previewDenoising", "previewSamples", "sampleOffset", "samples", "scramblingDistance", "seed", "timeLimitSeconds", "useGuiding", "useSampleSubset"},
        "scene": {"causticsReflective", "causticsRefractive", "clampDirect", "clampIndirect", "depthOfField", "lightTree", "motionBlur", "objectOrder", "proceduralRandomness", "transparentFilm"},
    }
    for name, keys in shapes.items():
        _assert_keys(value.get(name), keys, f"profile.{name}")
    _assert_keys(value["camera"].get("transform"), {"location", "rotationEulerRadians"}, "profile.camera.transform")
    backend = value["backend"]
    sampling = value["sampling"]
    bake = value["bake"]
    output = value["output"]
    scene = value["scene"]
    required_jobs = ["sun_depth_position", "diffuse_direct", "diffuse_indirect", "ambient_occlusion", "transform_normal_uv_alpha", "channel_isolation"]
    conditions = {
        "schema": value["schema"] == "bus-sim-illumination-compiler-profile-v1",
        "id": isinstance(value["id"], str) and value["id"].startswith("ai529.proof.cycles_cpu.threads_"),
        "backend": backend.get("authoritative") is True and backend.get("engine") == "CYCLES" and backend.get("cyclesDevice") == "CPU" and backend.get("gpuAllowed") is False and backend.get("threadsMode") == "FIXED" and _positive_int(backend.get("threads")),
        "sampling": sampling.get("adaptiveSampling") is False and sampling.get("animatedSeed") is False and sampling.get("denoising") is False and sampling.get("previewDenoising") is False and sampling.get("timeLimitSeconds") == 0 and sampling.get("useGuiding") is False and sampling.get("useSampleSubset") is False and sampling.get("pattern") == "TABULATED_SOBOL" and sampling.get("directLightSamplingType") == "MULTIPLE_IMPORTANCE_SAMPLING",
        "bake": bake.get("target") == "IMAGE_TEXTURES" and bake.get("marginType") == "ADJACENT_FACES" and bake.get("clearImage") is True and bake.get("uvLayer") == "uv_proof" and _positive_int(bake.get("resolution")) and _nonnegative_int(bake.get("marginPixels")),
        "output": output.get("authoritativeColorSpace") == "scene-linear-linear-srgb" and output.get("canonicalPixelEncoding") == "float32_little_endian_rgba_lower_left_v1" and output.get("colorDepthBits") == 32 and output.get("colorMode") == "RGBA" and output.get("fileFormat") == "OPEN_EXR" and output.get("lossy") is False and output.get("rowOrigin") == "lower_left" and output.get("pathPolicy") == "stage_relative_stable_job_id",
        "passes": value["passes"] == {"ambientOcclusion": "AO", "diffuseDirect": ["DIRECT"], "diffuseIndirect": ["INDIRECT"], "shadowBakeForbidden": True},
        "jobs": value["jobs"] == required_jobs,
        "scene": scene.get("objectOrder") == "stable_id_ascending" and scene.get("proceduralRandomness") == "forbidden_or_seeded",
        "camera": value["camera"].get("projection") == "orthographic" and value["camera"].get("depthUnits") == "meters",
        "lighting": value["lighting"].get("receiverColorPolicy") == "unit_diffuse_white",
        "alpha": value["alpha"].get("emptyCoverage") == 0 and value["alpha"].get("opaqueCoverage") == 1,
    }
    for field, valid in conditions.items():
        if not valid:
            fail("compiler_profile_unsupported", "Compiler profile violates the pinned proof contract.", field=field)
    for field in ("previewSamples", "samples", "sampleOffset", "seed", "adaptiveMinSamples"):
        if not _nonnegative_int(sampling.get(field)):
            fail("compiler_profile_value_invalid", "A sampling integer is invalid.", field=field)
    for field, count in value["paths"].items():
        if not _nonnegative_int(count):
            fail("compiler_profile_value_invalid", "A path-bounce count is invalid.", field=field)
    for path, vector in (("camera.transform.location", value["camera"]["transform"]["location"]), ("camera.transform.rotationEulerRadians", value["camera"]["transform"]["rotationEulerRadians"]), ("lighting.sunColorLinearSrgb", value["lighting"]["sunColorLinearSrgb"]), ("lighting.sunDirectionBlender", value["lighting"]["sunDirectionBlender"]), ("lighting.worldColorLinearSrgb", value["lighting"]["worldColorLinearSrgb"])):
        if not isinstance(vector, list) or len(vector) != 3 or any(not isinstance(component, (int, float)) or isinstance(component, bool) for component in vector):
            fail("compiler_profile_vector_invalid", "Compiler profile contains an invalid finite vector.", path=path)
    return value


def _assert_keys(value: Any, expected: set[str], label: str) -> None:
    if not isinstance(value, dict) or set(value) != expected:
        fail("compiler_profile_shape_invalid", "Compiler profile object has missing or unknown fields.", path=label, expected=sorted(expected), actual=sorted(value) if isinstance(value, dict) else None)


def _positive_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def _nonnegative_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0
