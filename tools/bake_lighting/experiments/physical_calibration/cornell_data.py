"""Decode the bounded big-endian MATLAB-v4 arrays supplied by Cornell, with provenance retained."""
import struct
import zipfile
from pathlib import Path
import numpy as np


def read_mat4(file):
    content=Path(file).read_bytes()
    arrays={}
    offset=0
    while offset<len(content):
        if offset+20>len(content):
            raise ValueError('Truncated MAT header')
        kind,rows,columns,imaginary,name_length=struct.unpack_from('>5i',content,offset)
        if kind not in (1000,1001) or imaginary!=0 or rows<=0 or columns<=0 or not(1<=rows*columns<=200000) or not(1<=name_length<=100):
            raise ValueError(f'Unsupported Cornell MAT-v4 record: {file} {offset} {kind,rows,columns,imaginary,name_length}')
        offset+=20
        name=content[offset:offset+name_length].rstrip(b'\0').decode('ascii')
        if not name or name in arrays:
            raise ValueError('Invalid or duplicated MAT array name')
        offset+=name_length
        size=rows*columns*8
        if offset+size>len(content):
            raise ValueError('Truncated MAT data')
        arrays[name]=np.frombuffer(content[offset:offset+size],dtype='>f8').reshape((rows,columns),order='F').astype(float).squeeze()
        if not np.isfinite(arrays[name]).all():
            raise ValueError('Nonfinite measured response')
        offset+=size
    return arrays


def extract_images(directory):
    directory=Path(directory)
    files=[]
    with zipfile.ZipFile(directory/'measured_exr.zip') as archive:
        for name in ['400nm.exr','450nm.exr','500nm.exr','550nm.exr','600nm.exr','650nm.exr','700nm.exr']:
            if archive.getinfo(name).file_size>20000000:
                raise ValueError('Measured EXR exceeds size bound')
            data=archive.read(name)
            if data[:4]!=b'v/1\x01':
                raise ValueError('Invalid measured EXR')
            file=directory/name
            if file.exists() and file.read_bytes()!=data:
                raise ValueError('Extracted photograph no longer matches authenticated archive')
            if not file.exists():file.write_bytes(data)
            files.append(file)
    return files
