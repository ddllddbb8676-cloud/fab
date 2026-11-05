import {createCuteAccessories} from './cute-accessories.js?v=3b5478afa86e';
import {createPlayfulAccessories} from './playful-accessories.js?v=3b5478afa86e';
export function createExtraAccessories(THREE, attachment) {
  const result = {};
  const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: .45, ...options });
  const white = material('#e6eeee'), dark = material('#41545e');
  function group(id) { const g = new THREE.Group(); g.name = id; g.visible = false; result[id] = g; attachment.add(g); return g; }
  function mesh(geometry, mat, parent, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geometry, mat); m.position.set(x, y, z); m.castShadow = !mat.transparent; m.receiveShadow = true; parent.add(m); return m; }
  function tube(points, radius, mat, parent, closed = false) { const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), closed); return mesh(new THREE.TubeGeometry(curve, Math.max(16, points.length * 6), radius, 5, closed), mat, parent); }
  for (const [id, color] of [['helmet-white', '#f0f3ee'], ['helmet-orange', '#ed983f']]) {
    const g = group(id), shellMat = material(color, { roughness: .32 });
    const dome = mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), shellMat, g, 0, 1.25, 0);
    dome.scale.set(.312, .275, .285);
    const brim = mesh(new THREE.CylinderGeometry(1, 1, .025, 40), shellMat, g, 0, 1.25, .035); brim.scale.set(.35, 1, .326);
    const rim = mesh(new THREE.TorusGeometry(.306, .009, 6, 40), white, g, 0, 1.245, .005); rim.rotation.x = Math.PI / 2; rim.scale.y = .94;
    tube([[0, 1.30, -.276], [0, 1.47, -.17], [0, 1.54, 0], [0, 1.47, .17], [0, 1.30, .276]], .014, shellMat, g);
    for (const x of [-.135, .135]) tube([[x, 1.33, -.20], [x, 1.47, 0], [x, 1.33, .20]], .007, shellMat, g);
  }
  // Color variants share the existing helmet geometry; only the shell material changes.
  for (const [id,color] of [['helmet-red','#e65350'],['helmet-blue','#4c88db']]) {
    const g=result['helmet-orange'].clone(true),shellMat=material(color,{roughness:.32});g.name=id;
    g.traverse(object=>{if(object.isMesh&&object.material!==white)object.material=shellMat;});
    result[id]=g;attachment.add(g);
  }
  for (const id of ['glasses', 'sunglasses']) {
    const g = group(id), isSun = id === 'sunglasses';
    const frame = material(isSun ? '#26333b' : '#657d87', { roughness: .28, metalness: .2 });
    const lens = material(isSun ? '#162c39' : '#9cd3de', { transparent: !isSun, opacity: isSun ? 1 : .20, depthWrite: isSun, roughness: .15, metalness: isSun ? .40 : 0 });
    for (const side of [-1, 1]) {
      const ring = mesh(new THREE.TorusGeometry(.060, isSun ? .008 : .0045, 8, 32), frame, g, side * .073, 1.139, .256); ring.scale.y = .76;
      const glass = mesh(new THREE.CircleGeometry(.058, 32), lens, g, side * .073, 1.139, .256); glass.scale.y = .76;
      tube([[side * .132, 1.153, .255], [side * .23, 1.153, .14], [side * .256, 1.13, .025]], .0045, frame, g);
      if (isSun) tube([[side * .09, 1.158, .259], [side * .06, 1.166, .259]], .0022, material('#91aeb8'), g);
    }
    tube([[-.017, 1.142, .258], [0, 1.151, .264], [.017, 1.142, .258]], .004, frame, g);
  }
  function roundedShape(w, h, r) {
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
  }
  const goggles = group('goggles'), gogglesShape = roundedShape(.345, .12, .035);
  const visor = mesh(new THREE.ShapeGeometry(gogglesShape, 20), material('#a4d8e3', { transparent: true, opacity: .25, depthWrite: false, side: THREE.DoubleSide, roughness: .12 }), goggles, 0, 1.137, .26);
  tube(gogglesShape.getPoints(8).map(p => [p.x, p.y + 1.137, .265]), .009, material('#afc7cf'), goggles, true);
  for (const side of [-1, 1]) tube([[side * .17, 1.14, .25], [side * .265, 1.14, .08], [side * .245, 1.14, -.10]], .015, white, goggles);
  tube([[-.12, 1.16, .268], [-.07, 1.18, .268]], .0025, white, goggles);

  // The bags are translucent PVC with a visible woven carbon grid, not fabric.
  const pvc = material('#c0dedc', { transparent: true, opacity: .38, depthWrite: false, side: THREE.DoubleSide, roughness: .20, metalness: .06 });
  const gridMaterial = new THREE.LineBasicMaterial({ color: '#789ca1', transparent: true, opacity: .72, depthWrite: false });
  const trim = material('#e0edeb', { roughness: .48 });
  function pointInside(x, y, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i], b = points[j];
      if (((a.y > y) !== (b.y > y)) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }
  function makePvcShape(shape, parent, depth = .11) {
    const body = mesh(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .008, bevelThickness: .008, curveSegments: 16 }), pvc, parent);
    body.renderOrder = 1;
    const contour = shape.getPoints(18);
    tube(contour.map(p => [p.x, p.y, depth + .010]), .008, trim, parent, true);
    tube(contour.map(p => [p.x, p.y, -.005]), .005, trim, parent, true);
    const positions = [], spacing = .031, step = .0075;
    const xs = contour.map(p => p.x), ys = contour.map(p => p.y);
    const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys);
    for (let x = Math.ceil(xmin / spacing) * spacing; x <= xmax; x += spacing)
      for (let y = ymin; y + step <= ymax; y += step)
        if (pointInside(x, y, contour) && pointInside(x, y + step, contour)) positions.push(x, y, depth + .011, x, y + step, depth + .011);
    for (let y = Math.ceil(ymin / spacing) * spacing; y <= ymax; y += spacing)
      for (let x = xmin; x + step <= xmax; x += step)
        if (pointInside(x, y, contour) && pointInside(x + step, y, contour)) positions.push(x, y, depth + .011, x + step, y, depth + .011);
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const lines = new THREE.LineSegments(geometry, gridMaterial); lines.renderOrder = 2; parent.add(lines);
    return body;
  }
  function baseBag(id) {
    const g = group(id), pack = new THREE.Group(); pack.position.set(0, .72, -.155); pack.rotation.y = Math.PI; g.add(pack);
    for (const side of [-1, 1]) {
      tube([[side * .11, .15, 0], [side * .16, .21, -.13], [side * .18, .11, -.29], [side * .14, -.10, -.27], [side * .11, -.18, 0]], .013, trim, pack);
    }
    return pack;
  }
  const basic = baseBag('bag-basic'); makePvcShape(roundedShape(.34, .37, .055), basic);
  tube([[-.055, .19, .035], [-.055, .235, .035], [.055, .235, .035], [.055, .19, .035]], .010, trim, basic);
  const pocket = new THREE.Group(); pocket.position.set(0, -.075, .123); basic.add(pocket); makePvcShape(roundedShape(.26, .14, .028), pocket, .025);
  tube([[-.12, .025, .16], [.12, .025, .16]], .004, dark, basic);
  const zip = mesh(new THREE.BoxGeometry(.015, .035, .012), trim, basic, .10, .01, .166);
  const bear = baseBag('bag-bear');
  const bearShape = new THREE.Shape();
  bearShape.moveTo(-.15, .06); bearShape.bezierCurveTo(-.25, .23, -.10, .31, -.065, .19); bearShape.quadraticCurveTo(0, .22, .065, .19); bearShape.bezierCurveTo(.10, .31, .25, .23, .15, .06); bearShape.bezierCurveTo(.23, -.18, .12, -.22, 0, -.22); bearShape.bezierCurveTo(-.12, -.22, -.23, -.18, -.15, .06);
  makePvcShape(bearShape, bear);
  for (const side of [-1, 1]) mesh(new THREE.SphereGeometry(.014, 10, 8), dark, bear, side * .063, .018, .133);
  const nose = mesh(new THREE.SphereGeometry(.014, 10, 8), dark, bear, 0, -.043, .134); nose.scale.x = 1.25;
  tube([[0, -.052, .134], [0, -.073, .134], [-.018, -.078, .134]], .0025, dark, bear);
  tube([[0, -.073, .134], [.018, -.078, .134]], .0025, dark, bear);
  const turtle = baseBag('bag-turtle'), shellShape = new THREE.Shape(); shellShape.absellipse(0, 0, .19, .245, 0, Math.PI * 2, false, 0);
  makePvcShape(shellShape, turtle, .15);
  tube([[0, .18, .17], [.105, .10, .17], [.105, -.10, .17], [0, -.18, .17], [-.105, -.10, .17], [-.105, .10, .17]], .009, trim, turtle, true);
  for (const side of [-1, 1]) { tube([[side * .105, .10, .17], [side * .172, .105, .17]], .008, trim, turtle); tube([[side * .105, -.10, .17], [side * .172, -.105, .17]], .008, trim, turtle); }
  tube([[0, .18, .17], [0, .245, .17]], .008, trim, turtle); tube([[0, -.18, .17], [0, -.245, .17]], .008, trim, turtle);
  const wings = baseBag('bag-wings');
  for (const side of [-1, 1]) {
    const wing = new THREE.Shape(); wing.moveTo(0, -.16); wing.bezierCurveTo(.04, .08, .15, .28, .31, .30); wing.bezierCurveTo(.35, .13, .29, -.12, .19, -.16); wing.quadraticCurveTo(.09, -.22, 0, -.16);
    const half = new THREE.Group(); half.scale.x = side; half.position.x = side * .014; wings.add(half); makePvcShape(wing, half, .065);
    for (let i = 0; i < 3; i++) tube([[.06 + i * .045, -.12, .081], [.13 + i * .05, .02, .081], [.18 + i * .055, .16, .081]], .005, trim, half);
  }
  return result;
}

