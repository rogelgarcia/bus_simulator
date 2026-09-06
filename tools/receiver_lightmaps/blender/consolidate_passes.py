"""Consolidates verified direct, bounce and sky passes without rendering another scene."""
import json
import math
import sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pass_files import file_identity, verify_pass
from bake_surface import assemble_surface_outputs, write_durable


def main():
    stage = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
    atlas = json.loads((stage / 'atlas.json').read_text())
    profile = atlas['profile']
    surface = profile.get('irradianceRepresentation') == 'surface-diffuse-v1'
    names = ['bounce', 'sky'] if surface else ['direct_receiver', 'bounce', 'sky']
    job_hash = file_identity(stage / 'job.json')['sha256']
    passes = {name: verify_pass(stage, name, job_hash, atlas['pageCount']) for name in names}
    signatures = [receipt['signature'] for receipt in passes.values()]
    if any(signature != signatures[0] for signature in signatures):
        raise ValueError('Different Blender builds in pass receipts')
    if surface:
        outputs = assemble_surface_outputs(stage, profile, atlas['pageCount'])
    else:
        outputs = []
        for channel in ['direct_receiver', 'indirect_irradiance']:
            for page in range(atlas['pageCount']):
                data = np.load(stage / f'direct_receiver.{page}.npy') if channel == 'direct_receiver' else (
                    np.load(stage / f'bounce.{page}.npy') + np.load(stage / f'sky.{page}.npy'))
                data[:, :, :3] *= math.pi
                data[:, :, 3] = 1
                for mip in range(profile['mipLevels']):
                    file = f'{channel}.{page}.mip{mip}.f32'
                    write_durable(stage / file, lambda output: data.astype('<f4').tofile(output))
                    outputs.append({'channel': channel, 'page': page, 'mip': mip, 'file': file,
                                    'width': data.shape[1], 'height': data.shape[0]})
                    if mip + 1 < profile['mipLevels']:
                        data = data.reshape(data.shape[0]//2, 2, data.shape[1]//2, 2, 4).mean(axis=(1, 3))
    first = passes['bounce']
    receipt = {'schema': 'bus-sim-receiver-bake-receipt-v1', 'signature': signatures[0],
               'reconstruction': first['reconstruction'], 'seconds': sum(v['seconds'] for v in passes.values()),
               'passes': {k: v['seconds'] for k, v in passes.items()}, 'outputs': outputs,
               'backend': first['backend'], 'devices': first['devices'],
               'independentPasses': {name: file_identity(stage / f'{name}.receipt.json') for name in names}}
    write_durable(stage / 'receipt.json', lambda output: output.write(json.dumps(receipt, sort_keys=True).encode()))


if __name__ == '__main__':
    main()
