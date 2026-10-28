"use client";
import { useFrame } from "@react-three/fiber";
import { useRef, type ReactNode } from "react";
import * as THREE from "three";

const tmp = new THREE.Vector3();

/** Renders its children only when the camera is within `distance` metres (cuts draw calls for small detail). */
export function Near({ distance, children, at }: { distance: number; children: ReactNode; at?: [number, number, number] }) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    if (!g.current) return;
    if (at) tmp.set(at[0], at[1], at[2]);
    else g.current.getWorldPosition(tmp);
    g.current.visible = camera.position.distanceTo(tmp) < distance;
  });
  return <group ref={g}>{children}</group>;
}
