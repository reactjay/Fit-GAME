"use client";
import { useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { HeightfieldCollider, RigidBody } from "@react-three/rapier";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { worldUniforms } from "./Atmosphere";
import { HALF, SITES, WATER, districtAt, groundGrid, groundType, terrainHeight } from "./layout";

const URBAN: Record<string, number> = { central: 0.85, victoria: 0.7, adeyemi: 0.95, mainland: 0.9, waterfront: 0.5, estate: 0.35, airport: 0.3, outskirts: 0.25 };

const SIZE = HALF * 2;

/** Rendered ground + matching physics heightfield. Grass, sand and rock are blended per vertex. */
export function Terrain({ segments }: { segments: number }) {
  // Physics uses the exact grid we draw, so wheels and feet touch the ground you can see.
  const physicsSegments = segments;
  groundGrid.segments = segments;
  const [grass, grassN, sand, sandN] = useTexture([
    "/assets/textures/sparse_grass_diff.jpg",
    "/assets/textures/sparse_grass_nor.jpg",
    "/assets/textures/coast_sand_01_diff.jpg",
    "/assets/textures/coast_sand_01_nor.jpg",
  ]);
  useMemo(() => {
    for (const t of [grass, grassN, sand, sandN]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;
    }
    grass.colorSpace = sand.colorSpace = THREE.SRGBColorSpace;
  }, [grass, grassN, sand, sandN]);

  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(SIZE, SIZE, segments, segments);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const blend = new Float32Array(pos.count * 3); // x = sand, y = rock, z = laterite/dust (built-up Lagos)
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, terrainHeight(x, z));
      const t = groundType(x, z);
      blend[i * 3] = t === "sand" ? 1 : 0;
      blend[i * 3 + 1] = t === "rock" ? 1 : 0;
      const d = districtAt(x, z).id;
      const market = Math.min(...[SITES.balogun, SITES.yabaMarket].map((m) => Math.hypot(x - m.x, z - m.z) / m.r));
      blend[i * 3 + 2] = t === "grass" ? Math.max(URBAN[d] ?? 0, market < 1.1 ? 1 : 0) : 0;
    }
    g.setAttribute("blend", new THREE.BufferAttribute(blend, 3));
    g.computeVertexNormals();
    return g;
  }, [segments]);

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ map: grass, normalMap: grassN, roughness: 0.95, normalScale: new THREE.Vector2(0.8, 0.8) });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.sandMap = { value: sand };
      shader.uniforms.sandNormal = { value: sandN };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec3 blend;\nvarying vec3 vBlend;\nvarying vec3 vWorld;")
        .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvBlend = blend;\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform sampler2D sandMap;\nuniform sampler2D sandNormal;\nvarying vec3 vBlend;\nvarying vec3 vWorld;")
        .replace(
          "#include <map_fragment>",
          `vec2 tuv = vWorld.xz / 9.0;
           vec4 gcol = texture2D(map, tuv);
           vec4 scol = texture2D(sandMap, tuv * 0.8);
           // break up tiling with a second, larger-scale sample
           gcol.rgb *= mix(0.82, 1.12, texture2D(map, vWorld.xz / 173.0).g);
           vec3 rock = vec3(0.42, 0.40, 0.37) * mix(0.8, 1.1, scol.r);
           vec3 col = mix(gcol.rgb, scol.rgb, smoothstep(0.0, 1.0, vBlend.x));
           col = mix(col, rock, smoothstep(0.0, 1.0, vBlend.y));
           // Lagos red earth: laterite and dust between buildings, patchy, with a little grass.
           float dustPatch = texture2D(map, vWorld.xz / 61.0).g;
           vec3 laterite = mix(vec3(0.42, 0.20, 0.11), vec3(0.58, 0.33, 0.20), scol.r) * mix(0.85, 1.1, dustPatch);
           col = mix(col, laterite, clamp(vBlend.z * (0.55 + 0.6 * dustPatch), 0.0, 1.0));
           float wet = smoothstep(1.4, 0.3, vWorld.y) * vBlend.x;
           col *= mix(1.0, 0.62, wet);
           diffuseColor *= vec4(col, 1.0);`,
        )
        .replace(
          "#include <normal_fragment_maps>",
          `vec3 mapN = mix(texture2D(normalMap, vWorld.xz / 9.0).xyz, texture2D(sandNormal, vWorld.xz / 7.2).xyz, vBlend.x) * 2.0 - 1.0;
           mapN.xy *= normalScale;
           normal = normalize(tbn * mapN);`,
        );
    };
    return m;
  }, [grass, grassN, sand, sandN]);

  // Physics heightfield (Rapier stores samples x-major: index = ix * (n + 1) + iz).
  const heights = useMemo(() => {
    const n = physicsSegments;
    const h = new Float32Array((n + 1) * (n + 1));
    for (let ix = 0; ix <= n; ix++)
      for (let iz = 0; iz <= n; iz++) h[ix * (n + 1) + iz] = terrainHeight(-HALF + (ix / n) * SIZE, -HALF + (iz / n) * SIZE);
    return h;
  }, [physicsSegments]);

  return (
    <>
      <mesh geometry={geometry} material={material} receiveShadow />
      <RigidBody type="fixed" colliders={false} userData={{ kind: "ground" }}>
        <HeightfieldCollider args={[physicsSegments, physicsSegments, Array.from(heights), { x: SIZE, y: 1, z: SIZE }]} friction={1} />
      </RigidBody>
    </>
  );
}

/** Ocean and lagoon: one large animated, reflective water surface. */
export function Water() {
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const uniforms = useRef({ uTime: { value: 0 } });
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: 0x0b4f6c, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.92 });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.current.uTime;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vW;")
        .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed,1.0)).xyz;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;\nvarying vec3 vW;\nfloat wv(vec2 p){return sin(p.x)*cos(p.y);}")
        .replace(
          "#include <normal_fragment_maps>",
          `vec2 p = vW.xz * 0.35;
           float t = uTime;
           float dx = cos(p.x*1.3+t*1.1)*0.5 + cos((p.x+p.y)*2.7+t*1.7)*0.25 + cos(p.x*5.1-t*2.3)*0.12;
           float dz = cos(p.y*1.1+t*0.9)*0.5 + cos((p.y-p.x)*2.3+t*1.5)*0.25 + cos(p.y*4.7+t*2.1)*0.12;
           normal = normalize(normal + vec3(dx, 0.0, dz) * 0.12 * (1.0 - smoothstep(60.0, 900.0, length(vW - cameraPosition))));`,
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
           // shallow water near the shore looks greener and lighter
           diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.48, 0.5), 0.25);`,
        );
    };
    return m;
  }, []);
  useFrame((_, dt) => {
    uniforms.current.uTime.value += dt;
    if (mat.current) mat.current.color.setHex(0x0b4f6c).lerp(new THREE.Color(0x041a26), worldUniforms.uNight.value);
  });
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={WATER} material={material} ref={(m) => void (mat.current = m?.material as THREE.MeshStandardMaterial)}>
      <planeGeometry args={[SIZE + 6000, SIZE + 6000, 1, 1]} />
    </mesh>
  );
}
