// Unified input: keyboard + mouse-look on desktop, joystick + drag-look + buttons on touch.
// Read every frame by the active controller; edge-triggered actions are consumed once.

export const input = {
  keys: new Set<string>(),
  stick: { x: 0, y: 0 }, // touch joystick, -1..1 (y = down)
  look: { dx: 0, dy: 0 }, // accumulated look deltas (pixels)
  zoom: 0,
  held: { sprint: false, brake: false, jump: false, throttleUp: false, throttleDown: false },
  pressed: new Set<string>(), // one-shot actions: interact, view, map, horn, jump
};

export function axis() {
  const k = input.keys;
  let x = input.stick.x;
  let y = input.stick.y;
  if (k.has("a") || k.has("arrowleft")) x = -1;
  if (k.has("d") || k.has("arrowright")) x = 1;
  if (k.has("w") || k.has("arrowup")) y = -1;
  if (k.has("s") || k.has("arrowdown")) y = 1;
  return { x, y };
}

export const isDown = (...keys: string[]) => keys.some((k) => input.keys.has(k));
export function take(action: string) {
  return input.pressed.delete(action);
}
export function consumeLook() {
  const { dx, dy } = input.look;
  input.look.dx = 0;
  input.look.dy = 0;
  const z = input.zoom;
  input.zoom = 0;
  return { dx, dy, zoom: z };
}

const KEY_ACTIONS: Record<string, string> = {
  e: "interact",
  f: "interact",
  v: "view",
  c: "view",
  m: "map",
  h: "horn",
  b: "horn",
  " ": "jump",
  l: "land",
  "1": "mode:walk",
  "2": "mode:drive",
  "3": "mode:danfo",
  "4": "mode:fly",
};

/** Installs desktop + touch look listeners on the canvas element; returns cleanup. */
export function bindDesktopInput(el: HTMLElement) {
  const isTyping = (t: EventTarget | null) => t instanceof Element && t.closest("input,textarea,select,[contenteditable]");
  const down = (e: KeyboardEvent) => {
    if (isTyping(e.target)) return;
    const k = e.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
    if (!input.keys.has(k) && KEY_ACTIONS[k]) input.pressed.add(KEY_ACTIONS[k]);
    input.keys.add(k);
    input.held.sprint = e.shiftKey;
  };
  const up = (e: KeyboardEvent) => {
    input.keys.delete(e.key.toLowerCase());
    input.held.sprint = e.shiftKey;
  };
  const blur = () => input.keys.clear();

  // Mouse look & Touch drag-look directly on the 3D canvas (behind HUD UI)
  let dragging = false;
  const touches = new Map<number, { x: number; y: number }>();
  let lastPinchDist = 0;

  const pdown = (e: PointerEvent) => {
    if (e.pointerType === "touch") {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        const [p1, p2] = Array.from(touches.values());
        lastPinchDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      }
    } else {
      dragging = true;
    }
  };

  const pup = (e: PointerEvent) => {
    if (e.pointerType === "touch") {
      touches.delete(e.pointerId);
      if (touches.size < 2) lastPinchDist = 0;
    } else {
      dragging = false;
    }
  };

  const pmove = (e: PointerEvent) => {
    if (e.pointerType === "touch") {
      const prev = touches.get(e.pointerId);
      if (!prev) return;
      if (touches.size === 1) {
        // Drag to look around
        const dx = e.clientX - prev.x;
        const dy = e.clientY - prev.y;
        input.look.dx += dx * 1.4;
        input.look.dy += dy * 1.4;
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      } else if (touches.size === 2) {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const [p1, p2] = Array.from(touches.values());
        const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        if (lastPinchDist > 0) {
          const diff = lastPinchDist - d;
          input.zoom += Math.sign(diff) * Math.min(Math.abs(diff) * 0.05, 2);
        }
        lastPinchDist = d;
      }
    } else {
      if (dragging || document.pointerLockElement === el) {
        input.look.dx += e.movementX;
        input.look.dy += e.movementY;
      }
    }
  };

  const wheel = (e: WheelEvent) => {
    input.zoom += Math.sign(e.deltaY);
  };
  const dbl = () => el.requestPointerLock?.();

  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  window.addEventListener("blur", blur);
  el.addEventListener("pointerdown", pdown);
  window.addEventListener("pointerup", pup);
  window.addEventListener("pointercancel", pup);
  window.addEventListener("pointermove", pmove);
  el.addEventListener("wheel", wheel, { passive: true });
  el.addEventListener("dblclick", dbl);

  return () => {
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
    window.removeEventListener("blur", blur);
    el.removeEventListener("pointerdown", pdown);
    window.removeEventListener("pointerup", pup);
    window.removeEventListener("pointercancel", pup);
    window.removeEventListener("pointermove", pmove);
    el.removeEventListener("wheel", wheel);
    el.removeEventListener("dblclick", dbl);
  };
}
