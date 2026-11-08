import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Native Three.js cosmetic prototypes, attached to the shipped avatar's upper
// body. No accounts, shop mutations, remote calls, runtime registration or keys.
export function equipCandidate(THREE, avatar, item) {
  if (item.slot === 'suit') return applySuit(THREE, avatar, item);
  const root = new THREE.Group(), cache = new Map(), animators = [];
  root.name = 'candidate:' + item.id;
  avatar.root.getObjectByName('hood').parent.add(root);
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
    case 'wafer':
      g=group(root,0,1.49,0);g.rotation.z=.18;
      o=cylinder(g,violet,0,0,0,.265,.035);o.scale.z=.8;
      for(let x=-.16;x<=.17;x+=.08) {
        line(g,cyan,[x,.022,-.14],[x,.022,.14],.003);
        line(g,cyan,[-.19,.022,x],[.19,.022,x],.003);
      }
      ring(g,gold,0,0,0,.36,.012).rotation.x=Math.PI/2;
      ball(g,pink,.35,0,0,.027);break;
    case 'ufo':
      g=group(root,0,1.57,0);
      ball(g,violet,0,0,0,.29,.035,.24);ball(g,cyan,0,.055,0,.13,.09,.115);
      ring(g,white,0,0,0,.25,.014).rotation.x=Math.PI/2;
      for(let i=0;i<6;i++){const a=i*Math.PI/3;ball(g,glow('#e8f982'),Math.sin(a)*.22,-.015,Math.cos(a)*.19,.021);}
      line(g,dark,[0,.13,0],[0,.20,0],.006);ball(g,pink,0,.21,0,.023);
      animators.push(t=>g.position.y=1.57+Math.sin(t*2)*.018);break;
    case 'thunder':
      for(const side of [-1,1]){
        const pts=[[-.04,0],[.025,.14],[-.006,.14],[.05,.33],[-.08,.12],[-.025,.12]];
        o=polygon(root,side<0?cyan:pink,pts,side*.185,1.39,-.02,.05);o.rotation.z=-side*.19;
      }break;
    case 'cloudbow':
      for(let i=0;i<7;i++)ring(root,rainbow[i],0,1.47,.01,.25-i*.021,.012,Math.PI);
      for(const side of [-1,1])for(const [x,y,r]of[[0,0,.07],[.055,.01,.05],[-.05,-.01,.045]])
        ball(root,white,side*.22+x,1.46+y,.02,r,r*.72,r*.8);
      break;
    case 'dino':
      for(let i=0;i<6;i++){
        const a=i*.37-.12,y=1.18+Math.cos(a)*.27,z=-Math.sin(a)*.29;
        o=mesh(root,new THREE.ConeGeometry(.065,.16,4),i%2?cyan:mat('#b5e34a'),0,y+.04,z);o.rotation.x=-a;
      }break;
    case 'oht':
      box(root,dark,0,1.53,0,.53,.028,.06);
      for(const side of [-1,1])box(root,white,side*.21,1.46,0,.026,.13,.035);
      g=group(root,0,1.61,0);box(g,white,0,0,0,.19,.13,.14);box(g,cyan,0,.02,.077,.12,.045,.012);
      box(g,orange,0,-.10,0,.13,.08,.115);box(g,dark,0,.07,0,.16,.025,.15);
      animators.push(t=>g.position.x=Math.sin(t*1.4)*.14);break;
    case 'propeller':
      ball(root,mat('#75c9c1'),0,1.36,0,.20,.085,.19);
      cylinder(root,dark,0,1.49,0,.017,.19);g=group(root,0,1.60,0);
      for(let i=0;i<4;i++){const blade=group(g);blade.rotation.y=i*Math.PI/2;box(blade,[pink,gold,cyan,violet][i],.12,0,0,.24,.017,.067);}
      ball(g,gold,0,.015,0,.037);animators.push(t=>g.rotation.y=t*2.3);break;
    case 'ghost':
      g=group(root,0,1.59,0);
      box(g,white,0,.03,0,.23,.19,.16);box(g,white,0,.15,0,.16,.06,.14);
      for(const x of [-.08,0,.08])box(g,white,x,-.09,0,.045,.07,.16);
      for(const x of [-.052,.052]){box(g,dark,x,.04,.085,.032,.05,.012);box(g,pink,x,.015,.091,.023,.012,.006);}
      animators.push(t=>{g.position.y=1.59+Math.sin(t*1.7)*.015;g.rotation.z=Math.sin(t)*.06;});break;
    case 'pixel':
      glassesArms();
      for(const side of [-1,1]){
        const lens=group(root,side*.084,1.14,.268);box(lens,dark,0,0,0,.142,.064,.018);box(lens,dark,side*.025,-.04,0,.07,.03,.018);
        for(let i=0;i<3;i++)box(lens,white,-.035+i*.024,.025-i*.015,.013,.014,.013,.004);
      }break;
    case 'cyber':
      line(root,dark,[.16,1.14,.24],[.255,1.13,-.08],.013);
      g=group(root,.087,1.14,.279);box(g,dark,0,0,0,.17,.108,.018);
      box(g,mat('#46b6b3'),0,0,.012,.142,.080,.013);
      for(let i=0;i<3;i++)box(g,glow('#c2ffee'),-.043+i*.031,.016,.022,.016,.009,.005);
      box(g,pink,.05,-.025,.023,.025,.009,.005);
      ball(root,cyan,.22,1.13,.10,.027);break;
    case 'lightning':
      glassesArms();
      for(const side of [-1,1]){
        polygon(root,side<0?gold:pink,[[-.075,.05],[.02,.05],[-.009,.006],[.08,.006],[-.055,-.08],[-.02,-.02],[-.075,-.02]],side*.084,1.15,.278,.016);
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
    case 'stocker':
      g=bagBase();box(g,white,0,.035,.07,.30,.46,.17);
      box(g,cyan,0,.265,.16,.30,.027,.018);
      for(const x of [-.076,.076]){
        box(g,dark,x,-.09,.163,.105,.11,.016);box(g,white,x,-.15,.20,.12,.028,.11);
        box(g,x<0?cyan:pink,x,-.021,.175,.06,.013,.008);
      }
      box(g,gold,.076,-.105,.20,.066,.064,.055);
      for(let i=0;i<3;i++)box(g,mat('#c3d4d7'),0,.055+i*.055,.162,.25,.005,.005);
      label(g,'STK',0,.21,.165,.008);label(g,'IN',-.072,-.019,.18,.004);label(g,'OUT',.079,-.019,.18,.004);
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
    case 'blackhole':
      g=bagBase();ball(g,dark,0,0,.12,.15,.15,.095);
      o=ring(g,glow('#ffae57'),0,0,.17,.215,.015);o.scale.y=.48;o.rotation.z=-.34;
      ring(g,violet,0,0,.15,.165,.008);
      const orbit=group(g,0,0,.17);ball(orbit,cyan,.215,0,0,.022);animators.push(t=>orbit.rotation.z=t*.45);
      break;
    case 'heart':
      g=bagBase();
      const rows=['0110110','1111111','1111111','0111110','0011100','0001000'];
      for(let y=0;y<6;y++)for(let x=0;x<7;x++)if(rows[y][x]==='1')
        box(g,(y===1&&x<3)?mat('#ff95b9'):mat('#ef426e'),(x-3)*.056,(2.5-y)*.056,.08,.057,.057,.12);
      break;
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
  return {root,update(t){if(!disposed)for(const animate of animators)animate(t);},
    dispose(){if(disposed)return;disposed=true;root.removeFromParent();root.traverse(o=>o.geometry?.dispose());for(const m of cache.values())m.dispose();}};
}

function applySuit(THREE,avatar,item) {
  const width=256,height=512,pixels=new Uint8Array(width*height*4),c=new THREE.Color();
  const fract=n=>n-Math.floor(n),mix=(a,b,t)=>a*(1-t)+b*t;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const u=x/width,v=y/height,idx=(y*width+x)*4;
    switch(item.design){
      case 'rainbow':c.setHSL(.85*(1-v),.83,.56);break;
      case 'aurora':{
        const wave=.5+.5*Math.sin(u*15+Math.sin(v*10)*2);
        c.setHSL(mix(.45,.78,wave),.72,.18+.32*Math.pow(wave,.7));break;}
      case 'blacklight':{
        const stripe=fract(u*8+v*9);
        c.set(stripe<.085?'#36efd7':stripe>.92?'#f36fce':'#182233');break;}
      case 'split':c.set(Math.sin((u-.5)*Math.PI*2)<0?'#32cbd2':'#f164a7');break;
      case 'stardust':{
        const gx=Math.floor(u*31),gy=Math.floor(v*35),spark=fract(Math.sin(gx*127.1+gy*311.7)*43758.54)>.962;
        const px=fract(u*31)-.5,py=fract(v*35)-.5;
        c.set(spark&&(Math.abs(px)<.12||Math.abs(py)<.12)?'#f9e59a':'#263250');break;}
      case 'checker':c.set((Math.floor(u*12)+Math.floor(v*14))%2?'#26594b':'#f0ecd0');break;
      case 'magma':{
        const crack=Math.abs(Math.sin(u*25+Math.sin(v*32)*1.5));
        c.set(crack<.23?'#ffb040':crack<.39?'#ef4933':'#282335');break;}
      case 'silver':{
        const stripe=fract(u*4+v*6);c.setHSL(.49+stripe*.35,.35,.74+Math.sin(stripe*Math.PI)*.15);break;}
      default:throw new Error('Unknown suit pattern');
    }
    c.convertLinearToSRGB();pixels[idx]=Math.round(c.r*255);pixels[idx+1]=Math.round(c.g*255);pixels[idx+2]=Math.round(c.b*255);pixels[idx+3]=255;
  }
  const texture=new THREE.DataTexture(pixels,width,height);texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=THREE.RepeatWrapping;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearFilter;texture.needsUpdate=true;
  const material=new THREE.MeshStandardMaterial({map:texture,color:'#ffffff',roughness:item.design==='silver'?.3:.64,metalness:item.design==='silver'?.55:0});
  const saved=[],p=new THREE.Vector3(),worldInverse=new THREE.Matrix4();
  avatar.root.updateMatrixWorld(true);worldInverse.copy(avatar.root.matrixWorld).invert();
  avatar.root.traverse(o=>{
    if(!o.isMesh||!['hood','torso','pants','upperArm','forearm'].includes(o.name))return;
    saved.push({o,geometry:o.geometry,material:o.material});const geo=o.geometry.clone(),pos=geo.attributes.position,uv=[];
    for(let i=0;i<pos.count;i++){
      p.fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld).applyMatrix4(worldInverse);
      uv.push(Math.atan2(p.x,p.z)/(Math.PI*2)+.5,Math.max(0,Math.min(1,p.y/1.44)));
    }
    geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));o.geometry=geo;o.material=material;
  });
  let disposed=false;
  return {root:null,update(){},dispose(){if(disposed)return;disposed=true;for(const s of saved){s.o.geometry.dispose();s.o.geometry=s.geometry;s.o.material=s.material;}material.dispose();texture.dispose();}};
}
