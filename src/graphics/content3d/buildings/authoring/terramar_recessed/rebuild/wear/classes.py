# Wear material classes: what a feature's response keys on. A splash band darkens stone and paving but never glass;
# a glass film acts on the exterior glass alone. Every exterior material slot of the building, props and site parts is
# sorted into one class here, by its name; a material in no class (NONE) gets no TM_WEAR_layer at all.
#
# Interior materials never weather: the partitions, ceilings, floors, the core, the interior furniture's fabric. A
# material shared by an exterior and an interior object (the frames, the furniture teak) is classed, and the object
# flag tm_wear_exposed (set by the wear pass on exterior objects only, read by the layer with an Object attribute;
# absent = 0 = sheltered) keeps it clean indoors.
#
# To give a new slot a class, add it to SLOTS (exact names; Blender's .001 copies match too). To add a class, append
# it to NAMES: the ids are positions in NAMES, stored in each material's TM_WEAR node, so append only, never reorder.
import re

NAMES = ("none", "stone", "paving", "joint", "wood_ext", "soffit", "steel", "glass_ext", "planter", "furn_teak",
         "fabric", "cafe_wood", "concrete")
ID = {n: i for i, n in enumerate(NAMES)}
NONE = 0

SLOTS = {
    # stone: the kit limestone of the walls (layer_materials family "stone")
    "TM_RB_slab_fascia": "stone", "TM_RB_pilaster": "stone", "TM_RB_column": "stone", "TM_RB_podium_stone": "stone",
    "TM_RB_penthouse_stone": "stone", "TM_RB_cover_stone": "stone",
    # paving: the walking faces and the limestone pieces that stand on them (tree pits, roof troughs share TM_RB_paving)
    "TM_RB_paving": "paving", "TM_RB_threshold": "paving", "TM_RB_slab_top": "paving", "TM_RB_roof_paving": "paving",
    "TM_RB_site_paving": "paving",
    # joint: the floors of the stone joints cut as geometry (layer_materials.JOINT_MATERIAL)
    "TM_RB_stone_joint": "joint",
    # wood_ext: the teak reveals, door linings, and the entrance's veneer (linings, panels, soffits, head band; fix 4c)
    # and the veneer plates' dark reveals and core (user fix 15; added to a class by user fix 17)
    "TM_RB_wood": "wood_ext", "TM_RB_veneer": "wood_ext", "TM_RB_veneer_reveal": "wood_ext",
    # soffit: the balcony undersides, since user fix 17 veneer plates (TM_RB_soffit_veneer) on the slabs' dark core
    "TM_RB_soffit": "soffit", "TM_RB_soffit_veneer": "soffit",
    # steel: window and storefront frames, guard shoes and rails, lantern bodies (all TM_RB_frame), the louvres, the
    # storefront canopies (TM_RB_awning: slatted charcoal metal, not fabric; 2026-10-14)
    "TM_RB_frame": "steel", "TM_RB_louvre": "steel", "TM_RB_awning": "steel",
    # the annex's standing-seam rain roof, gutter and downpipe (user fix 20)
    "TM_RB_roof_metal": "steel",
    "TM_RB_glass": "glass_ext",
    # planter: the props' dark planter metal and the pots (the entrance portal's glazed pots: user fix 12)
    "TM_RB_planter_metal": "planter", "TM_RB_pot_charcoal": "planter", "TM_RB_pot_light_grey": "planter",
    "TM_RB_pot_white": "planter", "TM_RB_pot_glazed": "planter",
    "TM_RB_furn_teak": "furn_teak",
    # fabric: the cafe umbrellas' canvas
    "TM_RB_cafe_canopy": "fabric",
    "TM_RB_cafe_wood": "cafe_wood",
    # concrete: the exposed concrete tops (the roof deck under the paving, the entrance canopy top)
    "TM_RB_roof_top": "concrete",
}

# Never worn, whatever a future SLOTS says (checked by classify): what only the inside of the building shows.
INTERIOR = {"TM_RB_ceiling", "TM_RB_ceiling_light", "TM_RB_floor", "TM_RB_core", "TM_RB_partition", "TM_RB_hidden"}
INTERIOR_PREFIX = ("TM_RB_furn_fabric_",)

_SUFFIX = re.compile(r"\.\d{3}$")


def base_name(name):
    return _SUFFIX.sub("", name)


def classify(mat):
    """(class id, class name) of a material, by its slot name; (NONE, "none") for anything not in SLOTS."""
    name = base_name(mat.name)
    if name in INTERIOR or name.startswith(INTERIOR_PREFIX):
        return NONE, "none"
    cls = SLOTS.get(name, "none")
    return ID[cls], cls
