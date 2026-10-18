# Render cache must never present old Cycles images as an Eevee geometry review.
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'tools/bake_vegetation/enhanced_reference'))
from render_cache import reuse


class RenderCacheTests(unittest.TestCase):
    def test_engine_is_part_of_comparison_identity(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);source=root/'enhanced_full.png';source.write_bytes(b'cached-image')
            row={'id':'american_elm/mature_01','state':'enhanced','view':'full','sourceSha256':'model',
                 'width':640,'samples':16,'camera':{},'file':source.name,
                 'sha256':hashlib.sha256(source.read_bytes()).hexdigest()}
            proof=root/'summary.json';proof.write_text(json.dumps({'renders':[row]}))
            output=root/'review';(output/row['id']).mkdir(parents=True)
            options={'previous':str(proof),'output':str(output),'width':640,'samples':16,'engine':'eevee'}
            prior={'file':str(root/'enhanced.blend'),'sha256':'model'}
            args=(prior,row['id'],'previous','full',{},'studio-v1','model',options)
            self.assertIsNone(reuse(*args))
            row['engine']='BLENDER_EEVEE';proof.write_text(json.dumps({'renders':[row]}))
            self.assertEqual(reuse(*args)['engine'],'BLENDER_EEVEE')
            self.assertEqual((output/row['id']/'previous_full.png').read_bytes(),source.read_bytes())


if __name__=='__main__':unittest.main()
