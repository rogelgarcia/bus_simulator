"""Cross-language production request identity, including the calibrated high-sun grid."""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools/static_sun_depth/blender'))
import production_static_sun as p

requests = json.load(sys.stdin)
for request in requests:
    normalized = p._validate_request(request)
    assert normalized == request, request['lightingProfileId']
    assert request['maxPayloadBytes'] == 536870912
    pitch = request['texelSizeMeters']
    assert request['tileSizeMeters'] == [1870*pitch, 1821*pitch]
print(json.dumps({'validatedRequests': len(requests)}))
