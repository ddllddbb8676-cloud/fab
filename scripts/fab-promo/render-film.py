import bpy, json, os, sys, math, time, numpy as np
from mathutils import Matrix, Vector

ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../../outputs/fab-promo-2026-11-02'))
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
root_arg=next((a.split('=',1)[1] for a in args if a.startswith('--root=')),None)
if root_arg:ROOT=os.path.abspath(root_arg)
clip_ids=(args[0] if args else '01-emo,02-bay').split(',')
preview='--preview' in args
width=540 if preview else 1080
height=960 if preview else 1920
C=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
CI=C.inverted()
def xyz(v):return (v[0],-v[2],v[1])
def matrix(v):return C@Matrix(np.asarray(v).reshape((4,4),order='F').tolist())@CI
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x=width;scene.render.resolution_y=height;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB';scene.render.image_settings.compression=15
scene.render.fps=30
scene.render.use_persistent_data=True
samples_arg=next((a.split('=',1)[1] for a in args if a.startswith('--samples=')),None)
if hasattr(scene.eevee,'taa_render_samples'):scene.eevee.taa_render_samples=int(samples_arg) if samples_arg else (16 if preview else 24)
scene.render.film_transparent=False
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=-.5
scene.world=bpy.data.worlds.new('FAB soft blue world');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.68,.78,.81,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=2.2
data=json.load(open(os.path.join(ROOT,'assets.json'),encoding='utf8'))
images=[]
for entry in data['textures']:
    images.append(bpy.data.images.load(os.path.join(ROOT,entry['file']),check_existing=True))
materials={}
def material(index,vertex=False):
    key=(index,vertex)
    if key in materials:return materials[key]
    spec=data['materials'][index];m=bpy.data.materials.new('film-material-'+str(index));m.use_nodes=True
    nodes=m.node_tree.nodes;links=m.node_tree.links;bs=nodes.get('Principled BSDF')
    bs.inputs['Roughness'].default_value=spec['roughness'];bs.inputs['Metallic'].default_value=spec['metalness']
    info=nodes.new('ShaderNodeObjectInfo');color=info.outputs['Color'];alpha=info.outputs['Alpha']
    def multiply(a,b):
        node=nodes.new('ShaderNodeMixRGB');node.blend_type='MULTIPLY';node.inputs[0].default_value=1;links.new(a,node.inputs[1]);links.new(b,node.inputs[2]);return node.outputs[0]
    def multiply_alpha(a,b):
        node=nodes.new('ShaderNodeMath');node.operation='MULTIPLY';links.new(a,node.inputs[0]);links.new(b,node.inputs[1]);return node.outputs[0]
    if vertex:
        node=nodes.new('ShaderNodeVertexColor');node.layer_name='Color';color=multiply(color,node.outputs['Color'])
    if spec['map'] is not None:
        tex=nodes.new('ShaderNodeTexImage');tex.image=images[spec['map']];tex.interpolation='Linear';color=multiply(color,tex.outputs['Color']);alpha=multiply_alpha(alpha,tex.outputs['Alpha'])
    if spec['alphaMap'] is not None:
        tex=nodes.new('ShaderNodeTexImage');tex.image=images[spec['alphaMap']];alpha=multiply_alpha(alpha,tex.outputs['Color'])
    links.new(color,bs.inputs['Base Color']);links.new(alpha,bs.inputs['Alpha'])
    if spec['basic']:
        links.new(color,bs.inputs['Emission Color']);bs.inputs['Emission Strength'].default_value=.65
    elif spec['emissiveIntensity']>0:
        bs.inputs['Emission Color'].default_value=(*spec['emissive'],1);bs.inputs['Emission Strength'].default_value=spec['emissiveIntensity']
    if spec['transparent']:m.surface_render_method='DITHERED'
    m.use_backface_culling=False
    materials[key]=m;return m
geometries={}
def geometry(index):
    if index in geometries:return geometries[index]
    entry=data['geometries'][index];verts=[xyz(entry['positions'][i:i+3]) for i in range(0,len(entry['positions']),3)]
    if entry['kind']=='lines':
        mesh=bpy.data.curves.new('PVC grid','CURVE');mesh.dimensions='3D';mesh.resolution_u=1;mesh.bevel_depth=.0012;mesh.bevel_resolution=0
        for i in range(0,len(verts),2):
            s=mesh.splines.new('POLY');s.points.add(1);s.points[0].co=(*verts[i],1);s.points[1].co=(*verts[i+1],1)
    else:
        idx=entry['indices'] or list(range(len(verts)));faces=[idx[i:i+3] for i in range(0,len(idx),3)]
        mesh=bpy.data.meshes.new('geometry-'+str(index));mesh.from_pydata(verts,[],faces);mesh.update()
        for p in mesh.polygons:p.use_smooth=True
        if entry['normals'] and hasattr(mesh,'normals_split_custom_set_from_vertices'):mesh.normals_split_custom_set_from_vertices([xyz(entry['normals'][i:i+3]) for i in range(0,len(entry['normals']),3)])
        if entry['uv']:
            uv=mesh.uv_layers.new(name='UVMap');arr=entry['uv'];flat=[]
            for loop in mesh.loops:flat.extend((arr[loop.vertex_index*2],arr[loop.vertex_index*2+1]))
            uv.data.foreach_set('uv',flat)
        if entry['colors']:
            attr=mesh.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT');cs=entry['colors'];rgba=np.ones((len(verts),4),dtype=np.float32);rgba[:,:3]=np.asarray(cs).reshape((-1,3));attr.data.foreach_set('color',rgba.ravel())
    geometries[index]=mesh;return mesh
