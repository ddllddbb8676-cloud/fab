import * as THREE from 'three';
import {mkdir,writeFile} from 'node:fs/promises';
import {createCanvas,ImageData,GlobalFonts,Path2D} from '../../outputs/fab-promo-2026-11-02/tools/node_modules/@napi-rs/canvas/index.js';

export function installCanvas(){GlobalFonts.registerFromPath('C:/Windows/Fonts/malgunbd.ttf','Noto Sans KR');GlobalFonts.registerFromPath('C:/Windows/Fonts/seguiemj.ttf','Segoe UI Emoji');globalThis.Path2D=Path2D;globalThis.document={createElement:tag=>{if(tag!=='canvas')throw new Error('Only a native canvas is used for film textures');return createCanvas(1,1);}};}
export class FilmExporter {
  constructor(root){this.root=root;this.geometries=[];this.materials=[];this.textures=[];this.geometryIds=new Map();this.materialIds=new Map();this.textureIds=new Map();}
  async init(){await mkdir(this.root+'/textures',{recursive:true});}
  texture(texture){if(!texture?.image)return null;if(this.textureIds.has(texture.uuid))return this.textureIds.get(texture.uuid);
    const id=this.textures.length,image=texture.image,c=createCanvas(image.width,image.height),ctx=c.getContext('2d');
    if(ArrayBuffer.isView(image.data)){const p=image.data,rgba=new Uint8ClampedArray(image.width*image.height*4);for(let i=0;i<image.width*image.height;i++){const channels=p.length/(image.width*image.height);for(let j=0;j<3;j++)rgba[i*4+j]=p[i*channels+Math.min(j,channels-1)];rgba[i*4+3]=channels===4?p[i*4+3]:255;}ctx.putImageData(new ImageData(rgba,image.width,image.height),0,0);}
    else ctx.drawImage(image,0,0);
    const output=createCanvas(c.width,c.height),out=output.getContext('2d');if(texture.flipY===false){out.translate(0,c.height);out.scale(1,-1);}out.drawImage(c,0,0);
    this.textures.push({file:`textures/t${id}.png`,repeat:texture.repeat.toArray()});this.textureIds.set(texture.uuid,id);this.pending??=[];this.pending.push(writeFile(`${this.root}/textures/t${id}.png`,output.toBuffer('image/png')));return id;
  }
  geometry(o){const key=o.geometry.uuid+(o.isLineSegments?':lines':'');if(this.geometryIds.has(key))return this.geometryIds.get(key);const g=o.geometry,id=this.geometries.length;
    this.geometries.push({kind:o.isLineSegments?'lines':'mesh',positions:Array.from(g.attributes.position.array),normals:g.attributes.normal?Array.from(g.attributes.normal.array):null,uv:g.attributes.uv?Array.from(g.attributes.uv.array):null,colors:g.attributes.color?Array.from(g.attributes.color.array):null,indices:g.index?Array.from(g.index.array):null});this.geometryIds.set(key,id);return id;
  }
  material(m){if(this.materialIds.has(m.uuid))return this.materialIds.get(m.uuid);const id=this.materials.length;this.materialIds.set(m.uuid,id);
    this.materials.push({roughness:m.roughness??.8,metalness:m.metalness??0,map:this.texture(m.map),alphaMap:this.texture(m.alphaMap),basic:Boolean(m.isMeshBasicMaterial||m.isLineBasicMaterial),emissive:m.emissive?.toArray()??[0,0,0],emissiveIntensity:m.emissiveIntensity??0,transparent:Boolean(m.transparent),doubleSided:m.side===THREE.DoubleSide});return id;
  }
  collect(root){root.updateMatrixWorld(true);const objects=[],matrix=new THREE.Matrix4(),world=new THREE.Matrix4(),tint=new THREE.Color();
    root.traverse(o=>{if(!(o.isMesh||o.isLineSegments)||o.name==='shadow')return;for(let a=o;a;a=a.parent)if(!a.visible)return;const material=o.material;if(Array.isArray(material))throw new Error('Unexpected multi-material mesh');
      const push=(id,transform,color)=>{if(Math.abs(transform.determinant())<1e-10)return;const c=material.color?.clone()??new THREE.Color('white');if(color)c.multiply(color);let equipmentId=null;for(let p=o;p;p=p.parent)if(p.name.startsWith('equipment:'))equipmentId=Number(p.name.slice(10));objects.push({id,name:o.name||'part',equipmentId,geometry:this.geometry(o),material:this.material(material),data:[...transform.elements,...c.toArray(),material.transparent?material.opacity:1]});};
      if(o.isInstancedMesh){for(let i=0;i<o.count;i++){o.getMatrixAt(i,matrix);world.multiplyMatrices(o.matrixWorld,matrix);if(o.instanceColor)o.getColorAt(i,tint);push(o.uuid+':'+i,world,o.instanceColor?tint:null);}}
      else push(o.uuid,o.matrixWorld,null);
    });return objects;
  }
  async saveClip(id,frames,cameras,extra={}){const records=new Map();for(const f of frames)for(const o of f)if(!records.has(o.id))records.set(o.id,{...o,index:records.size});
    const objects=[...records.values()].map(({data,...o})=>o),data=new Float32Array(frames.length*objects.length*20);
    for(let f=0;f<frames.length;f++)for(const o of frames[f])data.set(o.data,(f*objects.length+records.get(o.id).index)*20);
    await writeFile(`${this.root}/${id}.bin`,Buffer.from(data.buffer));await writeFile(`${this.root}/${id}.json`,JSON.stringify({id,fps:30,frames:frames.length,objects,cameras,...extra}));console.log(JSON.stringify({clip:id,frames:frames.length,objects:objects.length,MB:+(data.byteLength/1e6).toFixed(1)}));
  }
  async save(staticObjects){await Promise.all(this.pending??[]);await writeFile(this.root+'/assets.json',JSON.stringify({geometries:this.geometries,materials:this.materials,textures:this.textures,staticObjects}));}
}
