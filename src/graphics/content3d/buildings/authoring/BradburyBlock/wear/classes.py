# Material classes: what a wear feature's response keys on. A streak darkens brick and stone but never glass; glass
# grime acts on glass alone; rust gathers on metal. Every material the block renders with is sorted into one class
# here, by name for the ones this project made and by their own properties for the game export's MAT_n materials.
# NONE means the layer leaves that material alone (the wall's hidden faces, the interior backdrops, the roof deck).
import re

NONE, BRICK, TERRACOTTA, STONE, GLASS, METAL, PAINT, WOOD, GLAZED = range(9)
NAMES = ("none", "brick", "terracotta", "stone", "glass", "metal", "paint", "wood", "glazed")
BY_NAME = {n: i for i, n in enumerate(NAMES)}
MASONRY = (BRICK, TERRACOTTA, STONE)          # the facade's own fabric

_SUFFIX = r"(\.\d+)?$"                        # Blender's duplicate suffix (.001) on copies
NAME_RULES = [
    (r"^WEAR_.*", NONE),                                          # the layer's own debug markers
    (r"^WALL_(inner_skin|top_bottom|panel_hidden)" + _SUFFIX, NONE),   # the wall's hidden faces
    (r"^PBR_bradbury_(wall_terracotta_brick_tileable|arch_ring)" + _SUFFIX, BRICK),
    (r"^PBR_bradbury_(terracotta_trim|top_band_terracotta_ornament|flower_tiles)" + _SUFFIX, TERRACOTTA),
    (r"^PBR_bradbury_(ground_stone|pier_stone)" + _SUFFIX, STONE),
    (r"^PORTAL_(sandstone_carved|sandstone|granite|dark_stone|lettering)" + _SUFFIX, STONE),
    (r"^Sandstone_Pink_Ashlar" + _SUFFIX, STONE),
    (r"^(PORTAL_glass|Storefront_Transom_Glass)" + _SUFFIX, GLASS),
    (r"^(PORTAL_(iron|brass|bronze)|Storefront_Black_Metal)" + _SUFFIX, METAL),
    (r"^Storefront_White_Paper" + _SUFFIX, PAINT),                 # the storefronts' white transom panels
    (r"^PORTAL_(oak_light|oak)" + _SUFFIX, WOOD),
    (r"^PORTAL_(glazed_brick_side|glazed_brick_end|tile_floor|tile_border|tile_black)" + _SUFFIX, GLAZED),
    (r"^PORTAL_(niche_dark|lamp_glass)" + _SUFFIX, NONE),           # the vestibule's niches and lamp globes
    (r"^GND_.*", NONE),                                            # the render scene's own ground
]
_GAME = re.compile(r"^MAT_\d+_Mesh(Standard|Physical)Material" + _SUFFIX)


def _images(mat):
    if not mat.node_tree: return set()
    return {n.image.name for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image}


def _bsdf(mat):
    if not mat.node_tree: return None
    return next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)


def classify(mat):
    """(class, reason) for a bpy material."""
    name = mat.name
    for rx, c in NAME_RULES:
        if re.match(rx, name): return c, "name"
    if _GAME.match(name):
        # the glTF export's materials: numbered, so sorted by what they are rather than what they are called
        if "Physical" in name: return GLASS, "game physical (window glass)"
        imgs = _images(mat); b = _bsdf(mat)
        metal = b.inputs["Metallic"].default_value if b and not b.inputs["Metallic"].is_linked else 0.0
        if any(i.startswith("pbr_brownstone") for i in imgs): return STONE, "game brownstone (wall__0)"
        if any(i.startswith(("pbr_painted_plaster", "pbr_rough_concrete")) for i in imgs): return NONE, "game roof deck"
        if metal >= 0.5: return METAL, "game metallic (fire escape)"
        if imgs & {"Image_18", "Image_19"}: return NONE, "game backdrop pane behind the glass"
        if imgs <= {"Image_20"}: return PAINT, "game window frame (normal map only)"
        return NONE, "game, unrecognised"
    return NONE, "unrecognised"
