"""Batches receiver draws without removing source faces, material slots, or non-receiver participants."""
import bpy


def batch_surface_targets(selected):
    if not selected: raise ValueError('No complete receivers to batch')
    triangles = sum(len(obj.data.polygons) for obj in selected)
    mirrored = 0
    for obj in selected:
        # Joining bakes transforms into positions. Preserve the orientation correction
        # that Cycles applies to a separately rendered negative-determinant instance.
        if obj.matrix_world.determinant() < 0:
            obj.data.flip_normals(); mirrored += 1
    mesh = bpy.data.meshes.new('AI553_ReceiverBatch')
    # Blender keeps the active object's layer schema when joining onto an empty
    # mesh. Declare every source UV channel, including the bake target channel.
    for name in sorted({layer.name for obj in selected for layer in obj.data.uv_layers}):
        mesh.uv_layers.new(name=name)
    mesh.uv_layers.active = mesh.uv_layers['AI533_Bake']
    target = bpy.data.objects.new('AI553_ReceiverBatch',mesh)
    bpy.context.scene.collection.objects.link(target)
    target.select_set(True); bpy.context.view_layer.objects.active = target
    bpy.ops.object.join()
    if len(target.data.polygons) != triangles: raise RuntimeError('Receiver batching changed the triangle inventory')
    return {'sourceReceiverObjects':len(selected),'bakeTargetObjects':1,'triangles':triangles,'mirroredInstances':mirrored}
