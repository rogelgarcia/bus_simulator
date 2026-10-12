# Preserves the authored vertex tint and thin-leaf material response in standard glTF fields.
import json
import struct


def finish(file):
    raw=file.read_bytes();length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length]);remainder=raw[20+length:]
    for mesh in doc['meshes']:
        for primitive in mesh['primitives']:
            a=primitive['attributes']
            if 'COLOR_1' in a:a['COLOR_0']=a.pop('COLOR_1')
    for mat in doc['materials']:
        if 'opaque leaves' in mat['name']:
            mat.setdefault('extensions',{})['KHR_materials_diffuse_transmission']={'diffuseTransmissionFactor':.17,'diffuseTransmissionColorTexture':mat['pbrMetallicRoughness']['baseColorTexture']}
    doc['extensionsUsed']=sorted(set(doc.get('extensionsUsed',[])+['KHR_materials_diffuse_transmission']))
    encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
    file.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(encoded)+len(remainder))+struct.pack('<I4s',len(encoded),b'JSON')+encoded+remainder)
