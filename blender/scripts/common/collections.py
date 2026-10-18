"""Group a building under one linkable root while preserving view-layer exclusions."""
import bpy


def building_root(scene, name):
    if name in scene.collection.children:
        return scene.collection.children[name]
    flags = {}
    for layer in scene.view_layers:
        flags[layer.name] = {child.name: (child.exclude, child.hide_viewport, child.holdout, child.indirect_only)
                             for child in layer.layer_collection.children}
    root = bpy.data.collections.new(name)
    scene.collection.children.link(root)
    for child in list(scene.collection.children):
        if child != root:
            root.children.link(child)
            scene.collection.children.unlink(child)
    for layer in scene.view_layers:
        children = layer.layer_collection.children[name].children
        for child_name, values in flags[layer.name].items():
            child = children[child_name]
            child.exclude, child.hide_viewport, child.holdout, child.indirect_only = values
    return root
