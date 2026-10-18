# Measures tiny closed components in local double precision so translations cannot reverse their winding sign.
from math import fsum


def signed_volume(faces):
    faces=list(faces)
    if not faces:return 0.
    origin=faces[0][0];terms=[]
    for face in faces:
        points=[tuple(float(p[k])-float(origin[k]) for k in range(3)) for p in face]
        a=points[0]
        for i in range(1,len(points)-1):
            b,c=points[i],points[i+1]
            terms.append(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))
    return fsum(terms)/6


def is_remesh_sliver(vertices,face_sizes,volume,extent,voxel,minimum_source_diameter):
    return (vertices==8 and face_sizes==[4]*6 and 0<volume<voxel**3*.001
            and extent<voxel*.1 and extent<minimum_source_diameter*.05)
