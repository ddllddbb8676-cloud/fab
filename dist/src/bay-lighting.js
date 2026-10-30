import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

// These are viewing-model colours and light levels, not a calibrated safelight
// spectrum or a lux specification. Area lights actually illuminate the surfaces;
// they are not a yellow screen overlay or a replacement for their materials.
export const AMBER_LIGHT_COLOR = '#ffb600';
export const AMBER_BAY_SIZE = Object.freeze({ width: 52.2, depth: 16.5 });
let areaLightUniformsReady = false;

function selectedBays(bays, families, { keys = ['PHOTO'], yellowBayIds } = {}) {
  if (yellowBayIds !== undefined) {
    const ids = new Set(yellowBayIds);
    return bays.filter(bay => ids.has(bay.id));
  }
  const selectedKeys = new Set(keys);
  return bays.filter(bay => selectedKeys.has(bay.familyKey ?? families[bay.familyIndex]?.key));
}

export function isAmberBayPoint(x, z, bays, families, options = {}) {
  return selectedBays(bays, families, options).some(bay =>
    Math.abs(x - bay.x) <= AMBER_BAY_SIZE.width / 2 &&
    Math.abs(z - bay.z) <= AMBER_BAY_SIZE.depth / 2);
}

/**
 * One broad, downward-facing area light per selected bay keeps the long row
 * evenly lit with five lights rather than many bright point-light hotspots.
 * Call after making the ceiling texture and before selecting luminaire materials.
 * All supplied IDs are the numeric, zero-based layout bay IDs.
 */
export function createBayLighting(THREE, {
  bays, families, keys = ['PHOTO'], yellowBayIds,
  roof, scene, ceilingTexture, intensity = 3.2
}) {
  if (!areaLightUniformsReady) {
    RectAreaLightUniformsLib.init();
    areaLightUniformsReady = true;
  }
  const selected = selectedBays(bays, families, { keys, yellowBayIds });
  const root = new THREE.Group(); root.name = 'Yellow-bay area lighting';
  const ceilingRoot = new THREE.Group(); ceilingRoot.name = 'Yellow-bay ceiling panels';
  const lights = [], textures = [], ceilingMaterials = [];
  const geometry = new THREE.PlaneGeometry(AMBER_BAY_SIZE.width, AMBER_BAY_SIZE.depth);
  const luminaireMaterial = new THREE.MeshStandardMaterial({
    color: '#ffe08a', roughness: .32, metalness: .05,
    emissive: AMBER_LIGHT_COLOR, emissiveIntensity: 1.7
  });
  for (const bay of selected) {
    const light = new THREE.RectAreaLight(AMBER_LIGHT_COLOR, intensity, 51, 12.8);
    light.name = `Yellow light BAY ${String(bay.id + 1).padStart(2, '0')}`;
    light.position.set(bay.x, 4.84, bay.z);
    light.rotation.x = -Math.PI / 2; // RectAreaLight emits towards its local -Z.
    light.userData.bayId = bay.id;
    root.add(light); lights.push(light);

    // Continue the existing FFU ceiling pattern, with amber-lit metal panels.
    // The visible strip lamps at 4.975 m stay below this patch at 4.99 m.
    let map;
    if (ceilingTexture) {
      map = ceilingTexture.clone();
      map.repeat.set(AMBER_BAY_SIZE.width / 3, AMBER_BAY_SIZE.depth / 3);
      map.offset.set((bay.x - AMBER_BAY_SIZE.width / 2 + 60) / 3,
        (bay.z - AMBER_BAY_SIZE.depth / 2 + 90) / 3);
      map.needsUpdate = true; textures.push(map);
    }
    const material = new THREE.MeshStandardMaterial({
      color: '#ffe5ac', map: map ?? null, roughness: .8, metalness: 0,
      emissive: '#ffd06a', emissiveIntensity: .13
    });
    ceilingMaterials.push(material);
    const patch = new THREE.Mesh(geometry, material);
    patch.name = `Amber ceiling BAY ${String(bay.id + 1).padStart(2, '0')}`;
    patch.position.set(bay.x, 4.99, bay.z); patch.rotation.x = Math.PI / 2;
    ceilingRoot.add(patch);
  }
  scene?.add(root);
  if (roof) roof.add(ceilingRoot); else root.add(ceilingRoot);
  const isAmberAt = (x, z) => selected.some(bay =>
    Math.abs(x - bay.x) <= AMBER_BAY_SIZE.width / 2 &&
    Math.abs(z - bay.z) <= AMBER_BAY_SIZE.depth / 2);
  return {
    root, ceilingRoot, lights, luminaireMaterial,
    bayIds: selected.map(bay => bay.id), isAmberAt,
    setOverview(overview) { root.visible = !overview; ceilingRoot.visible = !overview; },
    setIntensity(value) {
      if (!Number.isFinite(value) || value < 0) return;
      for (const light of lights) light.intensity = value;
    },
    dispose() {
      root.removeFromParent(); ceilingRoot.removeFromParent(); geometry.dispose();
      for (const map of textures) map.dispose();
      for (const material of ceilingMaterials) material.dispose();
      // Call after removing the roof luminaires using this material.
      luminaireMaterial.dispose();
    }
  };
}

