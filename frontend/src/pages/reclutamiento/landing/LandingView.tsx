import type { CSSProperties, ReactNode } from "react";
import { Check, Mail, Phone } from "lucide-react";
import type { LandingConfig, LandingSectionId } from "@/services/reclutamiento";
import { presetBackground } from "./heroPresets";
import { getLandingIcon } from "./landingIcons";
import { LANDING_MOTION_CSS, Reveal } from "./Reveal";
import { StepsTimeline } from "./StepsTimeline";
import { buildTheme, resolveDark, useSystemDark } from "./landingTheme";

interface LandingViewProps {
  landing: LandingConfig;
  /** Nombre de la cuenta reclutadora (`{{empresa}}`). */
  tenantName: string;
  /** Solo en la landing de un proyecto: su nombre público (`{{proyecto}}`). */
  projectName?: string;
  /** Aviso bajo el botón principal cuando no se puede registrar nadie; por defecto, el de «solo por invitación». */
  closedNote?: string;
  /** Nombre del encabezado; por defecto el de la cuenta (en un proyecto, el del proyecto). */
  headerName?: string;
  /** Logo de la cuenta, si la landing no define uno propio. */
  fallbackLogoUrl?: string | null;
  /** Con el registro abierto el botón principal invita a registrarse; si no, a ingresar. */
  registrationOpen: boolean;
  onPrimary: () => void;
  onLogin: () => void;
  /** Fuerza claro u oscuro (la vista previa del editor); si falta, manda la apariencia de la landing. */
  modeOverride?: "light" | "dark";
  /** Ocupa al menos toda la altura de la ventana (página pública). */
  fullPage?: boolean;
}

const isHttpUrl = (url: string) => /^https?:\/\//i.test(url);

/**
 * Landing pública del portal. La usan la página pública y la vista previa del
 * editor. Todo el contenido es texto plano; nada se interpreta como HTML. Los
 * colores salen del tema derivado del color de marca y del modo claro u oscuro.
 */
