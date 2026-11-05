import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  Loader2,
  GraduationCap,
  Trophy,
  Medal,
  Award,
  BookOpen,
  ShieldCheck,
  LogOut,
  Mail,
  MessageCircle,
  ArrowLeft,
  User,
  ChevronDown,
  Check,
  CheckCircle2,
  BarChart3,
  Clock,
} from "lucide-react";
import {
  getPortal,
  getOverallLeaderboard,
  getPortalDashboard,
  portalIdentifyRequest,
  portalIdentifyVerify,
  portalCompleteProfile,
  portalEnterCourse,
  getMyCertificates,
  type PortalData,
  type OverallLeaderboardEntry,
  type PortalDashboard,
  type PortalCertificate,
  type CourseEnrollmentField,
} from "@/services/cursos";
import { CourseRunner, type RunnerView } from "./CourseRunner";
import { CertificateActions, CertificateCanvas, CertificateModal } from "./CertificateCanvas";
import { PhonePortalInput } from "./PhonePortalInput";
import { OtpInput } from "./OtpInput";

const PRIMARY = "#0f766e";
const ON_PRIMARY = "#ffffff";
const BACKGROUND = "#f8fafc";
const RADIUS_PX: Record<string, string> = { sm: "6px", md: "10px", lg: "14px", xl: "20px" };
// Altura del logo (px). Rango del slider y default.
const LOGO_MIN = 24;
const LOGO_MAX = 80;
const LOGO_DEFAULT = 44;
// Compatibilidad con valores antiguos ("sm"|"md"|"lg"|"xl").
const LEGACY_LOGO_PX: Record<string, number> = { sm: 32, md: 44, lg: 56, xl: 72 };
// Espacio vertical (padding Y) de la cabecera, en px.
const HEADER_PY_MIN = 0;
const HEADER_PY_MAX = 40;
const HEADER_PY_DEFAULT = 8;

/** Normaliza logoSize (número px o valor legacy) a una altura en px. */
function resolveLogoPx(raw: unknown): number {
  if (typeof raw === "number" && raw > 0) return Math.min(LOGO_MAX, Math.max(LOGO_MIN, raw));
  if (typeof raw === "string" && LEGACY_LOGO_PX[raw]) return LEGACY_LOGO_PX[raw];
  return LOGO_DEFAULT;
}

/** Resuelve el tema del portal con los valores por defecto. */
function resolveTheme(theme: PortalData["theme"] | undefined) {
  const t = theme || {};
  return {
    primary: t.primary || PRIMARY,
    onPrimary: t.onPrimary || ON_PRIMARY,
    background: t.background || BACKGROUND,
    radius: RADIUS_PX[t.radius || "xl"] || RADIUS_PX.xl,
    headerTitle: t.headerTitle?.trim() || "",
    headerSubtitle: t.headerSubtitle?.trim() || "",
    logoUrl: t.logoUrl?.trim() || "",
    // Altura del logo en px (desktop usa el valor; mobile un poco mayor).
    logoHeight: resolveLogoPx(t.logoSize),
    // Espacio vertical (padding arriba/abajo) de la cabecera, en px.
    headerPaddingY:
      typeof t.headerPaddingY === "number"
        ? Math.min(HEADER_PY_MAX, Math.max(HEADER_PY_MIN, t.headerPaddingY))
        : HEADER_PY_DEFAULT,
    // Por defecto se muestran los textos; solo se ocultan si es explícitamente false.
    showHeaderText: t.showHeaderText !== false,
  };
}

type ResolvedTheme = ReturnType<typeof resolveTheme>;

const RANK_ICON = [Trophy, Medal, Award];
const RANK_COLOR = ["text-yellow-500", "text-slate-400", "text-amber-700"];

const LEVEL_LABEL: Record<string, string> = {
  basic: "Básico",
  intermediate: "Medio",
  advanced: "Avanzado",
  expert: "Experto",
};

/** Formatea segundos a "Xh"/"Xh Ym" (>=1h) o "X min" (<1h). */
function formatDuration(totalSec: number): string {
  const totalMin = Math.round(totalSec / 60);
  if (totalMin < 60) return `${Math.max(1, totalMin)} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Chip de metadato del curso (icono + etiqueta). */
function Chip({ icon, label, className = "" }: { icon: React.ReactNode; label: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1.5 sm:px-2 sm:py-1 rounded-lg bg-slate-100 text-slate-600 text-xs sm:text-[11px] font-medium ${className}`}
    >
      {icon}
      {label}
    </span>
  );
}

/** Construye la URL de una vista del runner del curso. */
function runnerViewPath(tenantSlug: string, courseSlug: string, v: RunnerView): string {
  const base = `/academy/${tenantSlug}/curso/${courseSlug}`;
  switch (v.kind) {
    case "final":
      return `${base}/examen`;
    case "lesson":
      return `${base}/clase/${v.lessonId}`;
    case "lesson-quiz":
      return `${base}/clase/${v.lessonId}/evaluacion`;
    default:
      return base;
  }
}

function tokenKey(slug: string) {
  return `academy_pt_${slug}`;
}

type PortalTab = "courses" | "ranking" | "certs" | "profile";
const PORTAL_TABS: PortalTab[] = ["courses", "ranking", "certs", "profile"];
// Cursos y ranking son públicos; certificados y perfil requieren identidad.
const AUTH_TABS: PortalTab[] = ["certs", "profile"];

