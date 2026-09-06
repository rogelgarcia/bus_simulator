"""Durable, authenticated independent Cycles pass outputs for the bake framework."""
import hashlib
import json
import os
import numpy as np


def file_identity(file):
    digest = hashlib.sha256()
    with file.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return {'file': file.name, 'bytes': file.stat().st_size, 'sha256': digest.hexdigest()}


def save_pass(stage, name, pages, receipt):
    atlas = json.loads((stage / 'atlas.json').read_text())
    size = atlas['profile']['pageSize']
    files = []
    for page, data in enumerate(pages):
        file = stage / f'{name}.{page}.npy'
        temporary = file.with_suffix('.partial')
        if data.shape != (size, size, 4) or data.dtype != np.float32:
            raise ValueError(f'Unexpected receiver pass raster in {file.name}')
        if not np.isfinite(data).all():
            raise ValueError(f'Nonfinite samples in {file.name}')
        with temporary.open('wb') as output:
            np.save(output, data)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, file)
        files.append(file_identity(file))
    receipt.update({'schema': 'bus-sim-independent-receiver-pass-v1', 'pass': name,
                    'jobSha256': file_identity(stage / 'job.json')['sha256'],
                    'atlasSha256': file_identity(stage / 'atlas.json')['sha256'],
                    'chartSha256': file_identity(stage / atlas['chartFile'])['sha256'] if atlas.get('chartFile') else None,
                    'files': files})
    if len(files) != atlas['pageCount']:
        raise ValueError(f'{name}: incomplete receiver pass')
    temporary = stage / f'{name}.receipt.partial'
    with temporary.open('w') as output:
        json.dump(receipt, output, sort_keys=True)
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, stage / f'{name}.receipt.json')


def verify_pass(stage, name, job_hash, page_count):
    atlas = json.loads((stage / 'atlas.json').read_text())
    receipt = json.loads((stage / f'{name}.receipt.json').read_text())
    if receipt['schema'] != 'bus-sim-independent-receiver-pass-v1' or receipt['pass'] != name or receipt['jobSha256'] != job_hash:
        raise ValueError(f'{name}: pass identity does not match this job')
    if receipt['atlasSha256'] != file_identity(stage / 'atlas.json')['sha256'] or receipt['chartSha256'] != (
            file_identity(stage / atlas['chartFile'])['sha256'] if atlas.get('chartFile') else None):
        raise ValueError(f'{name}: atlas or settings changed')
    if [item['file'] for item in receipt['files']] != [f'{name}.{page}.npy' for page in range(page_count)]:
        raise ValueError(f'{name}: missing, duplicate or unexpected page')
    for item in receipt['files']:
        if item != file_identity(stage / item['file']):
            raise ValueError(f'{name}: modified pass file {item["file"]}')
    return receipt