export function LandingView({ landing, tenantName, projectName, headerName, closedNote, fallbackLogoUrl, registrationOpen, onPrimary, onLogin, modeOverride, fullPage }: LandingViewProps) {
  const { brand, content } = landing;
  const systemDark = useSystemDark();
  const dark = modeOverride ? modeOverride === "dark" : resolveDark(brand.appearance, systemDark);
  const t = buildTheme(brand.primaryColor, dark);
  const values: Record<string, string> = { empresa: tenantName, proyecto: projectName ?? tenantName };
  const fill = (text: string) => text.replace(/\{\{\s*(empresa|proyecto)\s*\}\}/gi, (_m, key: string) => values[key.toLowerCase()]);
  const shownName = headerName ?? projectName ?? tenantName;
  const logo = brand.logoUrl || fallbackLogoUrl || "";

  const solid: CSSProperties = { backgroundColor: t.primary, color: t.onPrimary };
  const sectionAlt: CSSProperties = { backgroundColor: t.alt };
  const sectionBase: CSSProperties = { backgroundColor: t.bg };
  const card: CSSProperties = { backgroundColor: t.surface, border: `1px solid ${t.border}` };

  const primaryButton = (label: string) => (
    <button
      type="button"
      onClick={onPrimary}
      style={solid}
      className="lv-btn rounded-xl px-6 py-3 text-sm font-semibold shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      {label}
    </button>
  );

  const heading = (text: string) => (
    <Reveal>
      <h2 className="text-2xl font-bold tracking-tight sm:text-3xl" style={{ color: t.text }}>
        {fill(text)}
      </h2>
    </Reveal>
  );
  const body = (text: string, extra = "") => (
    <p className={`whitespace-pre-line ${extra}`} style={{ color: t.muted }}>
      {fill(text)}
    </p>
  );

  const sections: Record<LandingSectionId, () => ReactNode> = {
    hero: () => {
      const h = content.hero;
      const hb = h.background;
      // Fondo: imagen subida (con oscurecimiento) o diseño generado. Sobre fondos oscuros el texto va claro.
      let heroStyle: CSSProperties = sectionAlt;
      let onDark = false;
      if (hb.type === "image" && hb.imageUrl) {
        const shade = `rgba(0,0,0,${hb.overlay / 100})`;
        heroStyle = {
          backgroundImage: `linear-gradient(${shade}, ${shade}), url("${hb.imageUrl.replace(/"/g, "%22")}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundColor: "#111827",
        };
        onDark = true;
      } else if (hb.type === "preset") {
        const p = presetBackground(hb.preset, t);
        if (p) {
          heroStyle = { background: p.background };
          onDark = p.tone === "dark";
        }
      }
      const titleColor = onDark ? "#ffffff" : t.text;
      const softColor = onDark ? "rgba(255,255,255,0.86)" : t.muted;
      const hasBg = heroStyle !== sectionAlt;
      return (
        <section key="hero" style={{ ...heroStyle, borderBottom: `1px solid ${t.border}` }}>
          <div className={`mx-auto grid max-w-5xl items-center gap-8 px-6 ${hasBg ? "py-20 sm:py-28" : "py-14 sm:py-20"} ${h.imageUrl ? "md:grid-cols-2" : ""}`}>
            <div className={h.imageUrl ? "" : "mx-auto max-w-2xl text-center"}>
              <Reveal>
                <h1 className="text-3xl font-bold tracking-tight sm:text-5xl" style={{ color: titleColor }}>
                  {fill(h.title)}
                </h1>
              </Reveal>
              {h.subtitle && (
                <Reveal delay={120}>
                  <p className="mt-4 whitespace-pre-line text-base sm:text-lg" style={{ color: softColor }}>
                    {fill(h.subtitle)}
                  </p>
                </Reveal>
              )}
              <Reveal delay={240} className="mt-7">
                {onDark ? (
                  <button
                    type="button"
                    onClick={onPrimary}
                    style={{ backgroundColor: "#ffffff", color: "#111827" }}
                    className="lv-btn rounded-xl px-6 py-3 text-sm font-semibold shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
                  >
                    {registrationOpen ? h.ctaLabel || "Quiero registrarme" : "Ingresar al portal"}
                  </button>
                ) : (
                  primaryButton(registrationOpen ? h.ctaLabel || "Quiero registrarme" : "Ingresar al portal")
                )}
              </Reveal>
              {!registrationOpen && (
                <Reveal delay={300}>
                  <p className="mt-3 text-xs" style={{ color: softColor }}>
                    {closedNote ?? "El acceso es solo por invitación."}
                  </p>
                </Reveal>
              )}
            </div>
            {h.imageUrl && (
              <Reveal delay={200} x={24} scale={0.97}>
                <div className="lv-img-wrap overflow-hidden rounded-2xl shadow-md">
                  <img src={h.imageUrl} alt="" loading="eager" className="lv-img max-h-96 w-full object-cover" />
                </div>
              </Reveal>
            )}
          </div>
        </section>
      );
    },
    about: () => {
      const a = content.about;
      if (!a.title && !a.body) return null;
      return (
        <section key="about" style={sectionBase}>
          <div className={`mx-auto grid max-w-5xl items-center gap-8 px-6 py-14 ${a.imageUrl ? "md:grid-cols-2" : ""}`}>
            <div className={a.imageUrl ? "" : "mx-auto max-w-2xl"}>
              {a.title && heading(a.title)}
              {a.body && <Reveal delay={100}>{body(a.body, "mt-4 text-base leading-relaxed")}</Reveal>}
            </div>
            {a.imageUrl && (
              <Reveal delay={150} x={24} scale={0.97}>
                <div className="lv-img-wrap overflow-hidden rounded-2xl shadow-md">
                  <img src={a.imageUrl} alt="" loading="lazy" className="lv-img max-h-96 w-full object-cover" />
                </div>
              </Reveal>
            )}
          </div>
        </section>
      );
    },
    benefits: () => {
      const items = content.benefits.items.filter((i) => i.title || i.text);
      if (items.length === 0) return null;
      return (
        <section key="benefits" style={sectionAlt}>
          <div className="mx-auto max-w-5xl px-6 py-14">
            <div className="text-center">{heading(content.benefits.title)}</div>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item, i) => {
                const Icon = getLandingIcon(item.icon);
                return (
                <Reveal as="li" key={i} delay={Math.min(i, 5) * 90}>
                <div className="lv-lift h-full rounded-2xl p-5 shadow-sm" style={card}>
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: t.soft }}>
                    <Icon className="h-4 w-4" style={{ color: t.accent }} aria-hidden="true" />
                  </span>
                  {item.title && (
                    <h3 className="mt-3 text-base font-semibold" style={{ color: t.text }}>
                      {fill(item.title)}
                    </h3>
                  )}
                  {item.text && body(item.text, "mt-1 text-sm")}
                </div>
                </Reveal>
                );
              })}
            </ul>
          </div>
        </section>
      );
    },
    steps: () => {
      const items = content.steps.items.filter((i) => i.title || i.text);
      if (items.length === 0) return null;
      return (
        <section key="steps" style={sectionBase}>
          <div className="mx-auto max-w-3xl px-6 py-14">
            <div className="text-center">{heading(content.steps.title)}</div>
            <StepsTimeline key={items.length} items={items} theme={t} fill={fill} />
          </div>
        </section>
      );
    },
    requirements: () => {
      const items = content.requirements.items.filter(Boolean);
      if (items.length === 0) return null;
      return (
        <section key="requirements" style={sectionAlt}>
          <div className="mx-auto max-w-3xl px-6 py-14">
            <div className="text-center">{heading(content.requirements.title)}</div>
            <ul className="mt-8 space-y-3">
              {items.map((item, i) => (
                <Reveal as="li" key={i} delay={Math.min(i, 6) * 70} x={-14} y={0}>
                  <div className="flex items-start gap-3 rounded-xl px-4 py-3 text-sm shadow-sm" style={{ ...card, color: t.text }}>
                    <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: t.accent }} aria-hidden="true" />
                    <span>{fill(item)}</span>
                  </div>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>
      );
    },
    faq: () => {
      const items = content.faq.items.filter((i) => i.question);
      if (items.length === 0) return null;
      return (
        <section key="faq" style={sectionBase}>
          <div className="mx-auto max-w-3xl px-6 py-14">
            <div className="text-center">{heading(content.faq.title)}</div>
            <Reveal delay={100} className="lv-faq mt-8 overflow-hidden rounded-2xl" style={card}>
              {items.map((item, i) => (
                <details key={i} className="px-5 py-4" style={i > 0 ? { borderTop: `1px solid ${t.border}` } : undefined}>
                  <summary className="cursor-pointer list-none text-sm font-semibold marker:hidden [&::-webkit-details-marker]:hidden" style={{ color: t.text }}>
                    {fill(item.question)}
                  </summary>
                  {item.answer && body(item.answer, "mt-2 text-sm")}
                </details>
              ))}
            </Reveal>
          </div>
        </section>
      );
    },
    cta: () => {
      const c = content.cta;
      return (
        <section key="cta" style={solid}>
          <div className="mx-auto max-w-3xl px-6 py-14 text-center">
            <Reveal>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{fill(c.title)}</h2>
            </Reveal>
            {c.text && (
              <Reveal delay={100}>
                <p className="mt-3 whitespace-pre-line text-base opacity-90">{fill(c.text)}</p>
              </Reveal>
            )}
            <Reveal delay={200} scale={0.96}>
            <button
              type="button"
              onClick={onPrimary}
              style={{ backgroundColor: t.onPrimary, color: t.onPrimary === "#ffffff" ? t.primary : "#ffffff" }}
              className="lv-btn mt-6 rounded-xl px-6 py-3 text-sm font-semibold shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
            >
              {registrationOpen ? c.buttonLabel || "Registrarme ahora" : "Ingresar al portal"}
            </button>
            </Reveal>
          </div>
        </section>
      );
    },
  };

  const f = content.footer;
  const links = f.links.filter((l) => isHttpUrl(l.url));
  const hasFooter = f.text || f.email || f.phone || links.length > 0;

  return (
    <div
      className={brand.font === "serif" ? "font-serif" : "font-sans"}
      style={{ backgroundColor: t.bg, color: t.text, colorScheme: dark ? "dark" : "light", minHeight: fullPage ? "100vh" : undefined }}
    >
      <style>{LANDING_MOTION_CSS}</style>
      <header className="sticky top-0 z-10 backdrop-blur" style={{ backgroundColor: `${t.bg}f2`, borderBottom: `1px solid ${t.border}` }}>
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-3">
          {logo && <img src={logo} alt="" className="h-8 w-auto max-w-[8rem] object-contain" />}
          {(brand.showName || !logo) && (
            <span className="truncate text-sm font-semibold" style={{ color: t.text }}>
              {shownName}
            </span>
          )}
          <button
            type="button"
            onClick={onLogin}
            className="lv-btn ml-auto rounded-lg px-3 py-1.5 text-xs font-medium"
            style={{ border: `1px solid ${t.border}`, color: t.text, backgroundColor: t.surface }}
          >
            Ingresar
          </button>
        </div>
      </header>
      {landing.sections.filter((s) => s.enabled).map((s) => sections[s.id]())}
      {hasFooter && (
        <footer style={{ ...sectionAlt, borderTop: `1px solid ${t.border}` }}>
          <Reveal y={8} className="mx-auto max-w-5xl space-y-3 px-6 py-8 text-sm" style={{ color: t.muted }}>
            {f.text && <p className="whitespace-pre-line">{fill(f.text)}</p>}
            {(f.email || f.phone) && (
              <div className="flex flex-wrap gap-x-5 gap-y-1">
                {f.email && (
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" aria-hidden="true" /> {f.email}
                  </span>
                )}
                {f.phone && (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" aria-hidden="true" /> {f.phone}
                  </span>
                )}
              </div>
            )}
            {links.length > 0 && (
              <div className="flex flex-wrap gap-x-5 gap-y-1">
                {links.map((l, i) => (
                  <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:opacity-80" style={{ color: t.accent }}>
                    {l.label || l.url}
                  </a>
                ))}
              </div>
            )}
          </Reveal>
        </footer>
      )}
    </div>
  );
}
