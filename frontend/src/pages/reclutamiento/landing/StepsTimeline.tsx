import { useLayoutEffect, useRef, useState } from "react";
import type { LandingItem } from "@/services/reclutamiento";
import type { LandingTheme } from "./landingTheme";

const CIRCLE = 36;
/** Punto de la ventana (de arriba abajo) en el que «llega» la línea al hacer scroll. */
const ANCHOR = 0.6;

/** Ancestro con scroll propio (en el editor, el panel de vista previa) o null si es la ventana. */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Pasos conectados por una línea que se va llenando con el scroll: cada paso se
 * activa (círculo relleno y texto visible) cuando la línea lo alcanza. Con
 * «reducir movimiento» activado en el dispositivo se muestra completa y quieta.
 */
export function StepsTimeline({ items, theme: t, fill }: { items: LandingItem[]; theme: LandingTheme; fill: (text: string) => string }) {
  const circles = useRef<Array<HTMLSpanElement | null>>([]);
  const list = useRef<HTMLOListElement>(null);
  const count = items.length;
  const [state, setState] = useState<{ reached: boolean[]; fills: number[] }>(() => ({
    reached: items.map(() => false),
    fills: items.map(() => 0),
  }));

  useLayoutEffect(() => {
    const ol = list.current;
    if (!ol) return;
    if (reducedMotion()) {
      setState({ reached: Array.from({ length: count }, () => true), fills: Array.from({ length: count }, () => 1) });
      return;
    }
    const parent = scrollParent(ol);
    let frame = 0;
    const measure = () => {
      frame = 0;
      const vp = parent ? parent.getBoundingClientRect() : { top: 0, height: window.innerHeight };
      const anchor = vp.top + vp.height * ANCHOR;
      const ys = circles.current.slice(0, count).map((c) => {
        const r = c?.getBoundingClientRect();
        return r ? r.top + r.height / 2 : Infinity;
      });
      const reached = ys.map((y) => anchor >= y);
      const fills = ys.map((y, i) => {
        const next = ys[i + 1];
        if (next === undefined || !Number.isFinite(next) || next === y) return 0;
        return Math.min(1, Math.max(0, (anchor - y) / (next - y)));
      });
      setState((prev) =>
        prev.reached.every((v, i) => v === reached[i]) && prev.fills.every((v, i) => Math.abs(v - fills[i]) < 0.005) ? prev : { reached, fills },
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    (parent ?? window).addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const ro = new ResizeObserver(schedule);
    ro.observe(ol);
    return () => {
      (parent ?? window).removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      ro.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [count]);

  return (
    <ol ref={list} className="mt-10">
      {items.map((item, i) => {
        const reached = state.reached[i] ?? false;
        const last = i === items.length - 1;
        return (
          <li key={i} className="relative flex gap-5" style={{ paddingBottom: last ? 0 : 40 }}>
            {!last && (
              <span aria-hidden="true" className="absolute overflow-hidden rounded-full" style={{ left: CIRCLE / 2 - 1, top: CIRCLE, bottom: 0, width: 2, backgroundColor: t.border }}>
                <span className="block w-full" style={{ height: `${(state.fills[i] ?? 0) * 100}%`, backgroundColor: t.primary, transition: "height 120ms linear" }} />
              </span>
            )}
            <span
              ref={(el) => {
                circles.current[i] = el;
              }}
              aria-hidden="true"
              className="relative z-[1] flex shrink-0 items-center justify-center rounded-full text-sm font-bold"
              style={{
                width: CIRCLE,
                height: CIRCLE,
                backgroundColor: reached ? t.primary : t.surface,
                color: reached ? t.onPrimary : t.muted,
                border: `2px solid ${reached ? t.primary : t.border}`,
                boxShadow: reached ? `0 0 0 4px ${t.soft}` : "none",
                transition: "background-color 400ms, color 400ms, border-color 400ms, box-shadow 400ms",
              }}
            >
              {i + 1}
            </span>
            <div
              className="pt-1"
              style={{ opacity: reached ? 1 : 0.4, transform: reached ? "none" : "translateY(8px)", transition: "opacity 500ms, transform 500ms" }}
            >
              {item.title && (
                <h3 className="text-base font-semibold" style={{ color: t.text }}>
                  {fill(item.title)}
                </h3>
              )}
              {item.text && (
                <p className="mt-0.5 whitespace-pre-line text-sm" style={{ color: t.muted }}>
                  {fill(item.text)}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
