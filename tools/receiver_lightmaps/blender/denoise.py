"""Denoises linear irradiance within isolated chart rectangles before fitting directions."""
import bpy
import numpy as np


class ChartDenoiser:
    def __init__(self, stage, threads):
        self.stage = stage
        self.scene = bpy.data.scenes.new('Receiver_Denoise')
        self.scene.render.engine = 'BLENDER_WORKBENCH'
        self.scene.render.threads_mode = 'FIXED'
        self.scene.render.threads = threads
        self.scene.render.resolution_percentage = 100
        self.scene.view_settings.view_transform = 'Raw'
        camera = bpy.data.objects.new('Receiver_Denoise_Camera', bpy.data.cameras.new('Receiver_Denoise_Camera'))
        self.scene.collection.objects.link(camera)
        self.scene.camera = camera
        tree = bpy.data.node_groups.new('Receiver_Denoise', 'CompositorNodeTree')
        self.scene.compositing_node_group = tree
        tree.interface.new_socket(name='Image', in_out='OUTPUT', socket_type='NodeSocketColor')
        self.input = tree.nodes.new('CompositorNodeImage')
        denoise = tree.nodes.new('CompositorNodeDenoise')
        denoise.inputs['HDR'].default_value = True
        output = tree.nodes.new('NodeGroupOutput')
        tree.links.new(self.input.outputs['Image'], denoise.inputs['Image'])
        tree.links.new(denoise.outputs['Image'], output.inputs['Image'])
        self.scene.render.image_settings.file_format = 'OPEN_EXR'
        self.scene.render.image_settings.color_depth = '32'
        self.scene.render.filepath = str(stage / 'denoised-chart.exr')

    def apply(self, samples, charts):
        result = samples.copy()
        for chart in charts:
            x, y, width, height = (chart[key] for key in ['x', 'y', 'width', 'height'])
            crop = np.ones((height, width, 4), dtype=np.float32)
            crop[:, :, :3] = samples[y:y + height, x:x + width]
            # OIDN's image boundary can bias even constant HDR inputs. Mirror a guard
            # around this chart only, then discard it; no neighboring chart is sampled.
            guard = 32
            crop = np.pad(crop, ((guard, guard), (guard, guard), (0, 0)), mode='reflect')
            render_height, render_width = crop.shape[:2]
            image = bpy.data.images.new('Receiver_Denoise_Input', render_width, render_height, float_buffer=True)
            image.colorspace_settings.name = 'Non-Color'
            image.pixels.foreach_set(crop.ravel())
            image.update()
            self.input.image = image
            self.scene.render.resolution_x = render_width
            self.scene.render.resolution_y = render_height
            bpy.ops.render.render(scene=self.scene.name, write_still=True)
            output = bpy.data.images.load(self.scene.render.filepath, check_existing=False)
            pixels = np.empty(render_width * render_height * 4, dtype=np.float32)
            output.pixels.foreach_get(pixels)
            pixels = pixels.reshape(render_height, render_width, 4)[guard:guard + height, guard:guard + width, :3]
            if not np.all(np.isfinite(pixels)):
                raise RuntimeError('Non-finite denoised receiver irradiance')
            result[y:y + height, x:x + width] = np.maximum(pixels, 0)
            self.input.image = None
            bpy.data.images.remove(output)
            bpy.data.images.remove(image)
        return result