const WHITE_MASK_MAX_BAYS = 5;
const whiteMaskPatches = new WeakMap();

/**
 * Approximate exclusion of the hall's white lighting from yellow-light rooms.
 * The area lights retain their own colour, intensity and physically based BRDF.
 * This changes incident white-light contributions, never albedo or final pixels.
 * Call after adding the equipment, avatar and entry sequence to the scene.
 */
export function applyBayWhiteLightMask(THREE, scene, bays, {
  yellowBayIds = [0, 9, 5, 12, 14], minimumWhite = .1, edgeWidth = 1
} = {}) {
  const selected = selectedBays(bays, [], { yellowBayIds });
  if (selected.length > WHITE_MASK_MAX_BAYS) {
    throw new RangeError(`White-light masking supports at most ${WHITE_MASK_MAX_BAYS} yellow bays.`);
  }
  const uniforms = {
    fabYellowBayBounds: { value: Array.from({ length: WHITE_MASK_MAX_BAYS }, (_, i) => {
      const bay = selected[i];
      return new THREE.Vector4(bay?.x ?? 0, bay?.z ?? 0,
        AMBER_BAY_SIZE.width / 2, AMBER_BAY_SIZE.depth / 2);
    }) },
    fabYellowBayCount: { value: selected.length },
    fabWhiteMaskEnabled: { value: 1 },
    fabWhiteMaskMinimum: { value: THREE.MathUtils.clamp(minimumWhite, 0, 1) },
    fabWhiteMaskEdgeWidth: { value: Math.max(.001, edgeWidth) }
  };
  const materials = new Set();
  scene.traverse(object => {
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material?.isMeshStandardMaterial || material?.isMeshPhysicalMaterial) materials.add(material);
    }
  });

  const vertexWorldPosition = /* glsl */`
    #include <worldpos_vertex>
    // transformed already includes morphing, skinning and displacement.
    vec4 fabWorldPosition = vec4( transformed, 1.0 );
    #ifdef USE_BATCHING
      fabWorldPosition = batchingMatrix * fabWorldPosition;
    #endif
    #ifdef USE_INSTANCING
      fabWorldPosition = instanceMatrix * fabWorldPosition;
    #endif
    vFabWorldPosition = ( modelMatrix * fabWorldPosition ).xyz;
  `;
  const fragmentMask = /* glsl */`
    varying vec3 vFabWorldPosition;
    uniform vec4 fabYellowBayBounds[${WHITE_MASK_MAX_BAYS}];
    uniform int fabYellowBayCount;
    uniform float fabWhiteMaskEnabled;
    uniform float fabWhiteMaskMinimum;
    uniform float fabWhiteMaskEdgeWidth;

    float fabWhiteLightFactor() {
      float yellowCoverage = 0.0;
      for ( int i = 0; i < ${WHITE_MASK_MAX_BAYS}; i ++ ) {
        if ( i < fabYellowBayCount ) {
          vec4 bay = fabYellowBayBounds[i];
          vec2 distanceFromInnerEdge = abs( vFabWorldPosition.xz - bay.xy )
            - bay.zw + vec2( fabWhiteMaskEdgeWidth );
          float edgeDistance = max( distanceFromInnerEdge.x, distanceFromInnerEdge.y );
          float coverage = 1.0 - smoothstep( 0.0, fabWhiteMaskEdgeWidth, edgeDistance );
          yellowCoverage = max( yellowCoverage, coverage );
        }
      }
      return mix( 1.0, fabWhiteMaskMinimum, yellowCoverage * fabWhiteMaskEnabled );
    }
  `;
  const areaLightMarker = '#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )';
  if (!THREE.ShaderChunk.lights_fragment_begin.includes(areaLightMarker)) {
    throw new Error('Three light shader changed: cannot separate white lights from yellow area lights.');
  }
  const lightsBegin = THREE.ShaderChunk.lights_fragment_begin.replace(areaLightMarker, /* glsl */`
    // Directional/point/spot lights have accumulated; area lights have not.
    float fabWhite = fabWhiteLightFactor();
    reflectedLight.directDiffuse *= fabWhite;
    reflectedLight.directSpecular *= fabWhite;
    #ifdef USE_CLEARCOAT
      clearcoatSpecularDirect *= fabWhite;
    #endif
    #ifdef USE_SHEEN
      sheenSpecularDirect *= fabWhite;
    #endif
    ${areaLightMarker}
  `);
  const lightsEnd = /* glsl */`
    #include <lights_fragment_end>
    reflectedLight.indirectDiffuse *= fabWhite;
    reflectedLight.indirectSpecular *= fabWhite;
    #ifdef USE_CLEARCOAT
      clearcoatSpecularIndirect *= fabWhite;
    #endif
    #ifdef USE_SHEEN
      sheenSpecularIndirect *= fabWhite;
    #endif
  `;
  const patches = [];
  for (const material of materials) {
    // Reapplying to the same material replaces the mask, rather than stacking it.
    whiteMaskPatches.get(material)?.restore();
    const previousCompile = material.onBeforeCompile;
    const previousCacheKey = material.customProgramCacheKey;
    const defaultCacheKey = previousCacheKey === THREE.Material.prototype.customProgramCacheKey;
    const compile = function(shader, renderer) {
      previousCompile.call(this, shader, renderer);
      if (!shader.vertexShader.includes('#include <worldpos_vertex>') ||
          !shader.fragmentShader.includes('#include <lights_fragment_begin>') ||
          !shader.fragmentShader.includes('#include <lights_fragment_end>')) {
        throw new Error(`Cannot apply yellow-bay lighting to material ${this.name || this.type}: shader hooks changed.`);
      }
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = `varying vec3 vFabWorldPosition;\n${shader.vertexShader}`
        .replace('#include <worldpos_vertex>', vertexWorldPosition);
      shader.fragmentShader = `${fragmentMask}\n${shader.fragmentShader}`
        .replace('#include <lights_fragment_begin>', lightsBegin)
        .replace('#include <lights_fragment_end>', lightsEnd);
    };
    const cacheKey = function() {
      const originalKey = defaultCacheKey ? previousCompile.toString() : previousCacheKey.call(this);
      return `${originalKey}|fab-white-light-mask-v1-${WHITE_MASK_MAX_BAYS}`;
    };
    material.onBeforeCompile = compile;
    material.customProgramCacheKey = cacheKey;
    material.needsUpdate = true;
    const patch = {
      restore() {
        if (material.onBeforeCompile === compile) material.onBeforeCompile = previousCompile;
        if (material.customProgramCacheKey === cacheKey) material.customProgramCacheKey = previousCacheKey;
        if (whiteMaskPatches.get(material) === patch) whiteMaskPatches.delete(material);
        material.needsUpdate = true;
      }
    };
    whiteMaskPatches.set(material, patch); patches.push(patch);
  }
  return {
    materials: [...materials], uniforms, bayIds: selected.map(bay => bay.id),
    setEnabled(enabled) { uniforms.fabWhiteMaskEnabled.value = enabled ? 1 : 0; },
    setOverview(overview) { uniforms.fabWhiteMaskEnabled.value = overview ? 0 : 1; },
    dispose() { for (const patch of patches) patch.restore(); }
  };
}