export function createAllAccessories(THREE, attachment) {
  const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: .65, ...options });
  function mesh(geometry, mat, parent, x, y, z) { const object = new THREE.Mesh(geometry, mat); object.position.set(x,y,z); parent.add(object); return object; }
  const accessories = {};
  for (const id of ['sprout', 'crown']) { accessories[id] = new THREE.Group(); attachment.add(accessories[id]); accessories[id].visible = false; }
  const sprout = accessories.sprout, stemMat = material('#438b5c');
  const stem = mesh(new THREE.CylinderGeometry(.010, .014, .23, 8), stemMat, sprout, 0, 1.53, 0); stem.rotation.z = -.12;
  const leaf1 = mesh(new THREE.SphereGeometry(1, 16, 10), material('#75bd73'), sprout, -.075, 1.61, .008); leaf1.scale.set(.12, .047, .064); leaf1.rotation.z = -.48;
  const leaf2 = mesh(new THREE.SphereGeometry(1, 16, 10), material('#4b9d70'), sprout, .078, 1.66, -.004); leaf2.scale.set(.12, .045, .064); leaf2.rotation.z = .55;
  const crown = accessories.crown, gold = material('#dfb64f', { metalness: .58, roughness: .32 });
  const positions = [], indices = [], segments = 32;
  for (let i = 0; i <= segments; i++) {
    const a = i / segments * Math.PI * 2, high = i % 4 === 0 ? .17 : i % 2 === 0 ? .07 : .12;
    positions.push(Math.sin(a) * .177, 1.385, Math.cos(a) * .177);
    positions.push(Math.sin(a) * .205, 1.385 + high, Math.cos(a) * .205);
    if (i < segments) { const n = i * 2; indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3); }
  }
  const crownGeo = new THREE.BufferGeometry(); crownGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); crownGeo.setIndex(indices); crownGeo.computeVertexNormals();
  const crownMat = gold.clone(); crownMat.side = THREE.DoubleSide; mesh(crownGeo, crownMat, crown, 0, 0, 0);
  const band = mesh(new THREE.TorusGeometry(.18, .017, 8, 40), gold, crown, 0, 1.40, 0); band.rotation.x = Math.PI / 2;
  mesh(new THREE.SphereGeometry(.028, 12, 8), material('#67b7bb', { metalness: .3, roughness: .2 }), crown, 0, 1.44, .194);
  Object.assign(accessories, createExtraAccessories(THREE, attachment),createCuteAccessories(THREE,attachment),createPlayfulAccessories(THREE,attachment));

 return accessories;
}
