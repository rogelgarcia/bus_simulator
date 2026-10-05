# Builds all mature review specimens from authenticated recipes and real PBR sources.
import ast
import json
import sys
from pathlib import Path
import bpy
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / 'authoring'))
sys.path.insert(0, str(HERE.parent / 'showcase'))
sys.path.insert(0, str(HERE))
from geometry import create_tree, create_shrub
from woody_detail import detail_wood
from leaf_geometry import foliage_instances, tube_template, bulk_mesh, LENGTH_RATIO
from instancing import point_instances
from maps import prepare
from materials import bark_material, leaf_material
from leaves import template
from scene import main as scene_main


def main(root, output):
    recipes = json.loads((HERE / 'recipes.json').read_text())
    packs = prepare(root, output, recipes)
    studies = {}
    def family(root, folder, collection, center):
        recipe = json.loads((HERE.parent / folder / 'recipe.json').read_text())
        manifest = json.loads((root / 'assets/public/vegetation' / folder / 'index.json').read_text())
        settings = recipes[folder]
        leaf = leaf_material(folder, packs[folder]['leaf'])
        twig=bpy.data.materials.new(folder+' / young woody twigs');twig.use_nodes=True
        twig.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.075,.049,.019,1)
        twig.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.76
        templates = [template(recipe['texture']['leaf'], form, packs[folder]['leaf'], settings) for form in range(8)]
        templates.append(tube_template(radius=1))
        studies[folder] = (templates, leaf, recipe, center)
        inventory = []
        for index, variant in enumerate(recipe['variants']):
            name = folder + '/' + variant['id']
            barkmat, surface = bark_material(name, packs[folder]['bark'], settings, variant['seed'])
            generator = create_shrub if recipe['kind']=='shrub' else create_tree
            objects, _ = generator(variant, recipe['profile'], {'bark':barkmat,'foliage':leaf},
                                    {**recipe['growth'],'leavesPerCard':recipe['texture']['leafCount']})
            bark, old_foliage = objects
            clusters = ast.literal_eval(old_foliage['leaf_clusters'])
            instances, original_templates, count, _ = foliage_instances(clusters, variant, recipe)
            expected = next(row['foliageDetail'] for row in manifest['variants'] if row['id']==variant['id'])
            low, high = np.full(3,np.inf), np.full(3,-np.inf)
            for form in range(9):
                rows=[row for row in instances if row[0]==form]
                for offset in range(0,len(rows),1000):
                    batch=rows[offset:offset+1000]
                    matrices=np.array([row[1] for row in batch]);origins=np.array([row[2] for row in batch])
                    positions=np.einsum('vj,ikj->ivk',original_templates[form][0],matrices)+origins[:,None,:]
                    low=np.minimum(low,positions.min(axis=(0,1)));high=np.maximum(high,positions.max(axis=(0,1)))
            error=float(max(np.max(np.abs(low-expected['bounds']['min'])),np.max(np.abs(high-expected['bounds']['max']))))
            if count != expected['leafCount'] or error>2e-5: raise RuntimeError('Original canopy anchor contract changed: '+name)
            bpy.data.objects.remove(old_foliage,do_unlink=True)
            for owner in list(bark.users_collection): owner.objects.unlink(bark)
            collection.objects.link(bark);bark.name=name+' / original wood'
            authored=json.loads(json.dumps(recipe));authored['woodyDetail']['reliefMetres']=settings['relief'];authored['woodyDetail']['scarCount']=0
            woody=detail_wood(bark,variant,authored,scanned_surface=surface)
            foliage=point_instances(name,instances,templates,leaf,collection,twig)
            spacing=6 if recipe['kind']=='shrub' else 19
            location=(center[0]+(index-1)*spacing,center[1],-.025)
            for obj in [bark,foliage]:
                obj.location=location;obj['species']=recipe['species'];obj['variant']=variant['id'];obj['surfaceRevision']='photographic-pbr-v1'
            inventory.append({'species':folder,'variant':variant['id'],'position':location,'leafCount':count,
                'instances':len(instances),'woodTriangles':woody['barkTriangles'],'woodyDetail':woody,
                'sourceBoundsErrorMetres':error,'leafTemplateTriangles':len(templates[0][1]),'closedLeafShells':True,
                'barkAppearance':{'revision':'photographic-pbr-v1','source':settings['bark']},
                'leafSource':settings['leaf'],'approximation':settings['note']})
            print('[Photo PBR] Rebuilt',name,woody['barkTriangles'],'wood triangles;',count,'solid leaves',flush=True)
        return recipe,manifest,inventory
    def leaf_studies(scene,camera):
        views=[]
        for folder,(templates,material,recipe,center) in studies.items():
            width=sum(recipe['growth']['leafWidthMetres'])*.5
            length=width*LENGTH_RATIO[recipe['texture']['leaf']]
            center=np.array([center[0],center[1]-18,1.6])
            instances=[]
            for form in range(4):
                underside=form>=2
                sign=-1 if underside else 1
                matrix=np.array([[width*sign,0,0],[0,0,-length*sign],[0,length,0]])
                origin=center+[(form%2-.5)*width*1.6,0,(.5-form//2)*length*1.4]
                instances.append((form,matrix,origin,np.ones(3)))
            obj,_=bulk_mesh(folder+' / leaf front and underside study',instances,templates,material)
            for owner in list(obj.users_collection):owner.objects.unlink(obj)
            bpy.data.collections[folder].objects.link(obj);obj['leafStudy']=True;obj['variant']='mature_01'
            target=center+[0,0,length*.45]
            distance=max(width*3.4,length*2.7)*60/20.25
            view=camera(scene,folder+'_leaf_study',target+[0,-distance,.04],target,60)
            view.update({'species':folder,'variant':'mature_01','study':True,'closeup':True,
                         'label':'Solid leaves — upper surfaces and undersides'})
            views.append(view)
        return views
    scene_main(root,output,family,leaf_studies,'photographic-pbr-v1')


if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:]
    main(Path(args[0]),Path(args[1]))
