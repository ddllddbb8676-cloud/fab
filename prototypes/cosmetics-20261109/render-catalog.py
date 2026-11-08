"""Render thumbnails from the exact Three.js meshes used in the live viewer."""
from pathlib import Path
import sys

REPO = Path(__file__).resolve().parents[2]
source = (REPO / 'scripts/fab-promo/render-film.py').read_text(encoding='utf-8')
# Reuse its proven Three.js-to-Blender coordinate/material/texture conversion.
sys.argv = ['blender', '--', 'catalog', '--root=' + str(REPO / 'outputs/cosmetics-20261109')]
exec(compile(source.split("start=time.time();print")[0], str(REPO / 'scripts/fab-promo/render-film.py'), 'exec'))

scene.render.resolution_x=600
scene.render.resolution_y=750
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
scene.view_settings.exposure=0
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.74,.80,.84,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.65
for light in [o for o in bpy.data.objects if o.type=='LIGHT']:
    bpy.data.objects.remove(light,do_unlink=True)
for loc,energy,size,color in [((2.4,-3.5,4),250,4,(1,.94,.87)),((-3,-1,2),150,3,(.74,.87,1)),((1,2,3),180,2,(1,1,1))]:
    ld=bpy.data.lights.new('Catalog softbox','AREA');ld.energy=energy;ld.shape='DISK';ld.size=size;ld.color=color
    light=bpy.data.objects.new('Catalog softbox',ld);scene.collection.objects.link(light);light.location=loc;point(light,(0,0,.9))
scene.render.film_transparent=True
scene.render.image_settings.color_mode='RGBA'
manifest=json.load(open(os.path.join(ROOT,'manifest.json'),encoding='utf-8'))
folder=os.path.join(ROOT,'renders');os.makedirs(folder,exist_ok=True)
for item in manifest['items']:
    clip_id='item-'+str(item['number']).zfill(2)
    clip=json.load(open(os.path.join(ROOT,clip_id+'.json'),encoding='utf-8'))
    objects=[create_object(entry) for entry in clip['objects']]
    transforms=np.memmap(os.path.join(ROOT,clip_id+'.bin'),mode='r',dtype=np.float32,shape=(2,len(objects),20))
    for f in [0,1]:
        for obj,spec in zip(objects,transforms[f]):
            obj.matrix_world=matrix(spec[:16]);obj.color=tuple(spec[16:20])
        shot=clip['cameras'][f];cam.location=xyz(shot['position']);point(cam,xyz(shot['target']))
        cam_data.type='ORTHO';cam_data.ortho_scale=shot['ortho']
        scene.render.filepath=os.path.join(folder,clip_id+('-main.png' if f==0 else '-alt.png'))
        bpy.ops.render.render(write_still=True)
    for obj in objects:bpy.data.objects.remove(obj,do_unlink=True)
    print('ITEM_RENDERED '+str(item['number']),flush=True)
print('CATALOG_RENDER_DONE',flush=True)
