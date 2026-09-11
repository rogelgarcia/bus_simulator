"""Regression for dropped UV overrides in actual enhanced-transport texture binding."""
import math,sys,unittest
from pathlib import Path
from unittest.mock import patch
root=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(root/'tools/illumination_bake_compiler/blender'))
sys.path.insert(0,str(root/'tools/receiver_lightmaps/blender'))
from uv_tiling import binding_with_tiling,tiling_matrix,multiply,FLIP_V
from transport import EnhancedTransportMaterialAdapter
from reconstruct import _MaterialAdapter

def point(matrix,uv):
    x,y=uv
    return [matrix[0]*x+matrix[3]*y+matrix[6],matrix[1]*x+matrix[4]*y+matrix[7]]

class TilingTests(unittest.TestCase):
    def test_cloned_plain_vector_semantics_keep_the_same_uv_transform(self):
        values={'tiling':[1.5,2.4],'offset':[.1,-.2],'rotation':.3}
        cloned={'tiling':{'x':1.5,'y':2.4},'offset':{'x':.1,'y':-.2},'rotation':.3}
        self.assertEqual(tiling_matrix(values),tiling_matrix(cloned))

    def test_texture_matrix_precedes_material_override(self):
        source={'matrix':[2,0,0,0,3,0,.1,-.2,1],'wrapS':1000}
        config={'tiling':[4,2],'offset':[.3,.4],'rotation':math.pi/2}
        result=binding_with_tiling(source,config)
        # Source texture gives(.6,1.3), then scale(2.4,2.6), clockwise90°, offset.
        for a,b in zip(point(result['matrix'],[.25,.5]),[2.9,-2.0]):self.assertAlmostEqual(a,b)
        self.assertEqual(source['matrix'],[2,0,0,0,3,0,.1,-.2,1])
        self.assertEqual(result['wrapS'],1000)

    def test_enhanced_adapter_applies_map_but_not_separate_alpha_uv(self):
        adapter=object.__new__(EnhancedTransportMaterialAdapter)
        adapter.materials={'wall':{'textureBindings':{'map':'color','alphaMap':'mask'},
            'customSemantics':{'uvTilingConfig':{'tiling':[4,3],'offset':[0,0],'rotation':0}}}}
        adapter.bindings={'color':{'matrix':[1,0,0,0,1,0,0,0,1]},'mask':{'matrix':[1,0,0,0,1,0,0,0,1]}}
        material={'bus_sim_stable_material_id':'wall'}
        with patch.object(_MaterialAdapter,'_texture_node',return_value='node') as base:
            adapter._texture_node(material,'color','color',{})
            self.assertEqual(point(base.call_args.kwargs['binding_override']['matrix'],[.2,.3]),[.8,.8999999999999999])
            adapter._texture_node(material,'color','coverage:a',{})
            self.assertIsNotNone(base.call_args.kwargs['binding_override'])
            adapter._texture_node(material,'mask','coverage:g',{})
            self.assertIsNone(base.call_args.kwargs['binding_override'])

    def test_gltf_v_conversion_retains_the_same_texture_coordinate(self):
        config={'tiling':[2.3,4.1],'offset':[.23,-.31],'rotation':.47}
        authored=tiling_matrix(config);blender=multiply(FLIP_V,multiply(authored,FLIP_V))
        for uv in [[.1,.2],[.5,.8],[-.2,1.2]]:
            expected=point(FLIP_V,point(authored,uv))
            actual=point(blender,point(FLIP_V,uv))
            for a,b in zip(actual,expected):self.assertAlmostEqual(a,b,places=12)

if __name__=='__main__':unittest.main()
