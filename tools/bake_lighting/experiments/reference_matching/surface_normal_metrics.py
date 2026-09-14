"""A filtered average of face normals is not itself a comparable surface normal."""
import numpy as np

def comparable_faces(game_position,cycles_position,game_face,cycles_face,mask,position_tolerance=.02):
    # Unit normals can average to unit length only when all contributing faces agree.
    # Test the unnormalized AOV; normalization would hide mixed-face footprints.
    length=np.linalg.norm(cycles_face,axis=-1)
    coherent=mask&(np.abs(length-1)<5e-5)
    matching=coherent&(np.linalg.norm(game_position-cycles_position,axis=-1)<position_tolerance)
    g=game_face/np.maximum(np.linalg.norm(game_face,axis=-1,keepdims=True),1e-8)
    c=cycles_face/np.maximum(length[...,None],1e-8)
    # Keep face disagreement visible as a separate category, not a normal-score filter.
    return coherent,matching,np.degrees(np.arccos(np.clip(np.sum(g*c,axis=-1),-1,1)))

def self_test():
    positions=np.zeros((3,3));faces=np.array([[1.,0,0],[.5,.5,0],[0,0,0]])
    coherent,matching,angle=comparable_faces(positions,positions,np.array([[1.,0,0]]*3),faces,np.ones(3,bool))
    assert coherent.tolist()==[True,False,False] and matching.tolist()==[True,False,False]
    assert abs(angle[1]-45)<1e-10

