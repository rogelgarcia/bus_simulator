# Sizes supporting wood by downstream reach as well as leaf demand, keeping taper continuous through forks.
import numpy as np


def supported_reach(paths):
    reach=[np.zeros(len(p['points'])) for p in paths]
    for i in reversed(range(len(paths))):
        path=paths[i];steps=np.linalg.norm(np.diff(path['points'],axis=0),axis=1)
        for j in reversed(range(len(steps))):reach[i][j]=max(reach[i][j],steps[j]+reach[i][j+1])
        if path['parent']>=0:
            parent=path['parent'];node=path['parentNode'];reach[parent][node]=max(reach[parent][node],reach[i][0])
    return reach


def size_support(paths,policy):
    reach=supported_reach(paths);limit=policy['maximumSupportedSlenderness']
    for i,path in enumerate(paths):
        path['radii']=np.maximum(path['radii'],np.maximum(policy['minimumTwigRadiusMetres'],reach[i]/(2*limit)))
    for path in reversed(paths):
        path['radii']=np.maximum.accumulate(path['radii'][::-1])[::-1]
        if path['parent']>=0:
            parent=paths[path['parent']];node=path['parentNode'];parent['radii'][node]=max(parent['radii'][node],path['radii'][0])
    return {'rule':'Downstream path reach divided by supporting diameter; artistic allometry, not a beam solver',
            'maximumRequiredSlenderness':limit,'maximumActualSlenderness':float(max(np.max(r/(2*p['radii'])) for r,p in zip(reach,paths)))}
