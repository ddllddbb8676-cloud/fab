// The eleven approved 2026-11-03 designs. Coordinates match the existing avatar:
// feet at zero, +Z toward the face, bags turned to face -Z on the upper body.
export function createPlayfulAccessories(THREE, attachment) {
  const items = {};
  const material = (color, options = {}) => new THREE.MeshStandardMaterial({color, roughness: .43, ...options});
  const dark = material('#37424b'), pink = material('#f995b5'), cream = material('#fff0cf');
  const sphere = new THREE.SphereGeometry(1, 16, 10);
  function group(id) {
    const root = new THREE.Group(); root.name = id; root.visible = false;
    root.userData.itemId = id; attachment.add(root); items[id] = root; return root;
  }
  function mesh(geometry, mat, parent, x = 0, y = 0, z = 0) {
    const object = new THREE.Mesh(geometry, mat); object.position.set(x, y, z);
    object.castShadow = !mat.transparent; object.receiveShadow = true; parent.add(object); return object;
  }
  function ball(parent, mat, x, y, z, sx, sy, sz) {
    const object = mesh(sphere, mat, parent, x, y, z); object.scale.set(sx, sy, sz); return object;
  }
  function tube(points, radius, mat, parent, closed = false) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), closed);
    // A fixed cap keeps long shaped outlines cheap enough for nearby avatars.
    return mesh(new THREE.TubeGeometry(curve, Math.min(80, Math.max(16, points.length * 3)), radius, 5, closed), mat, parent);
  }
  function solid(shape, parent, mat, depth = .04, bevel = .009) {
    return mesh(new THREE.ExtrudeGeometry(shape, {depth, steps: 1, bevelEnabled: true,
      bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 12}), mat, parent);
  }
  function shape(draw) { const s = new THREE.Shape(); draw(s); s.closePath(); return s; }

  const cat = group('cat-ears'), charcoal = material('#463e4c');
  // The sloped bases follow the curved hood and sink slightly into it, so the
  // outer corners touch too. A flat base can hover over a spherical head.
  const earShape = shape(s => {
    s.moveTo(-.08, -.085); s.bezierCurveTo(-.103, .04, -.083, .18, -.06, .24);
    s.quadraticCurveTo(-.048, .263, -.016, .231); s.quadraticCurveTo(.06, .163, .085, .08);
    s.quadraticCurveTo(.003, .005, -.08, -.085);
  });
  const innerEar = shape(s => {s.moveTo(-.048, -.015); s.lineTo(-.044, .193); s.quadraticCurveTo(.008, .16, .055, .09);s.quadraticCurveTo(-.005,.043,-.048,-.015);});
  for (const side of [-1, 1]) {
    const ear = new THREE.Group(); ear.position.set(side * .165, 1.325, -.032);
    if (side === 1) ear.scale.x = -1; cat.add(ear);
    solid(earShape, ear, charcoal, .052, .012);
    const inner = solid(innerEar, ear, pink, .007, .004); inner.position.z = .059;
  }

  const puppy = group('puppy-ears'), caramel = material('#c98b52');
  const droop = shape(s => {
    s.moveTo(-.022, .145); s.bezierCurveTo(.082, .125, .11, -.055, .098, -.145);
    s.bezierCurveTo(.082, -.225, -.038, -.225, -.047, -.143);
    s.bezierCurveTo(-.053, -.065, .013, .02, -.022, .145);
  });
  for (const side of [-1, 1]) {
    const ear = new THREE.Group(); ear.position.set(side * .228, 1.22, .011); ear.scale.x = side; ear.rotation.z = side * .09; puppy.add(ear);
    solid(droop, ear, caramel, .066, .018);
  }

  const cap = group('moon-cap'), lavender = material('#b19be9'), yellow = material('#f4cf66');
  // Swept tapered rings make a soft bent nightcap instead of a rigid cone.
  const rings = [[0,1.31,0,.267,.243],[0,1.405,0,.245,.22],[.02,1.50,0,.19,.17],
    [.075,1.565,0,.135,.12],[.15,1.58,0,.093,.083],[.225,1.535,0,.061,.054],[.27,1.46,0,.018,.018]];
  const vertices = [], indices = [], sides = 24;
  for (const [x,y,z,rx,rz] of rings) for(let i=0;i<=sides;i++) { const a=i/sides*Math.PI*2; vertices.push(x+Math.cos(a)*rx,y,z+Math.sin(a)*rz); }
  for(let r=0;r<rings.length-1;r++)for(let i=0;i<sides;i++){const a=r*(sides+1)+i,b=a+sides+1;indices.push(a,b,a+1,b,b+1,a+1);}
  const capGeometry = new THREE.BufferGeometry(); capGeometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3)); capGeometry.setIndex(indices); capGeometry.computeVertexNormals();
  mesh(capGeometry, lavender, cap);
  const rim = mesh(new THREE.TorusGeometry(.255,.026,8,40),cream,cap,0,1.32,0); rim.rotation.x=Math.PI/2; rim.scale.y=.92;
  ball(cap,yellow,.274,1.445,.005,.048,.054,.048);
  const moon = shape(s=>{s.moveTo(.028,.057);s.bezierCurveTo(-.065,.07,-.078,-.062,.012,-.062);s.quadraticCurveTo(.046,-.065,.062,-.037);s.bezierCurveTo(-.013,-.053,-.041,.023,.028,.057);});
  const crescent=solid(moon,cap,yellow,.012,.003);crescent.position.set(.053,1.46,.21);crescent.rotation.x=-.35;

  const flower=group('flower-glasses'),petalMat=material('#ffce51'),orange=material('#f4a04b');
  const lensMat=material('#dff4f3',{transparent:true,opacity:.12,depthWrite:false,side:THREE.DoubleSide,roughness:.15});
  const spiral=group('spiral-glasses'),mint=material('#78cfa9'),purple=material('#9a76d1');
  for(const [parent,frame] of [[flower,orange],[spiral,mint]]){
    for(const side of [-1,1]){
      const x=side*.084,y=1.148,z=.269;
      mesh(new THREE.CircleGeometry(.057,24),lensMat,parent,x,y,z);
      mesh(new THREE.TorusGeometry(.061,.007,6,28),frame,parent,x,y,z+.005);
      tube([[side*.145,y+.012,z],[side*.23,y,.15],[side*.26,y-.015,.033]],.0045,frame,parent);
      if(parent===flower){
        for(let n=0;n<7;n++){const a=n/7*Math.PI*2;const p=ball(parent,petalMat,x+Math.cos(a)*.078,y+Math.sin(a)*.078,z,.025,.029,.011);p.rotation.z=a-Math.PI/2;}
      } else {
        const points=[];for(let n=0;n<=44;n++){const t=n/44,a=t*Math.PI*4.5,r=.004+t*.044;points.push([x+Math.cos(a)*r,y+Math.sin(a)*r,z+.013]);}
        tube(points,.0038,purple,parent);
      }
    }
    tube([[-.021,1.15,.275],[0,1.159,.281],[.021,1.15,.275]],.005,frame,parent);
  }

  const gridMat=new THREE.LineBasicMaterial({color:'#6d8796',transparent:true,opacity:.7,depthWrite:false});
  function bag(id,tint,edge){
    const root=group(id),pack=new THREE.Group();pack.name='backpack';pack.position.set(0,.75,-.171);pack.rotation.y=Math.PI;root.add(pack);
    const pvc=material(tint,{transparent:true,opacity:.52,depthWrite:false,side:THREE.DoubleSide,roughness:.22,metalness:.03});
    const trim=material(edge,{roughness:.38});
    for(const side of [-1,1])tube([[side*.102,.15,0],[side*.155,.21,-.13],[side*.175,.105,-.28],[side*.14,-.11,-.265],[side*.105,-.175,0]],.012,trim,pack);
    return {pack,pvc,trim};
  }
  function pvcShape(s,{pack,pvc,trim},depth=.10){
    const body=solid(s,pack,pvc,depth,.012);body.name='pvc-shell';body.renderOrder=1;
    const contour=s.getPoints(14);if(contour.at(-1).distanceTo(contour[0])<1e-8)contour.pop();
    tube(contour.map(p=>[p.x,p.y,depth+.012]),.007,trim,pack,true);
    tube(contour.map(p=>[p.x,p.y,-.012]),.0045,trim,pack,true);
    // Clip entire grid lines against the outline: no thousands of tiny segments.
    const positions=[],spacing=.029;
    for(const axis of ['x','y']){
      const other=axis==='x'?'y':'x',low=Math.min(...contour.map(p=>p[axis])),high=Math.max(...contour.map(p=>p[axis]));
      for(let value=Math.ceil(low/spacing)*spacing;value<high;value+=spacing){
        const crossings=[];
        for(let i=0;i<contour.length;i++){const a=contour[i],b=contour[(i+1)%contour.length];if((a[axis]>value)===(b[axis]>value))continue;crossings.push(a[other]+(value-a[axis])*(b[other]-a[other])/(b[axis]-a[axis]));}
        crossings.sort((a,b)=>a-b);
        for(let i=0;i+1<crossings.length;i+=2){const a=crossings[i],b=crossings[i+1];if(b-a<.001)continue;if(axis==='x')positions.push(value,a,depth+.014,value,b,depth+.014);else positions.push(a,value,depth+.014,b,value,depth+.014);}
      }
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    const grid=new THREE.LineSegments(geometry,gridMat);grid.name='pvc-grid';grid.renderOrder=2;pack.add(grid);
    const top=Math.max(...contour.map(p=>p.y));
    tube([[-.034,top-.018,.025],[-.032,top+.022,.025],[.032,top+.022,.025],[.034,top-.018,.025]],.007,trim,pack);
    // A small zipper pull reads as a real bag even when the body is animal-shaped.
    const pull=mesh(new THREE.TorusGeometry(.012,.003,5,12),cream,pack,-.115,Math.min(top-.025,.13),depth+.022);pull.scale.y=1.4;
    return depth+.022;
  }
  function smile(pack,z,y=0,spacing=.055){
    for(const side of [-1,1])ball(pack,dark,side*spacing,y+.025,z,.009,.012,.005);
    tube([[-.026,y-.018,z],[0,y-.034,z],[.026,y-.018,z]],.0035,dark,pack);
  }

  const axolotl=bag('bag-axolotl','#f2b5d4','#e982b7'),gills=material('#f17fab');
  const oval=new THREE.Shape();oval.absellipse(0,0,.172,.193,0,Math.PI*2,false,0);
  const axoZ=pvcShape(oval,axolotl);smile(axolotl.pack,axoZ);
  for(const side of [-1,1])for(let n=0;n<3;n++){
    const g=ball(axolotl.pack,gills,side*(n===1?.207:.19),.075-n*.074,.045,.055,.023,.023);g.rotation.z=side*(n-1)*-.47;
  }

  const peach=bag('bag-peach','#f5c3be','#e9a1a4');
  const peachShape=shape(s=>{s.moveTo(0,.15);s.bezierCurveTo(-.15,.26,-.255,.04,-.16,-.123);s.bezierCurveTo(-.11,-.21,-.035,-.195,0,-.17);s.bezierCurveTo(.035,-.195,.11,-.21,.16,-.123);s.bezierCurveTo(.255,.04,.15,.26,0,.15);});
  const peachZ=pvcShape(peachShape,peach);
  tube([[0,.14,peachZ],[.015,.04,peachZ],[.012,-.08,peachZ],[0,-.166,peachZ]],.0035,peach.trim,peach.pack);
  const leaf=ball(peach.pack,material('#81be8f'),.048,.187,.077,.074,.029,.012);leaf.rotation.z=.48;

  const jelly=bag('bag-jellyfish','#bddfee','#91bddf'),ribbonPvc=material('#c2afea',{transparent:true,opacity:.72,depthWrite:false,roughness:.28,side:THREE.DoubleSide});
  const jellyShape=shape(s=>{s.moveTo(-.18,-.065);s.bezierCurveTo(-.175,.25,.175,.25,.18,-.065);s.quadraticCurveTo(.14,-.10,.108,-.065);s.quadraticCurveTo(.072,-.102,.036,-.065);s.quadraticCurveTo(0,-.102,-.036,-.065);s.quadraticCurveTo(-.072,-.102,-.108,-.065);s.quadraticCurveTo(-.145,-.10,-.18,-.065);});
  const jellyZ=pvcShape(jellyShape,jelly);for(const side of [-1,1])ball(jelly.pack,dark,side*.052,.045,jellyZ,.009,.012,.005);
  for(let n=0;n<5;n++){
    const x=(n-2)*.057,points=[];
    for(let i=0;i<=8;i++){const t=i/8;points.push([x+Math.sin(t*Math.PI*2.7+n*.5)*.013,-.066-t*.17,.038]);}
    const tentacle=tube(points,.011,ribbonPvc,jelly.pack);tentacle.name='jellyfish-ribbon';tentacle.renderOrder=1;
  }

  const cloud=bag('bag-cloud','#e2ebf0','#92bedf');
  const cloudShape=shape(s=>{s.moveTo(-.16,-.12);s.bezierCurveTo(-.29,-.12,-.29,.065,-.16,.075);s.bezierCurveTo(-.17,.205,-.015,.245,.036,.14);s.bezierCurveTo(.13,.21,.21,.14,.197,.06);s.bezierCurveTo(.30,.035,.27,-.125,.16,-.125);s.lineTo(-.16,-.12);});
  const cloudZ=pvcShape(cloudShape,cloud);smile(cloud.pack,cloudZ,-.027);
  for(const [n,color] of ['#f38fa9','#f6d465','#91d3ce'].entries()){
    const points=[],radius=.058-n*.012;for(let i=0;i<=12;i++){const a=Math.PI*i/12;points.push([.073+Math.cos(a)*radius,.071+Math.sin(a)*radius,cloudZ+.004]);}
    tube(points,.006,material(color),cloud.pack);
  }

  const gamepad=bag('bag-gamepad','#c9b8e5','#89cdb9');
  const controller=shape(s=>{s.moveTo(-.095,.12);s.bezierCurveTo(-.17,.13,-.207,.01,-.21,-.10);s.bezierCurveTo(-.211,-.20,-.105,-.18,-.061,-.09);s.quadraticCurveTo(0,-.071,.061,-.09);s.bezierCurveTo(.105,-.18,.211,-.20,.21,-.10);s.bezierCurveTo(.207,.01,.17,.13,.095,.12);s.lineTo(-.095,.12);});
  const padZ=pvcShape(controller,gamepad);
  const plus=shape(s=>{s.moveTo(-.014,.044);s.lineTo(.014,.044);s.lineTo(.014,.014);s.lineTo(.044,.014);s.lineTo(.044,-.014);s.lineTo(.014,-.014);s.lineTo(.014,-.044);s.lineTo(-.014,-.044);s.lineTo(-.014,-.014);s.lineTo(-.044,-.014);s.lineTo(-.044,.014);s.lineTo(-.014,.014);});
  const dpad=solid(plus,gamepad.pack,material('#447d85'),.007,.003);dpad.position.set(-.10,.012,padZ);
  for(const [x,y,color] of [[.10,.054,'#f5cf69'],[.14,.014,'#ee94bc'],[.06,.014,'#8fcddd'],[.10,-.026,'#b192da']])ball(gamepad.pack,material(color),x,y,padZ+.007,.018,.018,.007);

  const whale=bag('bag-whale','#a8d3ec','#82b5d9');
  const whaleShape=shape(s=>{s.moveTo(-.16,-.12);s.bezierCurveTo(-.27,-.08,-.235,.16,-.075,.17);s.bezierCurveTo(.04,.20,.09,.10,.14,.095);s.quadraticCurveTo(.19,.10,.173,.19);s.bezierCurveTo(.11,.235,.14,.29,.205,.247);s.bezierCurveTo(.28,.285,.30,.215,.23,.195);s.bezierCurveTo(.24,.03,.17,-.13,.015,-.15);s.quadraticCurveTo(-.09,-.17,-.16,-.12);});
  const whaleZ=pvcShape(whaleShape,whale);
  const belly=ball(whale.pack,material('#f5ecd8',{transparent:true,opacity:.65,depthWrite:false}),-.085,-.09,whaleZ-.006,.11,.044,.004);belly.renderOrder=1;
  for(const x of [-.15,-.065])ball(whale.pack,dark,x,.032,whaleZ,.009,.012,.005);
  const fin=ball(whale.pack,whale.trim,.075,-.047,whaleZ+.006,.057,.026,.016);fin.rotation.z=-.55;

  return items;
}
