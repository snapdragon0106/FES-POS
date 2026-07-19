import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, usePresence } from "framer-motion";

export { AnimatePresence };

interface Props {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
}

/**
 * A list row that plays HarmonyOS's premium "dissolve" delete animation when
 * it leaves the list. Use it as a direct child of <AnimatePresence>, keyed by
 * the row's id — when the row disappears from the data (after the delete
 * mutation refetches), AnimatePresence keeps this node mounted and hands us a
 * usePresence() signal; we then run the exit and call safeToRemove().
 *
 * The exit (see the research spec) is: a granular noise alpha-mask erodes the
 * card (mask-position/size shift) while it fades and shrinks slightly, then
 * the row collapses its own height — and the flex gap after it, via a matching
 * negative margin — so the rows below glide up to fill the space through
 * normal reflow (no FLIP needed). Everything is compositor-friendly except the
 * short one-shot height collapse. Under prefers-reduced-motion we drop the
 * mask and spatial drama and keep only a quick fade + collapse.
 *
 * The mask is applied only during the exit — a permanent noise mask would
 * speckle the card at rest.
 */
export default function DissolveItem({ children, className = "", style, onClick }: Props) {
  const [isPresent, safeToRemove] = usePresence();
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (isPresent) return;
    const el = ref.current;
    if (!el) {
      safeToRemove();
      return;
    }

    const reduce =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;

    const cs = getComputedStyle(el);
    const height = el.getBoundingClientRect().height;
    const parent = el.parentElement;
    const gap = parent
      ? parseFloat(getComputedStyle(parent).rowGap || getComputedStyle(parent).gap || "0") || 0
      : 0;

    // Freeze the box so height/gap can animate to zero smoothly, and take the
    // row out of pointer/interaction flow while it leaves.
    el.style.height = `${height}px`;
    el.style.flex = "0 0 auto";
    el.style.overflow = "hidden";
    el.style.pointerEvents = "none";
    el.style.willChange = "height, opacity, transform";

    const DURATION = reduce ? 200 : 560;
    const FRICTION = "cubic-bezier(0.2, 0, 0.2, 1)";

    if (!reduce) {
      // Apply the noise mask (referencing the --ws-noise CSS var) now, only
      // for the duration of the exit.
      el.style.webkitMaskImage = "var(--ws-noise)";
      el.style.maskImage = "var(--ws-noise)";
      el.style.webkitMaskRepeat = "repeat";
      el.style.maskRepeat = "repeat";
      void el.offsetHeight; // commit the mask before animating it
    }

    // Height + gap + opacity collapse (the structural part).
    const collapse = el.animate(
      [
        { height: `${height}px`, marginBottom: cs.marginBottom, opacity: 1 },
        { height: "0px", marginBottom: `${-gap}px`, opacity: 0 },
      ],
      { duration: DURATION, easing: FRICTION, fill: "forwards" },
    );

    // The granular erosion + subtle shrink (the "shatter/dissolve" character).
    if (!reduce) {
      el.animate(
        [
          {
            transform: "scale(1)",
            maskPosition: "0% 0%",
            maskSize: "340% 340%",
            WebkitMaskPosition: "0% 0%",
            WebkitMaskSize: "340% 340%",
            offset: 0,
          },
          {
            transform: "scale(0.965)",
            maskPosition: "82% 60%",
            maskSize: "150% 150%",
            WebkitMaskPosition: "82% 60%",
            WebkitMaskSize: "150% 150%",
            offset: 0.75,
          },
          {
            transform: "scale(0.965)",
            maskPosition: "82% 60%",
            maskSize: "150% 150%",
            WebkitMaskPosition: "82% 60%",
            WebkitMaskSize: "150% 150%",
            offset: 1,
          },
        ],
        { duration: DURATION, easing: FRICTION, fill: "forwards" },
      );
    }

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      safeToRemove();
    };
    collapse.finished.then(finish).catch(finish);
    // Safety net if a browser never resolves the animation promise.
    const timer = setTimeout(finish, DURATION + 250);
    return () => clearTimeout(timer);
  }, [isPresent, safeToRemove]);

  return (
    <div ref={ref} className={className} style={style} onClick={onClick}>
      {children}
    </div>
  );
}
