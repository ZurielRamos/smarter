import type { ReactNode } from "react";
import headerBg from "@/assets/header-background.jpg";

interface Props {
  title: string;
  subtitle?: ReactNode;
  /** Controles a la izquierda del título (por ejemplo, el botón de volver). */
  leading?: ReactNode;
  /** Controles a la derecha. */
  children?: ReactNode;
}

/** Banda oscura con título y controles, como la de Contactos. */
export function EmpresasHeader({ title, subtitle, leading, children }: Props) {
  return (
    <div
      className="px-5 pt-3 pb-3 shrink-0 rounded-b-2xl"
      style={{ backgroundImage: `url(${headerBg})`, backgroundSize: "cover", backgroundPosition: "center" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {leading}
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold text-white">{title}</h1>
            {subtitle && <div className="text-brand-300 mt-0.5 text-sm">{subtitle}</div>}
          </div>
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </div>
  );
}
