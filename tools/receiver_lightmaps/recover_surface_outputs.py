"""Recover interrupted surface assembly from complete, validated Cycles pass files."""
import hashlib
import json
import math
import os
import sys
from pathlib import Path

import bpy
import numpy as np

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent / 'blender'))
from bake import assert_blender_runtime, open_verified_package, validate_resolved_city_contract


def digest(file):
    with file.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def verify_recovery_inputs(stage):
    stage = stage.resolve()
    if not stage.is_relative_to(root / 'tests' / 'artifacts') or not stage.name.endswith('.partial'):
        raise ValueError('Recovery requires a workspace artifact staging directory')
    if (stage / 'receipt.json').exists():
        raise ValueError('Completed receipts must use the normal packaging resume')
    job = json.loads((stage / 'job.json').read_text())
    for file, expected in [('source.bsib', job['packageSha256']), ('atlas.json', job['atlasSha256']), ('charts.ndjson', job['chartsSha256'])]:
        if digest(stage / file) != expected:
            raise ValueError('Recovery input changed: ' + file)
    for file, expected in job['scripts'].items():
        if digest(root / file) != expected:
            raise ValueError('Baking script changed: ' + file)
    if digest(Path(bpy.app.binary_path)) != job['executableSha256']:
        raise ValueError('Recovery Blender differs from the original executable')
    signature = assert_blender_runtime(job['archiveSha256'])
    with open_verified_package(stage / 'source.bsib', job['packageSha256']) as package:
        validate_resolved_city_contract(package, job['archiveSha256'])
    atlas = json.loads((stage / 'atlas.json').read_text())
    profile = atlas['profile']
    if profile.get('irradianceRepresentation') != 'surface-diffuse-v1':
        raise ValueError('Only complete surface pass assembly can be recovered')
    return stage, job, atlas, signature


def recover(stage):
    stage, job, atlas, signature = verify_recovery_inputs(stage)
    profile = atlas['profile']
    size = profile['pageSize']
    samples = []
    # Validate every source before replacing any assembled output.
    for name in ['bounce', 'sky']:
        for page in range(atlas['pageCount']):
            file = stage / f'{name}.{page}.npy'
            data = np.load(file, mmap_mode='r', allow_pickle=False)
            if data.dtype != np.dtype('<f4') or data.shape != (size, size, 4):
                raise ValueError('Incomplete pass: ' + file.name)
            if file.stat().st_size != data.offset + data.nbytes:
                raise ValueError('Truncated pass: ' + file.name)
            if not np.all(np.isfinite(data)) or data.min() < 0 or not np.any(data[:, :, 3] > .5):
                raise ValueError('Invalid pass samples: ' + file.name)
            samples.append({'file': file.name, 'bytes': file.stat().st_size, 'sha256': digest(file),
                            'modifiedSeconds': file.stat().st_mtime})
            del data
    outputs = []
    for page in range(atlas['pageCount']):
        data = np.load(stage / f'bounce.{page}.npy') + np.load(stage / f'sky.{page}.npy')
        data[:, :, :3] *= math.pi
        data[:, :, 3] = 1
        for mip in range(profile['mipLevels']):
            name = f'indirect_irradiance.{page}.mip{mip}.f32'
            target = stage / name
            temporary = stage / (name + '.recovering')
            with temporary.open('wb') as output:
                data.astype('<f4').tofile(output)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, target)
            outputs.append({'channel': 'indirect_irradiance', 'page': page, 'mip': mip, 'file': name,
                            'width': data.shape[1], 'height': data.shape[0]})
            if mip + 1 < profile['mipLevels']:
                data = data.reshape(data.shape[0] // 2, 2, data.shape[1] // 2, 2, 4).mean(axis=(1, 3))
        print('RECOVERED_PAGE ' + str(page), flush=True)
    np.zeros((1, 1, 4), dtype='<f4').tofile(stage / 'direct_receiver.0.mip0.f32')
    outputs.append({'channel': 'direct_receiver', 'page': 0, 'mip': 0, 'file': 'direct_receiver.0.mip0.f32', 'width': 1, 'height': 1})
    progress_file = stage / 'progress.json'
    progress = json.loads(progress_file.read_text())
    estimate = (progress['elapsed'] + max(sample['modifiedSeconds'] for sample in samples) - progress_file.stat().st_mtime
                if progress.get('pass') == 'sky' else None)
    resumed = json.loads((stage / 'resumed-sky.json').read_text()) if (stage / 'resumed-sky.json').exists() else None
    if resumed is not None:
        estimate = progress['elapsed'] + resumed['passSeconds']
    receipt = {'schema': 'bus-sim-receiver-bake-receipt-v1', 'signature': signature,
               'reconstruction': None, 'seconds': None, 'passes': None, 'outputs': outputs,
               'backend': profile['device'], 'recovery': {
                   'policy': 'validated-complete-pass-reassembly-v1', 'samples': samples,
                   'scriptSha256': digest(Path(__file__)), 'jobSha256': digest(stage / 'job.json'),
                   'estimatedBakeSeconds': estimate, 'timingSource': 'sky-start checkpoint plus pass file modification times',
                   'missingOriginalReceipt': True, 'sourceContractRevalidated': True, 'resumedSky': resumed}}
    if resumed is not None:
        receipt['recovery']['timingSource'] = 'original pre-sky elapsed checkpoint plus measured replacement sky pass'
    temporary = stage / 'receipt.recovering.json'
    with temporary.open('w') as output:
        output.write(json.dumps(receipt, sort_keys=True))
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, stage / 'receipt.json')
    print('RECOVERY_COMPLETE ' + json.dumps({'estimatedBakeSeconds': estimate, 'passFiles': len(samples)}), flush=True)


if __name__ == '__main__':
    recover(Path(sys.argv[sys.argv.index('--') + 1]))
