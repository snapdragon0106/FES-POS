import { useRef, type CSSProperties, type ReactNode } from "react";
import { dissolveOut, dissolveRestore, SPRING_SETTLE } from "@/lib/dissolve";

interface Props {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Tap handler — suppressed when the tap turned out to be a swipe. */
  onClick?: () => void;
  /**
   * Commit the deletion. This must do ONLY the mutation — no toast, no
   * query invalidation — because invalidating here would let React unmount
   * the row while it is still shattering. Throwing restores the row.
   */
  onDelete: () => Promise<void>;
  /**
   * Runs after both the mutation and the shatter have finished. Do the toast
   * and the query invalidation here so the row is not pulled out mid-animation.
   */
  onDeleted?: () => void;
  /** Report a failed delete to the user; the row is restored automatically. */
  onDeleteError?: (err: unknown) => void;
  disabled?: boolean;
  /** Fraction of the row width the finger must travel to commit (default 0.4). */
  commitFraction?: number;
  /**
   * Whether a fast flick may commit on a shorter travel. Turn this OFF for
   * destructive-and-unrecoverable rows (e.g. sales records) so only a long,
   * deliberate drag can delete.
   */
  allowFlick?: boolean;
}

/** A fast left flick commits even on a short travel (px per ms). */
const FLICK_VELOCITY = -0.6;
const FLICK_MIN_TRAVEL = -32;
/** Movement before we decide this is a horizontal swipe vs a vertical scroll. */
const DECIDE_SLOP = 8;
/**
 * Velocity is measured across this window rather than from the last single
 * pointermove. A one-frame sample stays high even when the finger has clearly
 * stopped, which made a deliberate "drag then hold then release" read as a
 * flick and permanently delete a row the user meant to cancel.
 */
const VELOCITY_WINDOW_MS = 80;

type Sample = { x: number; t: number };

/**
 * Swipe-to-delete for touch devices, in the style of dismissing a phone
 * notification: the row tracks your finger (HarmonyOS's "跟手" follow phase),
 * and releasing past the threshold hands off to the dissolve — so the row
 * shatters into granular pieces and the list closes up behind it. Releasing
 * short of the threshold springs back using HarmonyOS's settle curve.
 *
 * Only touch pointers are tracked, so mouse users on desktop keep using the
 * trash button (which asks for confirmation) and never trigger this by
 * dragging. `touch-action: pan-y` lets the browser keep vertical scrolling
 * while horizontal movement comes to us.
 */
