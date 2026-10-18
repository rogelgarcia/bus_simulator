// Guards the correspondence between a species, its supplied study metadata and its image bytes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateStudyRecord} from '../../tools/bake_vegetation/enhanced_reference/source_studies.mjs';

const elm={asset_id:'american_elm_01',species:{scientific_name:'Ulmus americana'},image_path:'american_elm/american_elm_01.png',image:{sha256:'elm-bytes'}};
test('Species study accepts the matching elm metadata and bytes',()=>{
    assert.doesNotThrow(()=>validateStudyRecord(elm,'american_elm','Ulmus americana',1,'elm-bytes'));
});
test('Species study rejects a substituted species, specimen or image',()=>{
    assert.throws(()=>validateStudyRecord(elm,'northern_red_oak','Quercus rubra',1,'elm-bytes'),/Wrong species/);
    assert.throws(()=>validateStudyRecord(elm,'american_elm','Ulmus americana',2,'elm-bytes'),/Wrong species/);
    assert.throws(()=>validateStudyRecord(elm,'american_elm','Ulmus americana',1,'oak-bytes'),/differs/);
    assert.throws(()=>validateStudyRecord({...elm,species:{scientific_name:'Tilia tomentosa'}},'american_elm','Ulmus americana',1,'elm-bytes'),/Wrong species/);
});
