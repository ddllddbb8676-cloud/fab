export function createCuteAccessories(THREE,attachment){
  const items={},mat=(color,options={})=>new THREE.MeshStandardMaterial({color,roughness:.44,...options});
  const white=mat('#f4eeeb'),pink=mat('#ed9bb6'),dark=mat('#34494e');
  function group(id){const g=new THREE.Group();g.name=id;g.visible=false;g.userData.itemId=id;attachment.add(g);items[id]=g;return g;}
  function mesh(geometry,material,parent,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=!material.transparent;m.receiveShadow=true;parent.add(m);return m;}
  function ball(parent,material,x,y,z,sx,sy,sz){const m=mesh(new THREE.SphereGeometry(1,24,16),material,parent,x,y,z);m.scale.set(sx,sy,sz);return m;}
  function tube(points,radius,material,parent,closed=false){return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),closed),Math.max(24,points.length*5),radius,6,closed),material,parent);}
  function solidShape(shape,parent,material,depth=.04){return mesh(new THREE.ExtrudeGeometry(shape,{depth,steps:1,bevelEnabled:true,bevelThickness:.009,bevelSize:.009,bevelSegments:3,curveSegments:18}),material,parent);}

  const bunny=group('bunny-ears');bunny.position.y=-.075;
  const upright=ball(bunny,white,-.13,1.68,.006,.072,.225,.041);upright.rotation.z=.13;
  const inner=ball(bunny,pink,-.134,1.695,.043,.044,.164,.012);inner.rotation.z=.13;
  const folded=new THREE.Group();folded.position.set(.125,1.485,-.014);bunny.add(folded);
  const foldedShape=new THREE.Shape();foldedShape.moveTo(-.054,0);foldedShape.bezierCurveTo(-.07,.13,-.046,.30,.02,.375);foldedShape.bezierCurveTo(.08,.425,.144,.363,.151,.29);foldedShape.quadraticCurveTo(.15,.247,.11,.25);foldedShape.quadraticCurveTo(.077,.253,.081,.289);foldedShape.quadraticCurveTo(.075,.318,.054,.27);foldedShape.bezierCurveTo(.02,.17,.052,.06,.047,0);foldedShape.closePath();
  solidShape(foldedShape,folded,white,.045);
  const innerFold=ball(folded,pink,-.002,.151,.054,.032,.125,.009);innerFold.rotation.z=-.12;
  tube([[.08,.29,.052],[.11,.277,.052],[.139,.283,.052]],.0035,mat('#d8babf'),folded);

  const hearts=group('heart-glasses'),hotPink=mat('#ff1685',{roughness:.3}),lens=mat('#ffe8ef',{transparent:true,opacity:.12,depthWrite:false,side:THREE.DoubleSide,roughness:.16});
  const heart=new THREE.Shape();heart.moveTo(0,.019);heart.bezierCurveTo(-.027,.059,-.069,.04,-.061,.005);heart.bezierCurveTo(-.058,-.014,-.021,-.043,0,-.061);heart.bezierCurveTo(.021,-.043,.058,-.014,.061,.005);heart.bezierCurveTo(.069,.04,.027,.059,0,.019);
  for(const side of [-1,1]){const g=new THREE.Group();g.position.set(side*.074,1.146,.268);hearts.add(g);mesh(new THREE.ShapeGeometry(heart,24),lens,g);tube(heart.getPoints(14).map(p=>[p.x,p.y,.001]),.006,hotPink,g,true);tube([[side*.135,1.156,.27],[side*.23,1.15,.15],[side*.26,1.13,.035]],.0045,hotPink,hearts);}
  tube([[-.013,1.151,.27],[0,1.158,.276],[.013,1.151,.27]],.0045,hotPink,hearts);

  const duck=group('baby-chick'),yellow=mat('#ffdb63'),wing=mat('#ffe791'),orange=mat('#ef9b42');duck.position.y=-.06;
  ball(duck,yellow,0,1.584,-.005,.139,.091,.108);
  ball(duck,yellow,0,1.696,.067,.083,.081,.077);
  ball(duck,orange,0,1.667,.148,.05,.019,.041);
  for(const side of [-1,1]){
    const w=ball(duck,wing,side*.126,1.586,.01,.028,.054,.073);w.rotation.z=side*.27;
    ball(duck,dark,side*.034,1.709,.135,.0085,.011,.006);
    ball(duck,white,side*.034-.002,1.713,.14,.0026,.003,.002);
    ball(duck,orange,side*.054,1.505,.055,.031,.012,.026);
  }
  const tail=ball(duck,wing,0,1.6,-.108,.038,.035,.068);tail.rotation.x=-.3;

  const pvc=mat('#b9dbd8',{transparent:true,opacity:.43,depthWrite:false,side:THREE.DoubleSide,roughness:.19,metalness:.04});
  const trim=mat('#deebe5'),gridMat=new THREE.LineBasicMaterial({color:'#759d98',transparent:true,opacity:.72,depthWrite:false});
  function inside(x,y,points){let yes=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)yes=!yes;}return yes;}
  function pvcShape(shape,parent,depth=.11,material=pvc){
    const body=solidShape(shape,parent,material,depth);body.renderOrder=1;body.name='pvc-shell';
    const contour=shape.getPoints(18);tube(contour.map(p=>[p.x,p.y,depth+.01]),.008,trim,parent,true);tube(contour.map(p=>[p.x,p.y,-.006]),.005,trim,parent,true);
    const xs=contour.map(p=>p.x),ys=contour.map(p=>p.y),xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys),positions=[];
    for(let x=Math.ceil(xmin/.031)*.031;x<xmax;x+=.031)for(let y=ymin;y+.008<=ymax;y+=.008)if(inside(x,y,contour)&&inside(x,y+.008,contour))positions.push(x,y,depth+.012,x,y+.008,depth+.012);
    for(let y=Math.ceil(ymin/.031)*.031;y<ymax;y+=.031)for(let x=xmin;x+.008<=xmax;x+=.008)if(inside(x,y,contour)&&inside(x+.008,y,contour))positions.push(x,y,depth+.012,x+.008,y,depth+.012);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));const grid=new THREE.LineSegments(geometry,gridMat);grid.name='pvc-grid';grid.renderOrder=2;parent.add(grid);return body;
  }
  function bag(id){const g=group(id),pack=new THREE.Group();pack.position.set(0,.74,-.173);pack.rotation.y=Math.PI;g.add(pack);for(const side of [-1,1])tube([[side*.11,.15,0],[side*.16,.22,-.13],[side*.18,.11,-.28],[side*.14,-.12,-.27],[side*.11,-.18,0]],.012,trim,pack);return pack;}
  const star=bag('bag-star'),points=[];
  for(let i=0;i<10;i++){const a=Math.PI/2+i*Math.PI/5,r=i%2?.128:.255;points.push(new THREE.Vector2(Math.cos(a)*r,Math.sin(a)*r));}
  const starShape=new THREE.Shape(),cut=.17,between=(a,b,t)=>a.clone().lerp(b,t);let start=between(points.at(-1),points[0],1-cut);starShape.moveTo(start.x,start.y);
  for(let i=0;i<points.length;i++){const p=points[i],next=points[(i+1)%points.length],end=between(p,next,cut);starShape.quadraticCurveTo(p.x,p.y,end.x,end.y);const line=between(p,next,1-cut);starShape.lineTo(line.x,line.y);}starShape.closePath();pvcShape(starShape,star);
  for(const side of [-1,1]){ball(star,dark,side*.048,.021,.133,.008,.012,.005);ball(star,pink,side*.082,-.017,.131,.019,.009,.004);}
  tube([[-.025,-.018,.133],[0,-.033,.133],[.025,-.018,.133]],.0035,dark,star);
  tube([[-.032,.226,.045],[-.032,.271,.045],[.032,.271,.045],[.032,.226,.045]],.008,trim,star);

  return items;
}
