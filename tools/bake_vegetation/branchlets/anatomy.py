# Authors connected irregular shoots with petioles rooted on twig nodes, before any atlas projection.
import numpy as np


def unit(value):
    return value / np.linalg.norm(value)


def branchlet(count, seed, opposite=False):
    rng = np.random.default_rng(seed)
    nodes = [np.array([0., 0., 0.])]
    edges, leaves, shoots = [], [], []
    main_count = min(count, 5 if count > 10 else 3)
    side_count = max(1, int(np.ceil((count-main_count)/4)))
    slots = np.array_split(np.arange(count-main_count), side_count)
    main_y = np.r_[0., np.cumsum(rng.uniform(.10, .18, side_count+2))]
    main_y = main_y/main_y[-1]*.82
    for index, y in enumerate(main_y[1:]):
        nodes.append(np.array([.045*np.sin(y*4+seed)+rng.uniform(-.014,.014), y, rng.uniform(-.007,.007)]))
        edges.append((len(nodes)-2, len(nodes)-1))
    main_ids = list(range(len(nodes)))
    shoots.append((main_ids[-3:], main_count, 'terminal'))
    for index, ids in enumerate(slots):
        anchor = main_ids[index+1]
        sign = -1 if (index+seed)%2 else 1
        length = rng.uniform(.25, .39)*(1-.16*index/max(side_count,1))
        direction = unit(np.array([sign*rng.uniform(.72,1.0), rng.uniform(.32,.70), rng.uniform(-.04,.04)]))
        middle = nodes[anchor]+direction*length*.48 + [rng.uniform(-.025,.025),rng.uniform(-.016,.016),0]
        tip = nodes[anchor]+direction*length
        first = len(nodes); nodes.extend([middle, tip]); edges.extend([(anchor,first),(first,first+1)])
        shoots.append(([anchor, first, first+1], len(ids), 'lateral'))
    for shoot_index, (path, number, role) in enumerate(shoots):
        a, b = nodes[path[0]], nodes[path[-1]]
        direction = unit(b-a); across = unit(np.cross(direction, [0,0,1]))
        lengths=np.array([np.linalg.norm(nodes[v]-nodes[u]) for u,v in zip(path[:-1],path[1:])])
        distances=np.r_[0.,np.cumsum(lengths)]/lengths.sum()
        if opposite:
            pairs = (number+1)//2
            stations = np.repeat(np.linspace(.25,.92,pairs)+rng.uniform(-.055,.055,pairs),2)[:number]
        else:
            steps = rng.uniform(.55,1.5,number)
            stations = .14+.80*(np.cumsum(steps)-steps[0]) / max(1e-6,steps.sum()-steps[0]) if number > 1 else [.7]
        for index, station in enumerate(stations):
            sign = -1 if (index+shoot_index)%2 else 1
            segment=min(len(lengths)-1,int(np.searchsorted(distances,station,side='right')-1))
            fraction=(station-distances[segment])/(distances[segment+1]-distances[segment])
            point=nodes[path[segment]]*(1-fraction)+nodes[path[segment+1]]*fraction
            aim = unit(across*sign*rng.uniform(.66,1.05)+direction*rng.uniform(.18,.67))
            angle = rng.uniform(-.30,.30)
            c, s = np.cos(angle), np.sin(angle)
            aim = unit(np.array([aim[0]*c-aim[1]*s, aim[0]*s+aim[1]*c, 0]))
            width = rng.uniform(.135,.185)/np.sqrt(max(1, count/9))
            leaves.append({'attachment': point, 'direction': aim, 'width': width,
                           'roll': rng.uniform(-.55,.55), 'form': int(rng.integers(8)),
                           'shoot': shoot_index, 'station': float(station), 'tint': float(rng.uniform(.81,1.06))})
    return {'nodes': nodes, 'edges': edges, 'leaves': leaves, 'seed': seed, 'opposite': opposite, 'tip': main_ids[-1]}


def twig_mesh(graph, radius):
    points, faces, uvs = [], [], []
    children={a for a,b in graph['edges']}
    for a, b in graph['edges']:
        start, end = graph['nodes'][a], graph['nodes'][b]
        along = unit(end-start); side = unit(np.cross(along,[0,0,1])); normal = np.cross(side,along)
        offset = len(points)
        for point, r in [(start,radius*(1-.55*start[1])),(end,radius*(.12 if b not in children else 1-.55*end[1]))]:
            for i in range(8): points.append(point+r*(side*np.cos(i*np.pi/4)+normal*np.sin(i*np.pi/4)))
        for i in range(8):
            j=(i+1)%8
            faces.extend([(offset+i,offset+8+i,offset+8+j),(offset+i,offset+8+j,offset+j)])
            uvs.extend([(i/8,0),(i/8,1),((i+1)/8,1),(i/8,0),((i+1)/8,1),((i+1)/8,0)])
    return np.asarray(points), np.asarray(faces), np.asarray(uvs)
