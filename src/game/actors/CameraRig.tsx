"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import { useRef } from "react";
import * as THREE from "three";
import { consumeLook, input, take } from "../input";
import { live } from "../shared";
import { hud } from "../store";

import { terrainHeight, WATER } from "../world/layout";
import { surfaceHeight } from "../world/roadHeights";

const DIST = { walk: [2.2, 4.6, 12], car: [4, 7.5, 18], passenger: [4, 7.5, 18], train: [6, 14, 40], bus: [3, 7, 20], jet: [10, 24, 70] } as const;

/**
 * Third-person orbit camera. Mouse/touch drag rotates, wheel/pinch zooms. In
 * vehicles it eases back behind the direction of travel when you stop steering it.
 * A ray cast against the world keeps it from clipping into buildings or terrain.
 */
export function CameraRig() {
  const { camera } = useThree();
  const { world, rapier } = useRapier();
  const smoothTarget = useRef(new THREE.Vector3());
  const lastLook = useRef(0);
  const zoom = useRef<Record<string, number>>({});
  const first = useRef(true);

  useFrame((state, dt) => {
    dt = Math.min(dt, 0.05);
    const mode = live.me.mode;
    const { dx, dy, zoom: dz } = consumeLook();
    if (dx || dy) lastLook.current = state.clock.elapsedTime;
    if (take("view") || take("camera")) {
      const views: ("third" | "action" | "first" | "drone")[] = ["third", "action", "first", "drone"];
      const cur = hud.get().view;
      const next = views[(views.indexOf(cur) + 1) % views.length];
      hud.set({ view: next });
    }
    const currentView = hud.get().view;
    const fp = currentView === "first";
    const isAction = currentView === "action";
    const isDrone = currentView === "drone";

    live.cameraYaw -= dx * 0.0042;
    // Keep pitch positive (>= 0.02) so the boom NEVER dips below the ground plane into the void
    live.cameraPitch = THREE.MathUtils.clamp(live.cameraPitch + dy * 0.0032, 0.02, 1.25);

    // Auto-align behind vehicles while driving and not looking around.
    const vehicleHeading = (live.me as { heading?: number }).heading;
    if (mode !== "walk" && vehicleHeading !== undefined && state.clock.elapsedTime - lastLook.current > 1.2) {
      const desired = vehicleHeading + Math.PI;
      let d = desired - live.cameraYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      live.cameraYaw += d * Math.min(1, dt * 2.2);
    }

    const [minD, defD, maxD] = DIST[mode];
    zoom.current[mode] = THREE.MathUtils.clamp((zoom.current[mode] ?? defD) + dz * (maxD - minD) * 0.08, minD, maxD);
    let dist = zoom.current[mode];
    if (isAction) dist = Math.max(minD * 0.8, dist * 0.7);
    if (isDrone) dist = Math.min(maxD * 1.5, dist * 1.6);

    const target = live.cameraTarget;
    if (first.current) {
      smoothTarget.current.copy(target);
      first.current = false;
    }
    smoothTarget.current.lerp(target, 1 - Math.exp(-dt * (mode === "walk" ? 14 : 9)));

    if (fp) {
      // First person / cockpit: eye at target, strictly clamped above terrain
      camera.position.copy(smoothTarget.current);
      const minEye = surfaceHeight(camera.position.x, camera.position.z) + 1.15;
      if (camera.position.y < minEye) camera.position.y = minEye;
      const look = new THREE.Vector3(-Math.sin(live.cameraYaw), -Math.sin(live.cameraPitch - 0.15), -Math.cos(live.cameraYaw));
      camera.lookAt(camera.position.clone().add(look));
      return;
    }

    const effectivePitch = isAction ? Math.max(0.08, live.cameraPitch * 0.5) : isDrone ? Math.max(0.75, live.cameraPitch + 0.45) : live.cameraPitch;
    const offset = new THREE.Vector3(Math.sin(live.cameraYaw) * Math.cos(effectivePitch), Math.sin(effectivePitch), Math.cos(live.cameraYaw) * Math.cos(effectivePitch));
    const pivot = smoothTarget.current;
    // Collision: shorten the boom if something is between the pivot and the camera.
    const ray = new rapier.Ray(pivot, offset);
    const hit = world.castRay(ray, dist + 0.4, true, undefined, undefined, undefined, undefined, (c) => {
      const kind = (c.parent()?.userData as { kind?: string } | undefined)?.kind;
      return kind !== "player" && kind !== "vehicle" && kind !== "train" && kind !== "jet" && kind !== "traffic";
    });
    const d = hit ? Math.max(0.6, hit.timeOfImpact - 0.35) : dist;
    const desired = pivot.clone().addScaledVector(offset, d);
    
    // Hard floor clamp: camera must never clip beneath terrain, road, or sea level
    const groundFloor = surfaceHeight(desired.x, desired.z) + 0.8;
    if (desired.y < groundFloor) desired.y = groundFloor;

    camera.position.lerp(desired, hit ? 1 : 1 - Math.exp(-dt * 12));
    const curMin = surfaceHeight(camera.position.x, camera.position.z) + 0.7;
    if (camera.position.y < curMin) camera.position.y = curMin;

    camera.lookAt(pivot);
  });
  return null;
}
