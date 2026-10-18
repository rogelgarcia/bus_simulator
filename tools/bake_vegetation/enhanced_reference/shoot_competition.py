# Prunes subordinate terminal shoots whose leaf corridors duplicate stronger wood in the same fan.
from collections import defaultdict
import numpy as np

DEFAULT_POLICY={'maximumRadiusRatio':.78,'minimumDirectionAgreement':.65,'corridorLeafWidths':1.15,'maximumDepthLeafLengths':1.6,'minimumCompetingFraction':.80}
COVERAGE_POLICY={'minimumProjectedRetention':.9975,'maximumLocalLoss':.01,'maximumRemovedAreaFraction':.025}


def prepare_planes(paths,shoots):
    groups=defaultdict(list)
    for shoot in shoots:groups[shoot['group']].append(shoot['id'])
    for ids in groups.values():
        if all('sprayNormal' in paths[i] for i in ids):continue
        points=np.concatenate([paths[i]['points'] for i in ids]);_,_,basis=np.linalg.svd(points-points.mean(axis=0),full_matrices=False)
        for i in ids:
            if 'sprayNormal' not in paths[i]:paths[i]['sprayNormal']=basis[-1].tolist()


def segment_distances(points,curve):
    a=curve[:-1];d=np.diff(curve,axis=0);delta=points[:,None]-a
    t=np.clip(np.einsum('nki,ki->nk',delta,d)/np.maximum(np.sum(d*d,axis=1),1e-12),0,1)
    return np.linalg.norm(delta-t[:,:,None]*d,axis=2).min(axis=1)


def redundant_shoots(paths,shoots,leaf_length,policy):
    groups=defaultdict(list);parents={r['parent'] for r in paths};removed=[];proof=[]
    for shoot in shoots:groups[shoot['group']].append(shoot['id'])
    for ids in groups.values():
        for child in sorted(ids,key=lambda i:paths[i]['radii'][0]):
            path=paths[child]
            if child in parents or path.get('shootDepth')==0:continue
            points=np.asarray(path['points']);normal=np.asarray(path['sprayNormal']);samples=points[4:]
            direction=points[-1]-points[0];direction/=np.linalg.norm(direction)
            for other in ids:
                if other==child or other in removed:continue
                support=paths[other];curve=np.asarray(support['points'])
                if support['radii'][0]*policy['maximumRadiusRatio']<path['radii'][0]:continue
                tangent=curve[-1]-curve[0];tangent/=np.linalg.norm(tangent)
                if np.dot(direction,tangent)<policy['minimumDirectionAgreement']:continue
                flat=lambda a:a-(a@normal)[:,None]*normal
                near=segment_distances(flat(samples),flat(curve))<leaf_length*policy['corridorLeafWidths']
                near&=segment_distances(samples,curve)<leaf_length*policy['maximumDepthLeafLengths']
                fraction=float(near.mean())
                if fraction>=policy['minimumCompetingFraction']:
                    removed.append(child);proof.append({'path':child,'strongerPath':other,'competingFraction':fraction});break
    return set(removed),proof


def compact_graph(graph,removed):
    mapping={old:new for new,old in enumerate(i for i in range(len(graph['paths'])) if i not in removed)}
    paths=[{**p,'parent':mapping[p['parent']] if p['parent']>=0 else -1} for i,p in enumerate(graph['paths']) if i not in removed]
    shoots=[{**s,'id':mapping[s['id']],'parent':mapping[s['parent']]} for s in graph['shoots'] if s['id'] not in removed]
    parents={s['parent'] for s in shoots}
    original_parents={r['parent'] for r in graph['paths']}
    for old,new in mapping.items():
        if 'sprayRoot' in paths[new]:paths[new]['sprayRoot']=mapping[paths[new]['sprayRoot']]
        if old in original_parents and new not in parents:paths[new]['retainedTipExtension']=True
    for s in shoots:paths[s['id']]['shootTerminal']=s['id'] not in parents
    result={**graph,'paths':paths,'shoots':shoots}
    if graph.get('studyRoot') is not None:result['studyRoot']=mapping[graph['studyRoot']]
    return result


def clean_growth(p,paths,shoots,leaves,crowding):
    from competition_coverage import select_removals
    prepare_planes(paths,shoots)
    _,decisions=redundant_shoots(paths,shoots,p['leafLength'],p.get('shootCompetition',DEFAULT_POLICY))
    centers=[l.get('bladeCenter',l['origin']+l['matrix'][:,1]*.52) for l in leaves]
    removed,accepted,coverage=select_removals(decisions,[l['shoot'] for l in leaves],centers,[l['matrix'] for l in leaves],p['leafLength'],COVERAGE_POLICY)
    mapping={old:new for new,old in enumerate(i for i in range(len(paths)) if i not in removed)}
    graph=compact_graph({'paths':paths,'shoots':shoots},removed);paths[:]=graph['paths']
    kept=[{**l,'shoot':mapping[l['shoot']]} for l in leaves if l['shoot'] not in removed]
    crowding['shootCompetition']={'removed':len(removed),'candidates':len(decisions),'decisions':accepted,'coverage':coverage}
    return kept,graph['shoots'],crowding
