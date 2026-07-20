/**
 * HarmonyOS-style "dissolve" delete animation, driven imperatively on a real
 * DOM node (no framer-motion presence lifecycle to depend on).
 *
 * A deleted row erodes through a granular noise alpha-mask (mask-position/size
 * shift so the noise granularly eats the card) while it fades and shrinks
 * slightly, then collapses its own height — and the flex gap after it, via a
 * matching negative margin — so the rows below glide up to fill the space via
 * normal reflow. Everything is compositor-friendly except the short one-shot
 * height collapse. The mask is only applied for the duration of the exit (a
 * permanent noise mask would speckle the card at rest). Degrades to a clean
 * fade + collapse if masks are unsupported, and to a quick fade under
 * prefers-reduced-motion.
 *
 * Usage: capture the row element synchronously from the click event, then run
 * this in parallel with the delete mutation so the animation overlaps the
 * network round-trip:
 *
 *   const row = (e.currentTarget as HTMLElement).closest(".ws-card");
 *   const del = mutation.mutateAsync({ id });
 *   if (row) await dissolveOut(row as HTMLElement);
 *   await del;
 *   utils.list.invalidate();
 */
/**
 * HarmonyOS's springMotion settle curve (response 0.55s, dampingFraction
 * 0.825 → stiffness 130 / damping 19, mass 1), baked to a CSS linear()
 * easing. Used for the swipe spring-back, where a cubic-bezier can't express
 * a real spring. Mirrors --spring-settle in index.css.
 */
export const SPRING_SETTLE =
  "linear(0,0.0062,0.0234,0.0494,0.0824,0.1207,0.163,0.208,0.2547,0.3023,0.3499,0.3972,0.4434,0.4883,0.5315,0.5729,0.6122,0.6493,0.6841,0.7167,0.747,0.7751,0.801,0.8247,0.8465,0.8663,0.8842,0.9004,0.915,0.928,0.9397,0.95,0.9591,0.9672,0.9742,0.9803,0.9856,0.9901,0.9939,0.9972,0.9999)";

export function dissolveOut(el: HTMLElement, opts?: { fromX?: number }): Promise<void> {
  const reduce =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  // When the row was swiped away it is already offset horizontally; start the
  // shatter from there and let it drift a little further in the swipe
  // direction, so the gesture flows straight into the disintegration.
  const fromX = opts?.fromX ?? 0;
  const toX = fromX === 0 ? 0 : fromX - 24;

  const cs = getComputedStyle(el);
  const height = el.getBoundingClientRect().height;
  const parent = el.parentElement;
  const gap = parent
    ? parseFloat(getComputedStyle(parent).rowGap || getComputedStyle(parent).gap || "0") || 0
    : 0;

  // Freeze the box so the height + gap can collapse smoothly, and pull the row
  // out of interaction while it leaves.
  el.style.height = `${height}px`;
  el.style.flex = "0 0 auto";
  el.style.overflow = "hidden";
  el.style.pointerEvents = "none";
  el.style.willChange = "height, opacity, transform";

  const DURATION = reduce ? 200 : 560;
  const FRICTION = "cubic-bezier(0.2, 0, 0.2, 1)";
  const anims: Animation[] = [];

  if (!reduce) {
    el.style.setProperty("-webkit-mask-image", "var(--ws-noise)");
    el.style.setProperty("mask-image", "var(--ws-noise)");
    el.style.setProperty("-webkit-mask-repeat", "repeat");
    el.style.setProperty("mask-repeat", "repeat");
    void el.offsetHeight; // commit the mask before animating it
    anims.push(
      el.animate(
        [
          { transform: `translateX(${fromX}px) translateY(0) scale(1)`, maskPosition: "0% 0%", maskSize: "300% 300%", WebkitMaskPosition: "0% 0%", WebkitMaskSize: "300% 300%", offset: 0 },
          { transform: `translateX(${toX}px) translateY(-7px) scale(0.985)`, maskPosition: "92% 70%", maskSize: "120% 120%", WebkitMaskPosition: "92% 70%", WebkitMaskSize: "120% 120%", offset: 0.72 },
          { transform: `translateX(${toX}px) translateY(-7px) scale(0.985)`, maskPosition: "92% 70%", maskSize: "120% 120%", WebkitMaskPosition: "92% 70%", WebkitMaskSize: "120% 120%", offset: 1 },
        ] as Keyframe[],
        { duration: DURATION, easing: FRICTION, fill: "forwards" },
      ),
    );
  }

  const collapse = el.animate(
    [
      { height: `${height}px`, marginBottom: cs.marginBottom, opacity: 1 },
      { height: "0px", marginBottom: `${-gap}px`, opacity: 0 },
    ],
    { duration: DURATION, easing: FRICTION, fill: "forwards" },
  );
  anims.push(collapse);

  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    collapse.finished.then(finish).catch(finish);
    // Safety net if a browser never resolves the animation promise.
    setTimeout(finish, DURATION + 250);
  });
}

/**
 * Undo the inline styles / animations dissolveOut applied, so a row can be
 * restored if the delete mutation ends up failing.
 */
export function dissolveRestore(el: HTMLElement): void {
  el.getAnimations().forEach((a) => a.cancel());
  for (const prop of [
    "height", "flex", "overflow", "pointer-events", "will-change", "opacity",
    "margin-bottom", "transform", "-webkit-mask-image", "mask-image",
    "-webkit-mask-repeat", "mask-repeat", "-webkit-mask-position", "mask-position",
    "-webkit-mask-size", "mask-size",
  ]) {
    el.style.removeProperty(prop);
  }
}