export function AcademyPortal() {
  const { tenantSlug, "*": rest } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<PortalData | null>(null);
  const [leaderboard, setLeaderboard] = useState<OverallLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // TODA la navegación del portal vive en la URL (splat tras /academy/:slug)
  // para que al recargar nunca se pierda la vista. Segmentos posibles:
  //   ""|courses|ranking|certs|profile                       → pestañas
  //   curso/:courseSlug                                      → portada del curso
  //   curso/:courseSlug/clase/:lessonId                      → clase
  //   curso/:courseSlug/clase/:lessonId/evaluacion           → evaluación de la clase
  //   curso/:courseSlug/examen                               → examen final
  const segments = (rest || "").split("/").filter(Boolean);
  const inCourse = segments[0] === "curso" && !!segments[1];
  const courseSlug = inCourse ? segments[1] : null;
  const tab: PortalTab = PORTAL_TABS.includes(segments[0] as PortalTab)
    ? (segments[0] as PortalTab)
    : "courses";

  // Vista dentro del curso derivada de la URL.
  const runnerView: RunnerView = (() => {
    if (!inCourse) return { kind: "list" };
    if (segments[2] === "examen") return { kind: "final" };
    if (segments[2] === "clase" && segments[3]) {
      return segments[4] === "evaluacion"
        ? { kind: "lesson-quiz", lessonId: segments[3] }
        : { kind: "lesson", lessonId: segments[3] };
    }
    return { kind: "list" };
  })();

  const coursePath = (slug: string) => `/academy/${tenantSlug}/curso/${slug}`;
  const goTab = (t: PortalTab) => {
    const nav = () => navigate(`/academy/${tenantSlug}/${t}`);
    if (AUTH_TABS.includes(t)) requireAuth(nav);
    else nav();
  };

  const [portalToken, setPortalToken] = useState<string | null>(
    () => (tenantSlug ? localStorage.getItem(tokenKey(tenantSlug)) : null),
  );
  const [dashboard, setDashboard] = useState<PortalDashboard | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [entering, setEntering] = useState<string | null>(null);
  // accessToken del curso activo (re-emitido al abrir/recargar). La "vista" del
  // curso y la clase viven en la URL, no en estado.
  const [courseAccess, setCourseAccess] = useState<{ slug: string; accessToken: string } | null>(null);
  const [courseAccessError, setCourseAccessError] = useState(false);
  // Certificados del participante (se cargan al abrir la pestaña "certs").
  const [certificates, setCertificates] = useState<PortalCertificate[] | null>(null);
  // Modal de verificación: visible y acción pendiente a ejecutar tras loguearse.
  const [authModal, setAuthModal] = useState(false);
  const pendingAction = useRef<(() => void) | null>(null);

  // Cargar datos del portal.
  useEffect(() => {
    if (!tenantSlug) return;
    Promise.all([getPortal(tenantSlug), getOverallLeaderboard(tenantSlug)])
      .then(([p, lb]) => {
        setData(p);
        setLeaderboard(lb.entries);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [tenantSlug]);

  // Validar sesión (si hay token, cargar dashboard; si falla, descartarlo).
  useEffect(() => {
    if (!tenantSlug) return;
    if (!portalToken) {
      setSessionChecked(true);
      return;
    }
    getPortalDashboard(tenantSlug, portalToken)
      .then(setDashboard)
      .catch(() => {
        localStorage.removeItem(tokenKey(tenantSlug));
        setPortalToken(null);
        setDashboard(null);
      })
      .finally(() => setSessionChecked(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portalToken, tenantSlug]);

  const refreshDashboard = () => {
    if (tenantSlug && portalToken) getPortalDashboard(tenantSlug, portalToken).then(setDashboard).catch(() => {});
  };

  /**
   * Ejecuta `action` si hay sesión; si no, guarda la acción como pendiente y
   * abre el modal de verificación. Tras identificarse, la acción se ejecuta.
   */
  const requireAuth = (action: () => void) => {
    if (portalToken && dashboard) {
      action();
    } else {
      pendingAction.current = action;
      setAuthModal(true);
    }
  };

  // Cargar certificados al abrir la pestaña (una vez por sesión de token).
  useEffect(() => {
    if (tab !== "certs" || !tenantSlug || !portalToken || certificates !== null) return;
    getMyCertificates(tenantSlug, portalToken)
      .then((r) => setCertificates(r.certificates))
      .catch(() => setCertificates([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, tenantSlug, portalToken]);

  const onIdentified = (tk: string) => {
    if (!tenantSlug) return;
    localStorage.setItem(tokenKey(tenantSlug), tk);
    setPortalToken(tk);
  };

  // Al completar la verificación (dashboard ya cargado), cerramos el modal y
  // ejecutamos la acción que el usuario intentaba realizar.
  useEffect(() => {
    if (portalToken && dashboard && authModal) {
      setAuthModal(false);
      const action = pendingAction.current;
      pendingAction.current = null;
      action?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portalToken, dashboard]);

  // Deep-link a una pestaña que requiere identidad sin sesión → pedir login.
  useEffect(() => {
    if (sessionChecked && !inCourse && AUTH_TABS.includes(tab) && (!portalToken || !dashboard)) {
      setAuthModal(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionChecked, inCourse, tab, portalToken, dashboard]);

  const logout = () => {
    if (!tenantSlug) return;
    localStorage.removeItem(tokenKey(tenantSlug));
    setPortalToken(null);
    setDashboard(null);
    setCertificates(null);
    navigate(`/academy/${tenantSlug}`);
  };

  // Abrir un curso = navegar a su URL. Requiere identidad; si no hay sesión se
  // abre el modal y, tras verificar, se entra al curso. El accessToken se obtiene
  // en el efecto de abajo (igual al abrir que al recargar en una URL de curso).
  const enterCourse = (courseId: string, slug: string | null) => {
    if (!slug) return;
    requireAuth(() => {
      navigate(coursePath(slug));
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  const exitCourse = () => {
    navigate(`/academy/${tenantSlug}/courses`);
    refreshDashboard();
  };

  // Re-emite el accessToken del curso cuando cambia el curso de la URL (al
  // abrirlo o al recargar sobre una URL de curso). Resuelve el slug→courseId con
  // el dashboard/portal data.
  useEffect(() => {
    if (!inCourse || !courseSlug) {
      setCourseAccess(null);
      setCourseAccessError(false);
      return;
    }
    // Ya tenemos token válido para este curso.
    if (courseAccess?.slug === courseSlug) return;
    // Deep-link a un curso sin sesión: pedir identidad (y quedarse en la URL).
    if (sessionChecked && (!portalToken || !dashboard)) {
      setAuthModal(true);
      return;
    }
    if (!tenantSlug || !portalToken || !dashboard) return;

    const fromDash = dashboard.courses.find((c) => c.courseSlug === courseSlug);
    const fromData = data?.courses.find((c) => c.slug === courseSlug);
    const courseId = fromDash?.courseId || fromData?.id;
    if (!courseId) {
      setCourseAccessError(true);
      return;
    }
    setCourseAccessError(false);
    setEntering(courseId);
    portalEnterCourse(tenantSlug, portalToken, courseId)
      .then((res) => setCourseAccess({ slug: courseSlug, accessToken: res.accessToken }))
      .catch(() => setCourseAccessError(true))
      .finally(() => setEntering(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inCourse, courseSlug, tenantSlug, portalToken, dashboard, data, sessionChecked]);

  if (loading || (portalToken && !sessionChecked)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-center px-6">
        <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
          <GraduationCap className="h-6 w-6 text-slate-400" />
        </div>
        <h1 className="text-lg font-semibold text-slate-800">Portal no disponible</h1>
        <p className="text-sm text-slate-500 mt-1">El enlace no es válido o no hay cursos publicados.</p>
      </div>
    );
  }

  // El portal es navegable sin sesión. Las acciones que requieren identidad
  // (entrar a un curso, ver certificados/perfil) abren el modal de verificación.
  const authed = !!portalToken && !!dashboard;

  const participantName =
    dashboard?.participant?.name || dashboard?.participant?.email || dashboard?.participant?.phone || "Participante";

  const theme = resolveTheme(data.theme);
  const brandName = theme.headerTitle || data.tenant.name;
  const brandSubtitle = theme.headerSubtitle || "Academy";

  const overallRank = dashboard?.summary.overallRank ?? null;

  return (
    <div className="min-h-screen" style={{ backgroundColor: theme.background }}>
      {/* ───── Header desktop/tablet: marca + avatar, con fondo del tema ───── */}
      <header
        className="hidden sm:block border-b border-white/10"
        style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
      >
        <div
          className="max-w-4xl mx-auto px-6 flex items-center justify-between"
          style={{ paddingTop: theme.headerPaddingY, paddingBottom: theme.headerPaddingY }}
        >
          {/* Izquierda: marca o volver */}
          {inCourse ? (
            <button
              onClick={exitCourse}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-sm font-medium transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Volver a cursos
            </button>
          ) : (
            <div className="flex items-center gap-2.5 min-w-0">
              {theme.logoUrl ? (
                <img
                  src={theme.logoUrl}
                  alt=""
                  className="w-auto object-contain shrink-0"
                  style={{ height: theme.logoHeight }}
                />
              ) : (
                <div className="h-9 w-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                  <GraduationCap className="h-5 w-5" />
                </div>
              )}
              {theme.showHeaderText && (
                <div className="min-w-0">
                  <p className="text-[11px] font-medium leading-none opacity-60">{brandSubtitle}</p>
                  <h1 className="text-base font-bold leading-tight truncate">{brandName}</h1>
                </div>
              )}
            </div>
          )}

          {/* Derecha: avatar (con sesión) o botón de iniciar sesión. */}
          {authed ? (
            <AvatarMenu
              name={participantName}
              primary={theme.primary}
              onRanking={() => goTab("ranking")}
              onCertificates={() => goTab("certs")}
              onCourses={() => goTab("courses")}
              onProfile={() => goTab("profile")}
              onLogout={logout}
            />
          ) : (
            <button
              onClick={() => requireAuth(() => goTab("profile"))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-sm font-medium transition-colors"
            >
              <ShieldCheck className="h-4 w-4" /> Iniciar sesión
            </button>
          )}
        </div>
      </header>

      {/* ───── Header mobile: sin fondo, solo logo (sin textos) + ranking ─────
          No es fijo: hace scroll con el contenido. Oculto dentro de un curso:
          ahí el botón de volver flota sobre la portada del curso. */}
      {!inCourse && (
        <header
          className="sm:hidden px-4"
          style={{ paddingTop: theme.headerPaddingY + 4, paddingBottom: theme.headerPaddingY }}
        >
          <div className="flex items-center justify-between min-h-0">
            {theme.logoUrl ? (
              <img
                src={theme.logoUrl}
                alt=""
                className="w-auto max-w-[60%] object-contain shrink-0 block"
                style={{ height: theme.logoHeight }}
              />
            ) : (
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center text-white shrink-0"
                style={{ backgroundColor: theme.primary }}
              >
                <GraduationCap className="h-5 w-5" />
              </div>
            )}

            {/* Derecha: puntaje de ranking del participante. */}
            {overallRank != null && (
              <button
                onClick={() => goTab("ranking")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white shadow-sm ring-1 ring-slate-900/5"
              >
                <Trophy className="h-4 w-4" style={{ color: theme.primary }} />
                <span className="text-sm font-bold text-slate-900">#{overallRank}</span>
              </button>
            )}
          </div>
        </header>
      )}

      {inCourse ? (
        // En mobile: contenido con padding lateral. Las vistas con contenido a
        // sangre arriba (portada del curso y detalle de clase) van con pt-0; las
        // evaluaciones (examen / quiz de clase) llevan margen superior para que
        // la card no quede pegada al borde.
        <main
          className={`max-w-4xl mx-auto px-4 sm:px-6 sm:pt-5 pb-16 max-sm:pb-36 ${
            runnerView.kind === "final" || runnerView.kind === "lesson-quiz" ? "pt-4" : "pt-0"
          }`}
        >
          <div className="sm:bg-white sm:rounded-2xl sm:shadow-sm sm:ring-1 sm:ring-slate-900/5 sm:p-6">
            {courseAccessError ? (
              <div className="text-center py-16">
                <GraduationCap className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-600">No se pudo abrir el curso.</p>
                <button onClick={exitCourse} className="mt-3 text-sm font-medium" style={{ color: theme.primary }}>
                  Volver a cursos
                </button>
              </div>
            ) : courseAccess?.slug === courseSlug ? (
              <CourseRunner
                key={courseAccess.slug}
                slug={courseAccess.slug}
                accessToken={courseAccess.accessToken}
                embedded
                themePrimary={theme.primary}
                themeOnPrimary={theme.onPrimary}
                view={runnerView}
                onBack={exitCourse}
                onNavigate={(v) => navigate(runnerViewPath(tenantSlug!, courseSlug!, v))}
              />
            ) : (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            )}
          </div>
        </main>
      ) : (
        <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-3 sm:pt-5 pb-16 max-sm:pb-36">
          <>
            {/* Tabs horizontales: solo en desktop/tablet. En mobile se usa el bottom nav. */}
            <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-900/5 p-1.5 hidden sm:inline-flex gap-1 mb-5">
              <TabButton active={tab === "courses"} onClick={() => goTab("courses")} icon={BookOpen} label="Cursos" primary={theme.primary} />
              <TabButton active={tab === "ranking"} onClick={() => goTab("ranking")} icon={Trophy} label="Ranking general" primary={theme.primary} />
              <TabButton active={tab === "certs"} onClick={() => goTab("certs")} icon={Award} label="Certificados" primary={theme.primary} />
              <TabButton active={tab === "profile"} onClick={() => goTab("profile")} icon={User} label="Perfil" primary={theme.primary} />
            </div>

            {/* Transición animada entre pestañas. */}
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              >
                {tab === "courses" && (
                  <CoursesGrid
                    data={data}
                    entering={entering}
                    onEnter={enterCourse}
                    primary={theme.primary}
                    statusByCourse={
                      new Map((dashboard?.courses ?? []).map((c) => [c.courseId, { status: c.status, rank: c.rank }]))
                    }
                  />
                )}
                {tab === "ranking" && (
                  <OverallRanking entries={leaderboard} myRecordId={dashboard?.participant?.recordId} primary={theme.primary} />
                )}
                {tab === "certs" && authed && <CertificatesView certificates={certificates} primary={theme.primary} />}
                {tab === "profile" && authed && dashboard && (
                  <ProfileView dashboard={dashboard} primary={theme.primary} onLogout={logout} />
                )}
              </motion.div>
            </AnimatePresence>
          </>
        </main>
      )}

      {/* Bottom nav (solo mobile y fuera del runner de curso). */}
      {!inCourse && (
        <BottomNav
          tab={tab}
          primary={theme.primary}
          onCourses={() => goTab("courses")}
          onRanking={() => goTab("ranking")}
          onCertificates={() => goTab("certs")}
          onProfile={() => goTab("profile")}
        />
      )}

      {/* Modal de verificación (identidad) con animación de aparición. */}
      <IdentifyModal
        open={authModal}
        tenantName={brandName}
        theme={theme}
        channel={data.verification.channel}
        tenantSlug={tenantSlug!}
        portalToken={portalToken}
        onClose={() => {
          setAuthModal(false);
          pendingAction.current = null;
          // Si cerró el modal estando en una URL de curso sin sesión, lo
          // devolvemos a la lista pública para que no quede en un spinner.
          if (inCourse && !authed) navigate(`/academy/${tenantSlug}/courses`);
        }}
        onIdentified={onIdentified}
        onReady={refreshDashboard}
      />
    </div>
  );
}

/** Modal de verificación de identidad con animación de entrada elegante. */
function IdentifyModal({
  open,
  tenantName,
  theme,
  channel,
  tenantSlug,
  portalToken,
  onClose,
  onIdentified,
  onReady,
}: {
  open: boolean;
  tenantName: string;
  theme: ResolvedTheme;
  channel: "email" | "phone" | "both";
  tenantSlug: string;
  portalToken: string | null;
  onClose: () => void;
  onIdentified: (tk: string) => void;
  onReady: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          initial="hidden"
          animate="visible"
          exit="hidden"
        >
          {/* Backdrop con blur y fundido. */}
          <motion.div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onClick={onClose}
          />
          {/* Tarjeta: entra con escala + leve subida y un resorte suave. */}
          <motion.div
            className="relative w-full max-w-md"
            variants={{
              hidden: { opacity: 0, scale: 0.92, y: 24 },
              visible: { opacity: 1, scale: 1, y: 0 },
            }}
            transition={{ type: "spring", stiffness: 320, damping: 26, mass: 0.9 }}
          >
            <div className="relative bg-white rounded-3xl shadow-2xl ring-1 ring-black/5 overflow-hidden">
              {/* Franja de marca superior. */}
              <div
                className="h-1.5 w-full"
                style={{ background: `linear-gradient(90deg, ${theme.primary}, ${theme.primary}99)` }}
              />
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="absolute top-3 right-3 z-10 h-8 w-8 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
              <div className="p-6 sm:p-7">
                {!theme.logoUrl && (
                  <p className="text-[11px] font-medium text-slate-400 text-center mb-4 truncate">{tenantName}</p>
                )}
                <IdentifyFlow
                  channel={channel}
                  tenantSlug={tenantSlug}
                  portalToken={portalToken}
                  primary={theme.primary}
                  logoUrl={theme.logoUrl}
                  onIdentified={onIdentified}
                  onReady={onReady}
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Barra de navegación inferior para mobile. */
function BottomNav({
  tab,
  primary,
  onCourses,
  onRanking,
  onCertificates,
  onProfile,
}: {
  tab: PortalTab;
  primary: string;
  onCourses: () => void;
  onRanking: () => void;
  onCertificates: () => void;
  onProfile: () => void;
}) {
  const item = (active: boolean, icon: typeof BookOpen, label: string, onClick: () => void) => {
    const Icon = icon;
    return (
      <button
        onClick={onClick}
        className="flex-1 flex flex-col items-center justify-center gap-1.5 py-3 min-w-0 transition-colors"
        style={active ? { color: primary } : undefined}
      >
        <Icon className={`h-7 w-7 ${active ? "" : "text-slate-400"}`} />
        <span className={`text-xs font-semibold leading-none truncate max-w-full ${active ? "" : "text-slate-400"}`}>
          {label}
        </span>
      </button>
    );
  };

  return (
    <nav className="sm:hidden fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 pointer-events-none">
      <div className="pointer-events-auto max-w-md mx-auto flex items-stretch px-1 bg-white rounded-2xl border border-slate-200 shadow-[0_8px_30px_rgba(15,23,42,0.12)]">
        {item(tab === "courses", BookOpen, "Cursos", onCourses)}
        {item(tab === "ranking", Trophy, "Ranking", onRanking)}
        {item(tab === "certs", Award, "Certificados", onCertificates)}
        {item(tab === "profile", User, "Perfil", onProfile)}
      </div>
    </nav>
  );
}

/** Vista completa de perfil: datos del participante, resumen y cerrar sesión. */
/** Vista de certificados: lista de certificados emitidos al aprobar cursos. */
/** Vista de certificados: lista los certificados de cursos terminados. */
function CertificatesView({
  certificates,
  primary,
}: {
  certificates: PortalCertificate[] | null;
  primary: string;
}) {
  const [preview, setPreview] = useState<PortalCertificate | null>(null);

  if (certificates === null) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (certificates.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-900/5 p-10 text-center">
        <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
          <Award className="h-6 w-6 text-slate-400" />
        </div>
        <p className="text-sm font-medium text-slate-700">Aún no tienes certificados</p>
        <p className="text-xs text-slate-500 mt-1">
          Termina y aprueba un curso para obtener tu certificado de finalización.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {certificates.map((c) => (
          <div
            key={c.id}
            className="group rounded-2xl bg-white shadow-sm ring-1 ring-slate-900/5 hover:ring-slate-300 overflow-hidden transition-all"
          >
            {/* Vista previa real del certificado (clic para abrir en grande). */}
            <button
              type="button"
              onClick={() => setPreview(c)}
              className="relative block w-full p-3 bg-slate-100 text-left"
              aria-label={`Ver certificado de ${c.courseName}`}
            >
              <CertificateCanvas data={c} fallbackAccent={primary} printable={false} />
              <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/5 transition-colors" />
            </button>
            <div className="p-4 border-t border-slate-100 space-y-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{c.courseName}</p>
                <p className="text-xs text-slate-500 mt-0.5">Emitido el {formatCertDate(c.issuedAt)}</p>
              </div>
              {/* Acciones directas: compartir (izq.) · copiar enlace y descargar (der.) */}
              <CertificateActions
                data={c}
                fallbackAccent={primary}
                compact
                onRequestDownload={() => setPreview(c)}
              />
            </div>
          </div>
        ))}
      </div>

      {preview && (
        <CertificateModal data={preview} fallbackAccent={primary} onClose={() => setPreview(null)} />
      )}
    </>
  );
}

function formatCertDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es", { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return iso;
  }
}

/** Vista de perfil: datos del participante, resumen y cerrar sesión. */
function ProfileView({
  dashboard,
  primary,
  onLogout,
}: {
  dashboard: PortalDashboard;
  primary: string;
  onLogout: () => void;
}) {
  const p = dashboard.participant;
  const name = p?.name || p?.email || p?.phone || "Participante";
  const s = dashboard.summary;

  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="space-y-4">
      {/* Cabecera del perfil */}
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-900/5 p-5 flex items-center gap-4">
        <span
          className="h-14 w-14 rounded-2xl text-white text-lg font-bold flex items-center justify-center shrink-0"
          style={{ backgroundColor: primary }}
        >
          {initials || <User className="h-6 w-6" />}
        </span>
        <div className="min-w-0">
          <p className="text-base font-bold text-slate-900 truncate">{name}</p>
          <p className="text-xs text-slate-500">Participante</p>
        </div>
      </div>

      {/* Datos de contacto */}
      {(p?.email || p?.phone) && (
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-900/5 p-5 space-y-3">
          <p className="text-xs font-semibold text-slate-400 uppercase">Datos de contacto</p>
          {p?.email && (
            <div className="flex items-center gap-3 text-sm text-slate-700">
              <Mail className="h-4 w-4 text-slate-400 shrink-0" />
              <span className="truncate">{p.email}</span>
            </div>
          )}
          {p?.phone && (
            <div className="flex items-center gap-3 text-sm text-slate-700">
              <MessageCircle className="h-4 w-4 text-slate-400 shrink-0" />
              <span className="truncate">{p.phone}</span>
            </div>
          )}
        </div>
      )}

      {/* Resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Cursos inscritos" value={s.coursesEnrolled} />
        <Stat label="Completados" value={s.coursesCompleted} />
        <Stat label="Promedio" value={s.avgScore.toFixed(1)} />
        <Stat label="Puesto general" value={s.overallRank != null ? `#${s.overallRank}` : "—"} />
      </div>

      {/* Cerrar sesión */}
      <button
        onClick={onLogout}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white ring-1 ring-slate-900/5 shadow-sm text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors"
      >
        <LogOut className="h-4 w-4" />
        Cerrar sesión
      </button>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label, primary = PRIMARY }: { active: boolean; onClick: () => void; icon: typeof BookOpen; label: string; primary?: string }) {
  return (
    <button
      onClick={onClick}
      style={active ? { backgroundColor: primary, color: "#fff" } : undefined}
      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors ${
        active ? "" : "text-slate-500 hover:bg-slate-100"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function AvatarMenu({
  name,
  primary = PRIMARY,
  onRanking,
  onCertificates,
  onCourses,
  onProfile,
  onLogout,
}: {
  name: string;
  primary?: string;
  onRanking: () => void;
  onCertificates: () => void;
  onCourses: () => void;
  onProfile: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const item = (icon: React.ReactNode, label: string, action: () => void, danger?: boolean) => (
    <button
      onClick={() => {
        setOpen(false);
        action();
      }}
      className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left transition-colors ${
        danger ? "text-red-600 hover:bg-red-50" : "text-slate-700 hover:bg-slate-50"
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
      >
        <span className="h-8 w-8 rounded-full bg-white text-sm font-bold flex items-center justify-center" style={{ color: primary }}>
          {initials || <User className="h-4 w-4" />}
        </span>
        <span className="text-sm font-medium max-w-[9rem] truncate hidden sm:block">{name}</span>
        <ChevronDown className={`h-4 w-4 text-white/70 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white shadow-lg ring-1 ring-slate-900/10 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3 py-2 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-900 truncate">{name}</p>
            <p className="text-[11px] text-slate-400">Participante</p>
          </div>
          <div className="py-1">
            {item(<BookOpen className="h-4 w-4 text-slate-400" />, "Cursos", onCourses)}
            {item(<Trophy className="h-4 w-4 text-slate-400" />, "Ranking general", onRanking)}
            {item(<Award className="h-4 w-4 text-slate-400" />, "Certificados", onCertificates)}
            {item(<User className="h-4 w-4 text-slate-400" />, "Perfil", onProfile)}
          </div>
          <div className="border-t border-slate-100 pt-1">
            {item(<LogOut className="h-4 w-4" />, "Cerrar sesión", onLogout, true)}
          </div>
        </div>
      )}
    </div>
  );
}

function CoursesGrid({
  data,
  entering,
  onEnter,
  statusByCourse,
  primary: portalPrimary = PRIMARY,
}: {
  data: PortalData;
  entering: string | null;
  onEnter: (courseId: string, slug: string | null) => void;
  statusByCourse: Map<string, { status: string; rank: number | null }>;
  primary?: string;
}) {
  if (data.courses.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-900/5 p-10 text-center">
        <BookOpen className="h-8 w-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-600">Aún no hay cursos publicados.</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {data.courses.map((c) => {
        const primary = portalPrimary;
        const busy = entering === c.id;
        const st = statusByCourse.get(c.id);
        const approved = st?.status === "passed";
        const completed = st?.status === "completed"; // terminó pero no aprobó
        const inProgress = st?.status === "in_progress";
        return (
          <button
            key={c.id}
            onClick={() => onEnter(c.id, c.slug)}
            disabled={busy}
            className={`text-left group rounded-2xl bg-white shadow-sm ring-1 overflow-hidden transition-all disabled:opacity-60 ${
              approved ? "ring-green-300 hover:ring-green-400" : "ring-slate-900/5 hover:ring-slate-300"
            }`}
          >
            <div className="aspect-[16/9] relative" style={{ backgroundColor: primary }}>
              {c.coverUrl ? (
                <img src={c.coverUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center">
                  <GraduationCap className="h-8 w-8 text-white/40" />
                </div>
              )}
              {/* Distintivo de estado sobre la portada */}
              {approved && (
                <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-500 text-white text-xs sm:text-[10px] font-semibold shadow-md ring-1 ring-black/5">
                  <Award className="h-3.5 w-3.5 sm:h-3 sm:w-3" /> Aprobado
                </span>
              )}
              {!approved && completed && (
                <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500 text-white text-xs sm:text-[10px] font-semibold shadow-md ring-1 ring-black/5">
                  <CheckCircle2 className="h-3.5 w-3.5 sm:h-3 sm:w-3" /> Completado
                </span>
              )}
              {!approved && !completed && inProgress && (
                <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white text-slate-700 text-xs sm:text-[10px] font-semibold shadow-md ring-1 ring-black/5">
                  En progreso
                </span>
              )}
              {busy && (
                <div className="absolute inset-0 bg-slate-900/40 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                </div>
              )}
            </div>
            <div className="p-4">
              <div className="flex items-center gap-1.5">
                {approved && <CheckCircle2 className="h-5 w-5 sm:h-4 sm:w-4 text-green-500 shrink-0" />}
                <p className="text-base sm:text-sm font-semibold text-slate-900 truncate">{c.name}</p>
              </div>
              <p className="text-sm sm:text-xs text-slate-500 line-clamp-2 mt-1 sm:mt-0.5 min-h-[2.5rem] sm:min-h-[2rem]">
                {c.description || "Sin descripción"}
              </p>
              {/* Metadatos del curso en chips. */}
              <div className="flex flex-wrap items-center gap-1.5 mt-3">
                {c.level && (
                  <Chip icon={<BarChart3 className="h-3.5 w-3.5 sm:h-3 sm:w-3" />} label={LEVEL_LABEL[c.level]} />
                )}
                <Chip icon={<BookOpen className="h-3.5 w-3.5 sm:h-3 sm:w-3" />} label={`${c.lessons} ${c.lessons === 1 ? "clase" : "clases"}`} />
                {c.durationSec > 0 && (
                  <Chip icon={<Clock className="h-3.5 w-3.5 sm:h-3 sm:w-3" />} label={formatDuration(c.durationSec)} />
                )}
                {c.hasCertificate && (
                  <Chip icon={<Award className="h-3.5 w-3.5 sm:h-3 sm:w-3" />} label="Certificado" />
                )}
                {approved && st?.rank != null && (
                  <Chip
                    icon={<Trophy className="h-3.5 w-3.5 sm:h-3 sm:w-3 text-yellow-500" />}
                    label={`#${st.rank}`}
                    className="bg-green-50 text-green-700"
                  />
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function OverallRanking({ entries, myRecordId, primary = PRIMARY }: { entries: OverallLeaderboardEntry[]; myRecordId?: string; primary?: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-900/5 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <Trophy className="h-4 w-4 text-yellow-500" /> Ranking general
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">Promedio de calificaciones en todos los cursos.</p>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-10">Aún no hay resultados.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
            <tr>
              <th className="text-left px-5 py-2 font-medium w-14">#</th>
              <th className="text-left px-3 py-2 font-medium">Participante</th>
              <th className="text-right px-3 py-2 font-medium">Puntaje</th>
              <th className="text-right px-5 py-2 font-medium">Cursos</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const Icon = RANK_ICON[e.rank - 1];
              const mine = e.recordId === myRecordId;
              return (
                <tr key={e.recordId} className="border-t border-slate-100" style={mine ? { backgroundColor: `${primary}14` } : undefined}>
                  <td className="px-5 py-2.5">
                    {Icon ? <Icon className={`h-4 w-4 ${RANK_COLOR[e.rank - 1]}`} /> : <span className="text-slate-400">{e.rank}</span>}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-slate-800">
                    {e.participant}
                    {mine && <span className="ml-2 text-[10px] font-semibold" style={{ color: primary }}>(tú)</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-slate-900">{e.score.toFixed(1)}</td>
                  <td className="px-5 py-2.5 text-right text-slate-500">{e.coursesCompleted}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-900/5 p-4">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="text-xl font-bold text-slate-900 mt-0.5">{value}</p>
    </div>
  );
}

// ─────────── Flujo de identidad del portal (gate) ───────────

function IdentifyFlow({
  channel,
  tenantSlug,
  portalToken,
  primary = PRIMARY,
  logoUrl,
  onIdentified,
  onReady,
}: {
  channel: "email" | "phone" | "both";
  tenantSlug: string;
  portalToken: string | null;
  primary?: string;
  logoUrl?: string;
  onIdentified: (tk: string) => void;
  onReady: () => void;
}) {
  type Step = "destination" | "code" | "data";
  const [step, setStep] = useState<Step>("destination");
  const [pickedChannel, setPickedChannel] = useState<"email" | "phone">(channel === "phone" ? "phone" : "email");
  const [destination, setDestination] = useState("");
  // Número nacional (sin indicativo) para el input de teléfono.
  const [phoneNational, setPhoneNational] = useState("");
  const [otpId, setOtpId] = useState("");
  const [masked, setMasked] = useState("");
  const [code, setCode] = useState("");
  const [fields, setFields] = useState<CourseEnrollmentField[]>([]);
  const [formData, setFormData] = useState<Record<string, string>>({});
  // El token recién verificado se guarda en una ref para que `complete` no
  // dependa de que un setState asíncrono haya terminado (evita el race que
  // dejaba contactos sin datos cuando el estado aún no se había actualizado).
  const tkRef = useRef<string | null>(portalToken);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  // Segundos restantes para poder reenviar el código (cooldown anti-spam).
  const [resendIn, setResendIn] = useState(0);

  const canPick = channel === "both";

  // Cuenta regresiva del cooldown de reenvío.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const send = async () => {
    if (pickedChannel === "phone" ? phoneNational.trim().length < 4 : !destination.trim()) {
      toast.error(pickedChannel === "email" ? "Ingresa tu correo" : "Ingresa tu número de WhatsApp");
      return;
    }
    setBusy(true);
    try {
      const res = await portalIdentifyRequest(tenantSlug, pickedChannel, destination.trim());
      setOtpId(res.otpId);
      setMasked(res.maskedDestination);
      setStep("code");
      setResendIn(30);
      toast.success("Código enviado");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "No se pudo enviar el código");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (resendIn > 0 || resending) return;
    setResending(true);
    try {
      const res = await portalIdentifyRequest(tenantSlug, pickedChannel, destination.trim());
      setOtpId(res.otpId);
      setMasked(res.maskedDestination);
      setCode("");
      setResendIn(30);
      toast.success("Te enviamos un nuevo código");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "No se pudo reenviar el código");
    } finally {
      setResending(false);
    }
  };

  const verify = async (explicitCode?: string) => {
    const value = (explicitCode ?? code).trim();
    if (value.length < 6) {
      toast.error("Ingresa el código completo");
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const res = await portalIdentifyVerify(tenantSlug, otpId, value);
      tkRef.current = res.portalToken;
      if (res.needsData && res.fields.length > 0) {
        setFields(res.fields);
        setStep("data");
      } else {
        onIdentified(res.portalToken);
        onReady();
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Código incorrecto");
    } finally {
      setBusy(false);
    }
  };

  const complete = async () => {
    const missing = fields.find((f) => f.required && !String(formData[f.key] ?? "").trim());
    if (missing) {
      toast.error(`Completa: ${missing.label}`);
      return;
    }
    const token = tkRef.current;
    if (!token) {
      toast.error("Tu sesión expiró. Verifica de nuevo.");
      setStep("destination");
      return;
    }
    setBusy(true);
    try {
      await portalCompleteProfile(tenantSlug, token, formData);
      onIdentified(token);
      onReady();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "No se pudieron guardar tus datos");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {step === "destination" && (
        <>
          <GateHeader
            title="Verifica tu identidad"
            subtitle={
              <>
                Es rápido y seguro. Te enviaremos un{" "}
                <strong className="text-slate-700">código de verificación</strong> a tu{" "}
                <strong className="text-slate-700">
                  {pickedChannel === "email" ? "correo" : "WhatsApp"}
                </strong>
                . Ingrésalo en el siguiente paso y listo, entrarás al portal.
              </>
            }
            primary={primary}
            logoUrl={logoUrl}
          />
          {canPick && (
            <div className="grid grid-cols-2 gap-2">
              <Pill active={pickedChannel === "email"} onClick={() => setPickedChannel("email")} icon={Mail} label="Correo" primary={primary} />
              <Pill active={pickedChannel === "phone"} onClick={() => setPickedChannel("phone")} icon={MessageCircle} label="WhatsApp" primary={primary} />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              {pickedChannel === "email" ? "Tu correo electrónico" : "Tu número de WhatsApp"}
            </label>
            {pickedChannel === "email" ? (
              <GateInput
                type="email"
                inputMode="email"
                value={destination}
                onChange={setDestination}
                onEnter={send}
                placeholder="tucorreo@ejemplo.com"
              />
            ) : (
              <PhonePortalInput
                value={phoneNational}
                onChange={({ national, e164 }) => {
                  setPhoneNational(national);
                  setDestination(e164);
                }}
                onEnter={send}
                primary={primary}
              />
            )}
          </div>
          <GateButton busy={busy} onClick={send} primary={primary}>Enviar código</GateButton>
        </>
      )}

      {step === "code" && (
        <>
          <GateHeader
            title="Ingresa el código"
            subtitle={
              <>
                Enviamos un código de 6 dígitos a tu{" "}
                <strong className="text-slate-700">{pickedChannel === "email" ? "correo" : "WhatsApp"}</strong>{" "}
                <strong className="text-slate-700">{masked}</strong>. Escríbelo aquí para continuar.
              </>
            }
            primary={primary}
            logoUrl={logoUrl}
          />
          <OtpInput
            value={code}
            onChange={setCode}
            onComplete={(full) => verify(full)}
            length={6}
            primary={primary}
          />
          <GateButton busy={busy} onClick={() => verify()} primary={primary}>Verificar</GateButton>

          {/* Reenviar código con cooldown. */}
          <div className="text-center">
            {resendIn > 0 ? (
              <p className="text-xs text-slate-400">
                ¿No te llegó? Puedes reenviar en <span className="font-medium text-slate-500">{resendIn}s</span>
              </p>
            ) : (
              <button
                onClick={resend}
                disabled={resending}
                className="text-xs font-medium hover:underline disabled:opacity-50 inline-flex items-center gap-1"
                style={{ color: primary }}
              >
                {resending && <Loader2 className="h-3 w-3 animate-spin" />}
                ¿No te llegó? Reenviar código
              </button>
            )}
          </div>

          <button onClick={() => setStep("destination")} className="w-full text-xs text-slate-400 hover:text-slate-600">
            Cambiar {pickedChannel === "email" ? "correo" : "número"}
          </button>
        </>
      )}

      {step === "data" && (
        <>
          <GateHeader
            title="Últimos datos y entras"
            subtitle={
              <>
                Es tu primera vez aquí. Completa estos datos para crear tu perfil; solo te los pediremos{" "}
                <strong className="text-slate-700">una vez</strong>.
              </>
            }
            primary={primary}
            logoUrl={logoUrl}
          />
          <div className="space-y-3.5 text-left">
            {fields.map((f) => (
              <div key={f.key}>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">
                  {f.label}
                  {f.required && <span style={{ color: primary }}> *</span>}
                </label>
                {f.type === "select" && (f.options?.length ?? 0) > 0 ? (
                  <GateSelect
                    value={formData[f.key] ?? ""}
                    onChange={(v) => setFormData({ ...formData, [f.key]: v })}
                    options={f.options ?? []}
                    placeholder={`Selecciona ${f.label.toLowerCase()}`}
                    primary={primary}
                  />
                ) : (
                  <GateInput
                    type={f.type === "email" ? "email" : f.type === "date" ? "date" : "text"}
                    inputMode={f.type === "number" ? "numeric" : f.type === "phone" ? "tel" : undefined}
                    value={formData[f.key] ?? ""}
                    onChange={(v) => setFormData({ ...formData, [f.key]: v })}
                    placeholder={placeholderFor(f)}
                  />
                )}
              </div>
            ))}
          </div>
          <GateButton busy={busy} onClick={complete} primary={primary}>Entrar al portal</GateButton>
          <button onClick={() => setStep("destination")} className="w-full text-xs text-slate-400 hover:text-slate-600">
            Usar otro {pickedChannel === "email" ? "correo" : "número"}
          </button>
        </>
      )}
    </div>
  );
}

function GateHeader({
  title,
  subtitle,
  primary = PRIMARY,
  logoUrl,
}: {
  title: string;
  subtitle?: React.ReactNode;
  primary?: string;
  logoUrl?: string;
}) {
  return (
    <div className="text-center">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          className="h-14 w-auto max-w-[70%] object-contain mx-auto mb-3"
        />
      ) : (
        <div className="h-12 w-12 rounded-2xl flex items-center justify-center mx-auto mb-3 text-white" style={{ backgroundColor: primary }}>
          <ShieldCheck className="h-6 w-6" />
        </div>
      )}
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {subtitle && <p className="text-sm text-slate-500 mt-1 leading-relaxed">{subtitle}</p>}
    </div>
  );
}

function GateInput({
  value,
  onChange,
  onEnter,
  type = "text",
  inputMode,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
  type?: string;
  inputMode?: any;
  placeholder?: string;
}) {
  return (
    <input
      type={type}
      inputMode={inputMode}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && onEnter && onEnter()}
      className="w-full px-4 py-3.5 rounded-xl border border-slate-200 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
    />
  );
}

/** Desplegable personalizado (no nativo) con el estilo del formulario del portal. */
function GateSelect({
  value,
  onChange,
  options,
  placeholder,
  primary = PRIMARY,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  primary?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center justify-between w-full px-4 py-3.5 rounded-xl border bg-white text-base text-left transition-colors ${
          open ? "border-slate-400 ring-2 ring-slate-900/10" : "border-slate-200 hover:border-slate-300"
        } ${value ? "text-slate-900" : "text-slate-400"}`}
      >
        <span className="truncate">{value || placeholder || "Selecciona una opción"}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-20 mt-1.5 w-full rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="max-h-56 overflow-y-auto py-1">
            {options.map((o) => {
              const active = o === value;
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => {
                    onChange(o);
                    setOpen(false);
                  }}
                  className={`flex items-center justify-between gap-2 w-full px-4 py-2.5 text-left text-base transition-colors ${
                    active ? "bg-slate-50" : "hover:bg-slate-50"
                  }`}
                >
                  <span className="truncate text-slate-700">{o}</span>
                  {active && <Check className="h-4 w-4 shrink-0" style={{ color: primary }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Placeholder sugerido según el tipo de campo. */
function placeholderFor(f: CourseEnrollmentField): string | undefined {
  switch (f.type) {
    case "email":
      return "tucorreo@ejemplo.com";
    case "phone":
      return "+57 300 000 0000";
    case "number":
      return "0";
    default:
      return undefined;
  }
}

function GateButton({ busy, onClick, children, primary = PRIMARY }: { busy?: boolean; onClick: () => void; children: React.ReactNode; primary?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      style={{ backgroundColor: primary }}
      className="w-full py-3.5 rounded-xl text-white text-base font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2 shadow-sm hover:brightness-110 transition-all"
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

function Pill({ active, onClick, icon: Icon, label, primary = PRIMARY }: { active: boolean; onClick: () => void; icon: typeof Mail; label: string; primary?: string }) {
  return (
    <button
      onClick={onClick}
      style={active ? { borderColor: primary, color: primary } : undefined}
      className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border-2 transition-colors ${
        active ? "bg-slate-50" : "border-slate-200 text-slate-500 hover:bg-slate-50"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
