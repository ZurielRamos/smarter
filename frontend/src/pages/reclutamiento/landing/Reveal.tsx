import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";

/**
 * Animaciones de la landing: sutiles y sin dependencias. Aparición al entrar en
 * pantalla (desvanecer y subir unos píxeles), elevación suave en tarjetas y
 * botones, y despliegue suave de las respuestas. Con «reducir movimiento»
 * activado en el dispositivo todo se muestra de inmediato y sin transiciones.
 */
export const LANDING_MOTION_CSS = `
.lv-reveal{opacity:0;transform:translate3d(var(--lv-x,0px),var(--lv-y,18px),0) scale(var(--lv-s,1));transition:opacity .8s cubic-bezier(.22,.61,.36,1) var(--lv-d,0ms),transform .8s cubic-bezier(.22,.61,.36,1) var(--lv-d,0ms)}
.lv-reveal.lv-in{opacity:1;transform:none}
.lv-lift{transition:transform .3s cubic-bezier(.22,.61,.36,1),box-shadow .3s ease}
.lv-lift:hover{transform:translateY(-4px);box-shadow:0 14px 30px -14px rgba(0,0,0,.3)}
.lv-btn{transition:transform .2s ease,box-shadow .2s ease,opacity .2s ease}
.lv-btn:hover{transform:translateY(-1px);box-shadow:0 8px 20px -8px rgba(0,0,0,.4)}
.lv-btn:active{transform:translateY(0) scale(.98)}
.lv-img{transition:transform 1.2s cubic-bezier(.22,.61,.36,1)}
.lv-img-wrap:hover .lv-img{transform:scale(1.03)}
.lv-faq summary{transition:opacity .2s ease}
.lv-faq summary:hover{opacity:.75}
.lv-faq details[open]>p{animation:lv-fade .35s ease both}
@keyframes lv-fade{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){
.lv-reveal{opacity:1!important;transform:none!important;transition:none!important}
.lv-lift:hover,.lv-btn:hover,.lv-btn:active,.lv-img-wrap:hover .lv-img{transform:none!important}
.lv-faq details[open]>p{animation:none}
}
`;

interface RevealProps {
  children: ReactNode;
  /** Retraso en ms, para escalonar elementos hermanos. */
  delay?: number;
  /** Desplazamiento inicial en píxeles (por defecto sube 18 px). */
  x?: number;
  y?: number;
  /** Escala inicial (1 = sin cambio). */
  scale?: number;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
}

/** Muestra su contenido con una transición la primera vez que entra en pantalla. */
export function Reveal({ children, delay = 0, x = 0, y = 18, scale = 1, as: Tag = "div", className = "", style }: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(typeof IntersectionObserver === "undefined");

  useEffect(() => {
    if (shown) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -6% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);

  return (
    <Tag
      ref={ref}
      className={`lv-reveal ${shown ? "lv-in" : ""} ${className}`}
      style={{ ["--lv-d" as string]: `${delay}ms`, ["--lv-x" as string]: `${x}px`, ["--lv-y" as string]: `${y}px`, ["--lv-s" as string]: scale, ...style }}
    >
      {children}
    </Tag>
  );
}
