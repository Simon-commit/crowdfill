// Small motion helpers. Everything here degrades to instant changes when the
// user prefers reduced motion (the CSS turns the transitions off).
import type { ComponentChildren, RefObject } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Keeps something mounted for `ms` after `show` turns false, so it can play an
 * exit animation. Returns [mounted, leaving].
 */
export function usePresence(show: boolean, ms = 220): [boolean, boolean] {
  const [mounted, setMounted] = useState(show);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (show) {
      setMounted(true);
      setLeaving(false);
      return;
    }
    if (!mounted) return;
    if (reduced()) {
      setMounted(false);
      return;
    }
    setLeaving(true);
    const t = setTimeout(() => {
      setMounted(false);
      setLeaving(false);
    }, ms);
    return () => clearTimeout(t);
  }, [show]);
  return [mounted, leaving];
}

/**
 * Animates height between 0 and auto using the grid-rows trick. Children are
 * only rendered while open (or closing), so collapsed editors cost nothing.
 */
export function Collapse({ open, children, class: cls = '' }: { open: boolean; children: ComponentChildren; class?: string }) {
  const [mounted] = usePresence(open, 380);
  const [expanded, setExpanded] = useState(open);
  useEffect(() => {
    if (!open) {
      setExpanded(false);
      return;
    }
    // Let the collapsed state paint first, then expand.
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setExpanded(true)));
    return () => cancelAnimationFrame(id);
  }, [open]);
  if (!mounted) return null;
  return (
    <div class={`collapse ${expanded ? 'is-open' : ''} ${cls}`} aria-hidden={!open}>
      <div class="collapse-inner">{children}</div>
    </div>
  );
}

/**
 * Positions an absolutely placed "thumb" over the active child of a container,
 * and follows it when the selection or the layout changes.
 */
export function useThumb(container: RefObject<HTMLElement | null>, selector: string, deps: unknown[]) {
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const first = useRef(true);
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const el = container.current;
    if (!el) return;
    const measure = () => {
      const active = el.querySelector<HTMLElement>(selector);
      if (!active) return setRect(null);
      setRect({ x: active.offsetLeft, y: active.offsetTop, w: active.offsetWidth, h: active.offsetHeight });
    };
    measure();
    // Skip the slide on first paint so the thumb doesn't fly in from the corner.
    if (first.current) {
      first.current = false;
      requestAnimationFrame(() => setAnimate(true));
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, deps);

  return { rect, animate };
}

/** Tweens a number towards its new value. */
export function AnimatedNumber({ value, format = (n: number) => String(Math.round(n)) }: { value: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduced() || from.current === value) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    const duration = 420;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setShown(a + (value - a) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value]);
  return <>{format(shown)}</>;
}

/** Adds a class while the page is scrolled, for the header shadow. */
export function useScrolled(threshold = 4): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > threshold);
    on();
    addEventListener('scroll', on, { passive: true });
    return () => removeEventListener('scroll', on);
  }, []);
  return scrolled;
}
