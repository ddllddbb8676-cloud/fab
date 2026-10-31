// One atlas and one mesh for all front and rear identification plates.
// Individual textures per machine would add hundreds of draw calls on phones.
export function createEquipmentLabels(THREE, machines, equipment, families) {
  const cols = 8, cellW = 256, cellH = 64, rows = Math.ceil(equipment.length / cols);
  const canvas = document.createElement('canvas'); canvas.width = cols * cellW; canvas.height = rows * cellH;
  const ctx = canvas.getContext('2d');
  const positions = [], uvs = [], indices = [];
  function plate(m, i, facing, z) {
    const x0 = i % cols / cols, x1 = (i % cols + 1) / cols;
    const y1 = 1 - Math.floor(i / cols) / rows, y0 = y1 - 1 / rows;
    const base = positions.length / 3;
    for (const [x, y] of [[-.82,-.205],[.82,-.205],[.82,.205],[-.82,.205]]) positions.push(m.x + facing * x, 2.36 + y, z);
    uvs.push(x0,y0,x1,y0,x1,y1,x0,y1); indices.push(base,base+1,base+2,base,base+2,base+3);
  }
  const byId = new Map(machines.map(m => [m.id,m]));
  equipment.forEach((e, i) => {
    const px = i % cols * cellW, py = Math.floor(i / cols) * cellH;
    ctx.fillStyle = '#eef4f5'; ctx.fillRect(px, py, cellW, cellH);
    ctx.fillStyle = families[e.familyIndex].color; ctx.fillRect(px, py, 5, cellH);
    ctx.fillStyle = '#244d59'; ctx.font = '700 27px sans-serif'; ctx.fillText(e.code, px + 14, py + 30, cellW - 28);
    ctx.fillStyle = '#607d86'; ctx.font = '15px sans-serif'; ctx.fillText(e.typeName, px + 14, py + 52, cellW - 28);
    const m = byId.get(e.id); plate(m, i, m.sign, m.z + m.sign * 2.385); plate(m, i, -m.sign, m.z - m.sign * 2.39);
  });
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture }));
  mesh.name = 'Equipment identifiers';
  const originals = geometry.attributes.position.array.slice();
  const offsets = new Map(equipment.map((item, index) => [item.id, index * 24]));
  mesh.setEquipmentVisible = (id, visible) => {
    const offset = offsets.get(id); if (offset === undefined) return;
    const attribute = geometry.attributes.position;
    for (let i = offset; i < offset + 24; i++) attribute.array[i] = visible ? originals[i] : (i % 3 === 1 ? -1 : 0);
    attribute.needsUpdate = true;
  };
  return mesh;
}
