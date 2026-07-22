"use client";

import {
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";

type AuthAtmosphereProps = {
  children: ReactNode;
};

/**
 * Base parallax unit (px). Layer depths multiply this
 * (far / mid / counter) so the mesh reads as depth, not cursor chase.
 */
const MAX_SHIFT_PX = 40;
/** Slightly snappier than V2, still lagged — not 1:1 tracking. */
const EASE = 0.08;
const IDLE_EPSILON = 0.12;

/** Soft cursor glints — capped, mouse / fine pointer only. */
const MAX_GLINTS = 5;
const GLINT_MIN_TRAVEL_PX = 36;
const GLINT_COOLDOWN_MS = 110;
const GLINT_OFFSET_MIN = 12;
const GLINT_OFFSET_MAX = 28;

/**
 * Auth-only canvas: teal mesh + grain + multi-depth parallax + soft glints.
 * Form card stays opaque above; motion disabled under prefers-reduced-motion.
 */
export function AuthAtmosphere({ children }: AuthAtmosphereProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const glintsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const stage = stageRef.current;
    const glintsLayer = glintsRef.current;
    if (!root || !stage || !glintsLayer) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointerQuery = window.matchMedia("(pointer: fine)");

    let rafId = 0;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let enabled = !motionQuery.matches;

    let lastPointerX = 0;
    let lastPointerY = 0;
    let hasPointerSample = false;
    let travelSinceSpawn = 0;
    let lastSpawnAt = 0;

    const freeGlints: HTMLSpanElement[] = [];
    const glintPool: HTMLSpanElement[] = [];

    for (let index = 0; index < MAX_GLINTS; index += 1) {
      const glint = document.createElement("span");
      glint.className = "auth-atmosphere-glint";
      glint.setAttribute("aria-hidden", "true");
      glintsLayer.appendChild(glint);
      glintPool.push(glint);
      freeGlints.push(glint);
    }

    const releaseGlint = (glint: HTMLSpanElement) => {
      glint.classList.remove("is-alive");
      glint.style.visibility = "hidden";
      if (!freeGlints.includes(glint)) {
        freeGlints.push(glint);
      }
    };

    const clearGlints = () => {
      for (const glint of glintPool) {
        releaseGlint(glint);
      }
      travelSinceSpawn = 0;
      hasPointerSample = false;
    };

    const spawnGlint = (clientX: number, clientY: number) => {
      if (!enabled || !finePointerQuery.matches) return;
      if (freeGlints.length === 0) return;

      const now = performance.now();
      if (now - lastSpawnAt < GLINT_COOLDOWN_MS) return;

      const glint = freeGlints.pop();
      if (!glint) return;

      const rect = root.getBoundingClientRect();
      const angle = Math.random() * Math.PI * 2;
      const dist =
        GLINT_OFFSET_MIN +
        Math.random() * (GLINT_OFFSET_MAX - GLINT_OFFSET_MIN);
      const x = clientX - rect.left + Math.cos(angle) * dist;
      const y = clientY - rect.top + Math.sin(angle) * dist;
      const size = 4.5 + Math.random() * 3.5;

      glint.style.setProperty("--glint-size", `${size.toFixed(1)}px`);
      glint.style.left = `${x.toFixed(1)}px`;
      glint.style.top = `${y.toFixed(1)}px`;
      glint.style.visibility = "visible";
      glint.classList.remove("is-alive");
      // Restart CSS animation cleanly.
      void glint.offsetWidth;
      glint.classList.add("is-alive");

      lastSpawnAt = now;
      travelSinceSpawn = 0;

      const onEnd = () => {
        glint.removeEventListener("animationend", onEnd);
        releaseGlint(glint);
      };
      glint.addEventListener("animationend", onEnd);
    };

    const applyTransform = (x: number, y: number) => {
      stage.style.setProperty("--auth-px", x.toFixed(2));
      stage.style.setProperty("--auth-py", y.toFixed(2));
    };

    const resetTargets = () => {
      targetX = 0;
      targetY = 0;
    };

    const tick = () => {
      currentX += (targetX - currentX) * EASE;
      currentY += (targetY - currentY) * EASE;

      if (Math.abs(currentX) < IDLE_EPSILON && Math.abs(targetX) < IDLE_EPSILON) {
        currentX = 0;
      }
      if (Math.abs(currentY) < IDLE_EPSILON && Math.abs(targetY) < IDLE_EPSILON) {
        currentY = 0;
      }

      applyTransform(currentX, currentY);

      const stillMoving =
        Math.abs(targetX - currentX) > IDLE_EPSILON ||
        Math.abs(targetY - currentY) > IDLE_EPSILON ||
        Math.abs(currentX) > IDLE_EPSILON ||
        Math.abs(currentY) > IDLE_EPSILON;

      rafId = stillMoving ? requestAnimationFrame(tick) : 0;
    };

    const ensureTick = () => {
      if (!enabled) return;
      if (!rafId) rafId = requestAnimationFrame(tick);
    };

    const setTargetFromClient = (clientX: number, clientY: number) => {
      const rect = root.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const nx = (clientX - rect.left) / rect.width - 0.5;
      const ny = (clientY - rect.top) / rect.height - 0.5;
      targetX = Math.max(-1, Math.min(1, nx * 2)) * MAX_SHIFT_PX;
      targetY = Math.max(-1, Math.min(1, ny * 2)) * MAX_SHIFT_PX;
      ensureTick();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!enabled) return;

      setTargetFromClient(event.clientX, event.clientY);

      // Glints: mouse / fine pointer only — no touch trail.
      const canGlint =
        finePointerQuery.matches &&
        (event.pointerType === "mouse" || event.pointerType === "");

      if (!canGlint) return;

      if (!hasPointerSample) {
        lastPointerX = event.clientX;
        lastPointerY = event.clientY;
        hasPointerSample = true;
        return;
      }

      const dx = event.clientX - lastPointerX;
      const dy = event.clientY - lastPointerY;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      travelSinceSpawn += Math.hypot(dx, dy);

      if (travelSinceSpawn >= GLINT_MIN_TRAVEL_PX) {
        spawnGlint(event.clientX, event.clientY);
      }
    };

    const onPointerLeave = () => {
      if (!enabled) return;
      resetTargets();
      ensureTick();
      hasPointerSample = false;
      travelSinceSpawn = 0;
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!enabled) return;
      if (event.pointerType === "touch") {
        resetTargets();
        ensureTick();
      }
    };

    const onMotionPreferenceChange = () => {
      enabled = !motionQuery.matches;
      if (!enabled) {
        resetTargets();
        currentX = 0;
        currentY = 0;
        applyTransform(0, 0);
        clearGlints();
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = 0;
        }
      }
    };

    root.addEventListener("pointermove", onPointerMove, { passive: true });
    root.addEventListener("pointerleave", onPointerLeave);
    root.addEventListener("pointercancel", onPointerUp, { passive: true });
    root.addEventListener("pointerup", onPointerUp, { passive: true });
    motionQuery.addEventListener("change", onMotionPreferenceChange);

    return () => {
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerleave", onPointerLeave);
      root.removeEventListener("pointercancel", onPointerUp);
      root.removeEventListener("pointerup", onPointerUp);
      motionQuery.removeEventListener("change", onMotionPreferenceChange);
      if (rafId) cancelAnimationFrame(rafId);
      for (const glint of glintPool) {
        glint.remove();
      }
    };
  }, []);

  const stageVars = {
    "--auth-px": 0,
    "--auth-py": 0,
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      className="auth-atmosphere relative flex min-h-svh flex-col overflow-hidden bg-background"
    >
      <div
        ref={stageRef}
        aria-hidden
        className="auth-atmosphere-layer pointer-events-none absolute inset-0"
        style={stageVars}
      >
        <div
          className="auth-atmosphere-parallax auth-atmosphere-parallax-far absolute inset-[-6%]"
          style={{ "--auth-depth": 0.55 } as CSSProperties}
        >
          <div className="auth-atmosphere-blob auth-atmosphere-blob-a" />
          <div className="auth-atmosphere-blob auth-atmosphere-blob-b" />
        </div>

        <div
          className="auth-atmosphere-parallax auth-atmosphere-parallax-mid absolute inset-[-4%]"
          style={{ "--auth-depth": 1 } as CSSProperties}
        >
          <div className="auth-atmosphere-blob auth-atmosphere-blob-c" />
        </div>

        <div
          className="auth-atmosphere-parallax auth-atmosphere-parallax-near absolute inset-[-5%]"
          style={{ "--auth-depth": -0.85 } as CSSProperties}
        >
          <div className="auth-atmosphere-wash" />
        </div>

        <div className="auth-atmosphere-grain" />
        <div ref={glintsRef} className="auth-atmosphere-glints" />
      </div>

      <div className="relative z-[1] flex min-h-svh flex-1 flex-col">{children}</div>
    </div>
  );
}
