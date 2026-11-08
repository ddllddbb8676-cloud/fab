import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Approved collection geometry. Built lazily and shared by appearance templates.
export function createCollectionAccessory(THREE, item) {
  const root = new THREE.Group(), cache = new Map();
  root.name = 'candidate:' + item.id;
  function mat(color, extra={}) {
    const key=JSON.stringify([color,extra]);
    if(!cache.has(key))cache.set(key,new THREE.MeshStandardMaterial({color,roughness:.42,metalness:.08,...extra}));
    return cache.get(key);
  }
  const dark=mat('#192b3b'), white=mat('#ecf6ef'), gold=mat('#f5bb35',{metalness:.5,roughness:.3});
  const cyan=mat('#31e4d7'), pink=mat('#ef59ac'), violet=mat('#9273ee'), orange=mat('#ff8142');
  const glow=color=>mat(color,{emissive:color,emissiveIntensity:.32});
  const mesh=(parent,geometry,material,x=0,y=0,z=0)=>{
    const object=new THREE.Mesh(geometry,material);object.position.set(x,y,z);parent.add(object);return object;
  };
  const box=(p,m,x,y,z,w,h,d)=>mesh(p,new THREE.BoxGeometry(w,h,d),m,x,y,z);
  const ball=(p,m,x,y,z,sx,sy=sx,sz=sx)=>{
    const o=mesh(p,new THREE.SphereGeometry(1,12,8),m,x,y,z);o.scale.set(sx,sy,sz);return o;
  };
  const cylinder=(p,m,x,y,z,r,h,rt=r)=>mesh(p,new THREE.CylinderGeometry(rt,r,h,16),m,x,y,z);
  const ring=(p,m,x,y,z,r,t=.012,arc=Math.PI*2)=>mesh(p,new THREE.TorusGeometry(r,t,6,36,arc),m,x,y,z);
  const group=(p,x=0,y=0,z=0)=>{const g=new THREE.Group();g.position.set(x,y,z);p.add(g);return g;};
  function polygon(p,m,points,x,y,z,depth=.022) {
    const shape=new THREE.Shape();points.forEach(([px,py],i)=>i?shape.lineTo(px,py):shape.moveTo(px,py));shape.closePath();
    return mesh(p,new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:6,steps:1}),m,x,y,z);
  }
  const line=(p,m,a,b,r=.008)=>{
    const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),o=mesh(p,new THREE.CylinderGeometry(r,r,av.distanceTo(bv),6),m);
    o.position.copy(av).add(bv).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),bv.sub(av).normalize());return o;
  };
  function star(p,m,x,y,z,r=.08,inner=.44) {
    const pts=Array.from({length:10},(_,i)=>{const a=Math.PI/2+i*Math.PI/5,rr=r*(i%2?inner:1);return [Math.cos(a)*rr,Math.sin(a)*rr];});
    return polygon(p,m,pts,x,y,z,.015);
  }
  function glassesArms() {
    line(root,dark,[-.16,1.15,.265],[-.26,1.14,-.03],.007);
    line(root,dark,[.16,1.15,.265],[.26,1.14,-.03],.007);
    line(root,dark,[-.032,1.15,.276],[.032,1.15,.276],.006);
  }
  function bagBase() {
    const pack=group(root,0,.73,-.18);pack.rotation.y=Math.PI;
    for(const side of [-1,1]) {
      line(root,dark,[side*.11,.92,-.17],[side*.18,.85,.08],.012);
      line(root,dark,[side*.18,.85,.08],[side*.13,.55,.10],.012);
      line(root,dark,[side*.13,.55,.10],[side*.11,.53,-.17],.012);
    }
    return pack;
  }
  const colors=['#f0618f','#ff9656','#f5d94f','#59cf95','#53b8e5','#8279e4','#ba75d8'];
  const rainbow=colors.map(c=>mat(c));
  function label(p,text,x,y,z,size=.006) {
    const font={S:['111','100','111','001','111'],T:['111','010','010','010','010'],K:['101','101','110','101','101'],
      I:['111','010','010','010','111'],N:['101','111','111','101','101'],O:['111','101','101','101','111'],
      U:['101','101','101','101','111'],E:['111','100','110','100','111'],M:['101','111','111','101','101']};
    for(let i=0;i<text.length;i++)for(let row=0;row<5;row++)for(let col=0;col<3;col++)
      if(font[text[i]]?.[row]?.[col]==='1')mesh(p,new THREE.PlaneGeometry(size*.88,size*.88),dark,x+(i*4+col-text.length*2)*size,y+(2-row)*size,z);
  }
  let g,o;
  switch(item.design) {
    case 'ufo':
      g=group(root,0,1.57,0);
      ball(g,violet,0,0,0,.29,.035,.24);ball(g,cyan,0,.055,0,.13,.09,.115);
      ring(g,white,0,0,0,.25,.014).rotation.x=Math.PI/2;
      for(let i=0;i<6;i++){const a=i*Math.PI/3;ball(g,glow('#e8f982'),Math.sin(a)*.22,-.015,Math.cos(a)*.19,.021);}
      line(g,dark,[0,.13,0],[0,.20,0],.006);ball(g,pink,0,.21,0,.023);
      g.userData.collectionMotion='ufo';break;
    case 'thunder':
      for(const side of [-1,1]){
        const pts=[[-.04,0],[.025,.14],[-.006,.14],[.05,.33],[-.08,.12],[-.025,.12]];
        o=polygon(root,side<0?cyan:pink,pts,side*.185,1.39,-.02,.05);o.rotation.z=-side*.19;
      }break;
    case 'dino':
      for(let i=0;i<6;i++){
        const a=i*.37-.12,y=1.18+Math.cos(a)*.27,z=-Math.sin(a)*.29;
        o=mesh(root,new THREE.ConeGeometry(.065,.16,4),i%2?cyan:mat('#b5e34a'),0,y+.04,z);o.rotation.x=-a;
      }break;
    case 'propeller':
      ball(root,mat('#75c9c1'),0,1.36,0,.20,.085,.19);
      cylinder(root,dark,0,1.49,0,.017,.19);g=group(root,0,1.60,0);
      for(let i=0;i<4;i++){const blade=group(g);blade.rotation.y=i*Math.PI/2;box(blade,[pink,gold,cyan,violet][i],.12,0,0,.24,.017,.067);}
      ball(g,gold,0,.015,0,.037);g.userData.collectionMotion='propeller';break;
    case 'pixel':
      glassesArms();
      for(const side of [-1,1]){
        const lens=group(root,side*.084,1.14,.268);box(lens,dark,0,0,0,.142,.064,.018);box(lens,dark,side*.025,-.04,0,.07,.03,.018);
        for(let i=0;i<3;i++)box(lens,white,-.035+i*.024,.025-i*.015,.013,.014,.013,.004);
      }break;
    case 'saturn':
      glassesArms();
      for(const side of [-1,1]){
        ball(root,mat('#8f93de'),side*.082,1.14,.277,.064,.057,.021);
        g=group(root,side*.082,1.14,.285);g.rotation.z=side*.35;ring(g,gold,0,0,0,.077,.006).scale.y=.48;
        ball(g,cyan,side*.073,0,0,.012);
      }break;
    case 'stars':
      glassesArms();
      for(const side of [-1,1]){
        const pts=Array.from({length:11},(_,i)=>{const a=Math.PI/2+i*Math.PI/5,r=i%2?.038:.077;return [side*.085+Math.cos(a)*r,1.14+Math.sin(a)*r,.28];});
        for(let i=0;i<10;i++)line(root,gold,pts[i],pts[i+1],.007);
      }break;
    case 'x':
      glassesArms();box(root,dark,0,1.14,.27,.32,.105,.023);
      for(const side of [-1,1])for(const slope of [-1,1])
        line(root,glow(side<0?'#52e8dc':'#e77ed0'),[side*.084-.035,1.14-slope*.03,.29],[side*.084+.035,1.14+slope*.03,.29],.009);
      break;
    case 'foup':
      g=bagBase();box(g,gold,0,0,.10,.32,.33,.22);
      box(g,mat('#bd8621'),0,0,.218,.24,.25,.018);
      for(let i=0;i<6;i++)for(const side of [-1,1])box(g,mat('#ffe28a'),side*.165,-.12+i*.049,.10,.02,.015,.23);
      box(g,gold,0,.22,.08,.15,.025,.05);
      for(const x of [-.064,.064])box(g,gold,x,.19,.08,.022,.07,.04);break;
    case 'rockets':
      g=bagBase();box(g,dark,0,0,.05,.26,.24,.10);
      for(const side of [-1,1]){
        cylinder(g,white,side*.12,0,.14,.070,.30);
        mesh(g,new THREE.ConeGeometry(.07,.13,12),pink,side*.12,.215,.14);
        cylinder(g,dark,side*.12,-.18,.14,.076,.06,.059);
        ball(g,glow('#ff9e41'),side*.12,-.25,.14,.044,.09,.044);
        box(g,cyan,side*.12,.04,.207,.05,.06,.012);
        polygon(g,violet,[[0,0],[.08,-.11],[0,-.08]],side*.16,-.09,.13,.025).scale.x=side;
      }break;
    case 'wings':
      g=bagBase();ball(g,violet,0,0,.08,.04,.18,.04);
      for(const side of [-1,1]){
        const wing=group(g);wing.scale.x=side;
        polygon(wing,cyan,[[.03,.05],[.31,.30],[.42,.24],[.30,.02],[.10,-.03]],0,0,.06,.018);
        polygon(wing,pink,[[.05,-.02],[.27,-.04],[.30,-.23],[.15,-.27],[.02,-.10]],0,0,.07,.018);
        polygon(wing,violet,[[.08,.08],[.28,.24],[.29,.08]],0,0,.084,.009);
        line(wing,white,[.06,.02,.093],[.30,.24,.093],.006);
        line(wing,gold,[.04,-.05,.10],[.22,-.20,.10],.006);
      }break;
    case 'emo':
      g=bagBase();box(g,gold,0,0,.065,.32,.35,.12);box(g,dark,0,.125,.132,.19,.024,.01);
      o=cylinder(g,dark,0,-.015,.14,.12,.035);o.rotation.x=Math.PI/2;
      o=cylinder(g,mat('#f34852'),0,-.015,.18,.095,.07);o.rotation.x=Math.PI/2;
      for(const x of [-.132,.132])for(const y of [-.145,.145])ball(g,white,x,y,.13,.01);
      label(g,'EMO',0,.125,.14,.006);
      break;
    case 'roll':
      g=bagBase();
      for(let i=0;i<7;i++){
        o=cylinder(g,rainbow[i],0,(i-3)*.051,.13,.145,.052);o.rotation.y=i*.1;
      }
      for(const y of [-.19,.19])cylinder(g,white,0,y,.13,.147,.026);
      box(g,dark,0,.005,.28,.12,.10,.018);box(g,gold,0,.005,.295,.045,.056,.009);
      break;
    default:throw new Error('Unknown candidate: '+item.id);
  }
  // Merge same-material parts within each attachment. Motion groups stay separate.
  function optimize(parent) {
    for(const child of [...parent.children])if(child.isGroup)optimize(child);
    const batches=new Map();
    for(const child of [...parent.children])if(child.isMesh) {
      child.updateMatrix();const geo=child.geometry.clone().applyMatrix4(child.matrix);
      for(const name of Object.keys(geo.attributes))if(!['position','normal'].includes(name))geo.deleteAttribute(name);
      if(!batches.has(child.material))batches.set(child.material,[]);
      batches.get(child.material).push(geo);child.removeFromParent();child.geometry.dispose();
    }
    for(const [material,geos]of batches) {
      const merged=mergeGeometries(geos,false);if(!merged)throw new Error('Cosmetic merge failed');
      mesh(parent,merged,material);geos.forEach(geo=>geo.dispose());
    }
  }
  optimize(root);
  let disposed=false;
  return {root,
    dispose(){if(disposed)return;disposed=true;root.removeFromParent();root.traverse(o=>o.geometry?.dispose());for(const m of cache.values())m.dispose();}};
}

const motionNodes=new WeakMap();
export function updateCollectionAccessory(root,time){
  let nodes=motionNodes.get(root);if(!nodes){nodes=[];root.traverse(node=>{if(node.userData.collectionMotion)nodes.push(node);});motionNodes.set(root,nodes);}
  for(const node of nodes){if(node.userData.collectionMotion==='ufo')node.position.y=1.57+Math.sin(time*2)*.018;else if(node.userData.collectionMotion==='propeller')node.rotation.y=time*2.3;}
}