export default function SwipeToDelete({
  children,
  className = "",
  style,
  onClick,
  onDelete,
  onDeleted,
  onDeleteError,
  disabled = false,
  commitFraction = 0.4,
  allowFlick = true,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const g = useRef({
    active: false,
    decided: false,
    tracking: false,
    committing: false,
    /** Set on release after a real swipe so the trailing click isn't a tap. */
    justSwiped: false,
    startX: 0,
    startY: 0,
    dx: 0,
    samples: [] as Sample[],
    pointerId: -1,
  });

  /** Velocity (px/ms) over the recent window; 0 if the finger has stopped. */
  const releaseVelocity = (): number => {
    const s = g.current.samples;
    if (s.length < 2) return 0;
    const newest = s[s.length - 1];
    // Finger has been still for a while → not a flick, whatever the last
    // frame-pair happened to measure.
    if (performance.now() - newest.t > VELOCITY_WINDOW_MS) return 0;
    let oldest = s[0];
    for (let i = s.length - 1; i >= 0; i--) {
      oldest = s[i];
      if (newest.t - s[i].t >= VELOCITY_WINDOW_MS) break;
    }
    const dt = newest.t - oldest.t;
    if (dt <= 0) return 0;
    return (newest.x - oldest.x) / dt;
  };

  const paint = (dx: number) => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = `translateX(${dx}px)`;
    // Fade a little as it travels so releasing reads as "this is going away".
    const width = el.offsetWidth || 1;
    const progress = Math.min(1, Math.abs(dx) / (width * commitFraction));
    el.style.opacity = String(1 - progress * 0.3);
  };

  const clearVisual = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = "";
    el.style.opacity = "";
    el.style.willChange = "";
  };

  const springBack = (fromX: number) => {
    const el = ref.current;
    if (!el) return;
    const anim = el.animate(
      [
        { transform: `translateX(${fromX}px)`, opacity: el.style.opacity || "1" },
        { transform: "translateX(0px)", opacity: "1" },
      ],
      { duration: 440, easing: SPRING_SETTLE, fill: "forwards" },
    );
    anim.finished
      .then(() => {
        anim.cancel();
        clearVisual();
      })
      .catch(() => clearVisual());
  };

  const reset = () => {
    g.current.active = false;
    g.current.decided = false;
    g.current.tracking = false;
    g.current.pointerId = -1;
    g.current.samples = [];
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Touch only — desktop mouse keeps the confirm-dialog trash button.
    if (disabled || g.current.committing || e.pointerType !== "touch") return;
    if (g.current.active) return; // ignore secondary fingers
    g.current = {
      ...g.current,
      active: true,
      decided: false,
      tracking: false,
      justSwiped: false,
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      samples: [{ x: e.clientX, t: performance.now() }],
      pointerId: e.pointerId,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = g.current;
    if (!s.active || e.pointerId !== s.pointerId) return;

    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;

    if (!s.decided) {
      if (Math.abs(dx) < DECIDE_SLOP && Math.abs(dy) < DECIDE_SLOP) return;
      s.decided = true;
      // Require a clearly horizontal intent so vertical scrolling still wins.
      s.tracking = Math.abs(dx) > Math.abs(dy);
      if (!s.tracking) {
        s.active = false;
        return;
      }
      ref.current?.setPointerCapture?.(e.pointerId);
      if (ref.current) ref.current.style.willChange = "transform, opacity";
    }
    if (!s.tracking) return;

    s.samples.push({ x: e.clientX, t: performance.now() });
    if (s.samples.length > 8) s.samples.shift();

    // Leftward is the delete direction; rightward gets rubber-band resistance.
    s.dx = dx > 0 ? dx * 0.25 : dx;
    paint(s.dx);
  };

  const onPointerUp = async (e: React.PointerEvent<HTMLDivElement>) => {
    const s = g.current;
    if (!s.active || e.pointerId !== s.pointerId) return;
    const el = ref.current;
    const wasTracking = s.tracking;
    const dx = s.dx;
    const vx = releaseVelocity();
    reset();
    if (wasTracking) g.current.justSwiped = true;

    if (!wasTracking || !el) return;

    const width = el.offsetWidth || 1;
    const past = dx < -width * commitFraction;
    const flicked = allowFlick && vx < FLICK_VELOCITY && dx < FLICK_MIN_TRAVEL;

    if (!past && !flicked) {
      springBack(dx);
      return;
    }

    // Commit: hand the swipe straight off to the shatter, then delete.
    g.current.committing = true;
    el.style.opacity = "";
    try {
      // Start the mutation so it overlaps the animation, but only report
      // success / refresh the list once BOTH have finished — invalidating
      // earlier lets React unmount the row mid-shatter.
      const del = onDelete();
      await dissolveOut(el, { fromX: dx });
      await del;
      onDeleted?.();
    } catch (err) {
      dissolveRestore(el);
      clearVisual();
      onDeleteError?.(err);
    } finally {
      g.current.committing = false;
    }
  };

  const onPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = g.current;
    if (!s.active || e.pointerId !== s.pointerId) return;
    const dx = s.dx;
    const wasTracking = s.tracking;
    reset();
    if (wasTracking) {
      g.current.justSwiped = true;
      springBack(dx);
    }
  };

  return (
    <div
      ref={ref}
      className={className}
      style={{ touchAction: "pan-y", ...style }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      // A swipe must not also register as a tap (e.g. row selection). The
      // click fires after pointerup, by which point tracking has been reset,
      // so the release sets justSwiped and we consume it here.
      onClick={() => {
        if (g.current.justSwiped || g.current.tracking || g.current.committing) {
          g.current.justSwiped = false;
          return;
        }
        onClick?.();
      }}
    >
      {children}
    </div>
  );
}
