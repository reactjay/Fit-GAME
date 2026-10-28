// Live, per-frame game data shared between scene components (not React state).
import * as THREE from "three";
import type { Mode } from "./store";

export type Pose = { x: number; y: number; z: number; ry: number };
export type Interactable = { label: () => string | null; pos: () => THREE.Vector3; radius: number; act: () => void };
export type RemoteState = {
  x: number; y: number; z: number; ry: number; anim: string; mode: Mode; vehicle: string | null; model: string; t: number;
};

export const live = {
  me: { id: "", conn: "", pos: new THREE.Vector3(), ry: 0, heading: undefined as number | undefined, mode: "walk" as Mode, vehicle: null as string | null, anim: "idle", model: "amara" as string },
  partnerId: null as string | null,
  partnerModel: "kofi" as string,
  /** Things the player can use when nearby ("Press E to …"). */
  interactables: new Map<string, Interactable>(),
  /** Pending teleport for the local player (elevator, exiting vehicles, train). */
  teleport: null as null | { x: number; y: number; z: number; ry?: number },
  partner: null as null | { target: RemoteState; shown: THREE.Vector3; ry: number; seen: number },
  clockOffset: 0, // server time - local time, ms
  seats: {} as Record<string, { driver?: string; passenger?: string }>,
  vehicles: new Map<string, { pos: THREE.Vector3; quat: THREE.Quaternion; heading: number; speed: number }>(),
  /** Latest network pose per vehicle: [x,y,z,qx,qy,qz,qw,speed,steer] */
  poses: new Map<string, { p: number[]; t: number }>(),
  send: (_msg: Record<string, unknown>) => false as boolean,
  jetAirborne: false,
  cameraTarget: new THREE.Vector3(),
  cameraYaw: Math.PI,
  cameraPitch: 0.28,
  cameraDistance: 6,
  /** Set by Player romance interactable; GameNet reads, broadcasts, then clears. */
  pendingRomance: null as null | { action: string; anim: string },
  /** Received from partner via game:romance; drives RemotePlayer anim override. */
  partnerRomance: null as null | { action: string; anim: string; until: number },
  /** A pin to share with the partner (e.g. a date invite); GameNet broadcasts then clears. */
  pendingMarker: null as null | { x: number; z: number; label: string },
  /** Navigation target set by Places panel; minimap shows direction arrow. */
  waypoint: null as null | { x: number; z: number; label: string },
};

/** Shared world clock in seconds (same on both devices after the server sync). */
export const worldSeconds = () => (Date.now() + live.clockOffset) / 1000;

/** Seat holders are "userId|connectionId": this device holds the seat. */
export const isMine = (holder?: string) => Boolean(holder) && holder === `${live.me.id}|${live.me.conn}`;
/** Which person sits there (any device). */
export const seatUser = (holder?: string) => holder?.split("|")[0] ?? null;