def create_object(entry):
    mesh=geometry(entry['geometry']);o=bpy.data.objects.new(entry.get('name','piece'),mesh);scene.collection.objects.link(o)
    mat=material(entry['material'],bool(data['geometries'][entry['geometry']]['colors']))
    if not mesh.materials:mesh.materials.append(mat)
    o.material_slots[0].link='OBJECT';o.material_slots[0].material=mat
    return o
static=[]
for entry in data['staticObjects']:
    o=create_object(entry);o.matrix_world=matrix(entry['data'][:16]);o.color=entry['data'][16:20];static.append((o,entry.get('equipmentId')))
def point(o,target,up=(0,0,1)):
    forward=(Vector(target)-o.location).normalized();right=forward.cross(Vector(up)).normalized();upright=right.cross(forward).normalized()
    o.rotation_euler=Matrix((right,upright,-forward)).transposed().to_euler()
for loc,energy,size,color in [((-25,-2,12),11000,25,(1,.97,.92)),((-40,10,9),6500,18,(.82,.92,1)),((-10,-8,8),5500,16,(1,1,1))]:
    ld=bpy.data.lights.new('FAB softbox','AREA');ld.energy=energy;ld.shape='DISK';ld.size=size;ld.color=color;o=bpy.data.objects.new('FAB softbox',ld);scene.collection.objects.link(o);o.location=loc;point(o,(-28,0,0))
ld=bpy.data.lights.new('FAB daylight','SUN');ld.energy=1.1;ld.angle=math.radians(10);o=bpy.data.objects.new('FAB daylight',ld);scene.collection.objects.link(o);o.rotation_euler=(.4,-.5,-.3)
cam_data=bpy.data.cameras.new('Film camera');cam=bpy.data.objects.new('Film camera',cam_data);scene.collection.objects.link(cam);scene.camera=cam;cam_data.clip_start=.025;cam_data.clip_end=300;cam_data.sensor_fit='VERTICAL';cam_data.sensor_height=36
os.makedirs(os.path.join(ROOT,'previews'),exist_ok=True)
start=time.time();print('FILM_SCENE_READY '+str(len(static)),flush=True)
for clip_id in clip_ids:
    clip=json.load(open(os.path.join(ROOT,clip_id+'.json'),encoding='utf8'));objects=[create_object(entry) for entry in clip['objects']]
    transforms=np.memmap(os.path.join(ROOT,clip_id+'.bin'),mode='r',dtype=np.float32,shape=(clip['frames'],len(objects),20))
    folder=os.path.join(ROOT,'frames',clip_id);os.makedirs(folder,exist_ok=True)
    indices=([0,18,42,75,105] if clip_id=='01-emo' else [15,60,120,210]) if preview else range(clip['frames'])
    frame_arg=next((a.split('=',1)[1] for a in args if a.startswith('--frames=')),None)
    if frame_arg:indices=[int(v) for v in frame_arg.split(',')]
    def apply_frame(f):
        for o,spec in zip(objects,transforms[f]):
            visible=abs(spec[15])>.5 and spec[19]>.001;o.hide_render=not visible
            if visible:o.matrix_world=matrix(spec[:16]);o.color=tuple(spec[16:20])
        hidden=set(clip['hiddenEquipment'][f])
        for o,owner in static:o.hide_render=owner in hidden
        shot=clip['cameras'][f];cam.location=xyz(shot['position']);point(cam,xyz(shot['target']),xyz(shot['up']))
        if shot['ortho']:
            cam_data.type='ORTHO';cam_data.ortho_scale=shot['ortho']
        else:
            cam_data.type='PERSP';cam_data.lens=cam_data.sensor_height/(2*math.tan(math.radians(shot['fov'])/2))
        if preview or f%30==0:print('FILM_PROGRESS '+json.dumps({'clip':clip_id,'frame':f,'total':clip['frames'],'elapsed':round(time.time()-start,1)}),flush=True)
    if preview or frame_arg:
        for f in indices:
            if f>=clip['frames']:continue
            apply_frame(f)
            scene.render.filepath=os.path.join(ROOT,'previews',f'{clip_id}-{f:04}.png') if preview else os.path.join(folder,f'{f:04}.png')
            if not preview and os.path.exists(scene.render.filepath):continue
            bpy.ops.render.render(write_still=True)
    else:
        missing=[f for f in range(clip['frames']) if not os.path.exists(os.path.join(folder,f'{f:04}.png'))]
        if missing:
            scene.frame_start=min(missing);scene.frame_end=clip['frames']-1;scene.frame_step=1
            end_arg=next((a.split('=',1)[1] for a in args if a.startswith('--end=')),None)
            if end_arg:scene.frame_end=min(scene.frame_end,int(end_arg))
            def on_frame(scene,*_):apply_frame(scene.frame_current)
            bpy.app.handlers.frame_change_pre.append(on_frame)
            scene.render.filepath=folder+os.sep
            try:bpy.ops.render.render(animation=True)
            finally:bpy.app.handlers.frame_change_pre.remove(on_frame)
    for o in objects:bpy.data.objects.remove(o,do_unlink=True)
print('FILM_RENDER_DONE',flush=True)
