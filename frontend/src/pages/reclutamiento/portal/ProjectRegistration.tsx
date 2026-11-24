import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Mail, MessageCircle, ShieldCheck } from "lucide-react";
import { OtpInput } from "@/pages/cursos/OtpInput";
import { PhonePortalInput } from "@/pages/cursos/PhonePortalInput";
import { portalError, projectTokenKey, recruitPortalApi, type PortalInfo, type ProjectField } from "@/services/recruitPortal";
import type { FormQuestion } from "@/services/reclutamiento";
import { Field, inputClass, primaryButton } from "../shared";
import { formItems, resolveSteps } from "../formLayout";
import { FieldInput } from "./PortalSections";
import { isEmptyAnswer, type Answers } from "./answers";
import { QuestionFields } from "./QuestionFields";

type Channel = "email" | "phone";
type Phase = "form" | "code" | "done";
type Phone = { national: string; e164: string; dial?: string };
type Role = NonNullable<PortalInfo["project"]>["defaultRole"];

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Lo escrito se conserva en la pestaña si la persona recarga la página (se borra al terminar). */
interface DraftState {
  screen: number;
  fullName: string;
  channel: Channel;
  email: string;
  phone: Phone;
  otherEmail: string;
  otherPhone: Phone;
  values: Record<string, string>;
  answers: Answers;
  role: Role;
}

const draftKey = (slug: string, projectSlug: string) => `recruit-registration:${slug}:${projectSlug}`;

function loadDraft(key: string): Partial<DraftState> {
  try {
    const raw = sessionStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Una pantalla del asistente: sus datos personales y preguntas, ya resueltos. */
interface Screen {
  title: string;
  description: string;
  fields: ProjectField[];
  questions: FormQuestion[];
}

/**
 * Registro desde la landing de un proyecto, por pantallas: primero el perfil y
 * los datos de contacto, después las pantallas del formulario (organizadas en
 * el editor, a mano o con IA) y al final el código de verificación. Queda como
 * contacto de la cuenta y como prospecto del proyecto, con sesión solo en esta landing.
 */
export function ProjectRegistration({ slug, projectSlug, info, onSession }: { slug: string; projectSlug: string; info: PortalInfo; onSession: () => void }) {
  const project = info.project!;
  const questions = project.questions;
  const fields = project.fields;
  const open = info.registration.open;
  const storageKey = draftKey(slug, projectSlug);
  const saved = useMemo(() => loadDraft(storageKey), [storageKey]);
  const roles = project.roles ?? [];

  const [phase, setPhase] = useState<Phase>("form");
  const [screen, setScreen] = useState(saved.screen ?? 0);
  const [fullName, setFullName] = useState(saved.fullName ?? "");
  const [channel, setChannel] = useState<Channel>(info.verificationChannel === "both" ? saved.channel ?? "phone" : info.verificationChannel === "phone" ? "phone" : "email");
  const [email, setEmail] = useState(saved.email ?? "");
  const [phone, setPhone] = useState<Phone>(saved.phone ?? { national: "", e164: "" });
  const [otherEmail, setOtherEmail] = useState(saved.otherEmail ?? "");
  const [otherPhone, setOtherPhone] = useState<Phone>(saved.otherPhone ?? { national: "", e164: "" });
  const [values, setValues] = useState<Record<string, string>>(saved.values ?? {});
  const [answers, setAnswers] = useState<Answers>(saved.answers ?? {});
  const [role, setRole] = useState<Role>(saved.role && roles.some((r) => r.key === saved.role) ? saved.role : project.defaultRole);
  const picked = roles.find((r) => r.key === role);
  const [consent, setConsent] = useState(false);
  const [otp, setOtp] = useState<{ otpId: string; masked: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<"applied" | "existing" | "closed">("applied");
  const canPick = info.verificationChannel === "both";
  const topRef = useRef<HTMLDivElement>(null);

  // Pantallas del formulario después de la de contacto (el servidor ya las reconcilia).
  const screens: Screen[] = useMemo(() => {
    const steps = project.steps?.length ? project.steps : resolveSteps(null, formItems(fields, questions.map((q) => q.id)));
    const fieldBy = new Map(fields.map((f) => [`field:${f.key}`, f]));
    const questionBy = new Map(questions.map((q) => [`question:${q.id}`, q]));
    return steps
      .map((s) => ({
        title: s.title,
        description: s.description,
        fields: s.items.flatMap((it) => (fieldBy.has(it) ? [fieldBy.get(it)!] : [])),
        questions: s.items.flatMap((it) => (questionBy.has(it) ? [questionBy.get(it)!] : [])),
      }))
      .filter((s) => s.fields.length + s.questions.length > 0);
  }, [project.steps, fields, questions]);
  const total = screens.length + 1;
  const current = Math.min(screen, total - 1);
  const isLast = current === total - 1;

  useEffect(() => {
    if (phase !== "form") return;
    const draft: DraftState = { screen: current, fullName, channel, email, phone, otherEmail, otherPhone, values, answers, role };
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      /* sin almacenamiento: solo se pierde al recargar */
    }
  }, [phase, storageKey, current, fullName, channel, email, phone, otherEmail, otherPhone, values, answers, role]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  /** Qué falta en una pantalla (null si está completa). */
  const screenError = (i: number): string | null => {
    if (i === 0) {
      if (fullName.trim().length < 3) return "Escribe tu nombre completo";
      if (channel === "email" && !EMAIL_RE.test(email.trim())) return "Escribe un correo válido";
      if (channel === "phone" && phone.national.length < 4) return "Escribe tu número de WhatsApp";
      if (channel === "email" && otherPhone.national.length < 4) return "Escribe tu número de teléfono";
      if (channel === "phone" && otherEmail.trim() && !EMAIL_RE.test(otherEmail.trim())) return "Escribe un correo válido";
      return null;
    }
    const s = screens[i - 1];
    const missingField = s.fields.find((f) => f.required && !(values[f.key] ?? "").trim());
    if (missingField) return `Completa: «${missingField.label}»`;
    for (const q of s.questions) {
      const v = answers[q.id];
      if (q.required && isEmptyAnswer(v)) return `Responde: «${q.label}»`;
      if (q.type === "number" && !isEmptyAnswer(v)) {
        const n = Number(v);
        if (!Number.isFinite(n)) return `«${q.label}» debe ser un número`;
        if ((q.min !== null && n < q.min) || (q.max !== null && n > q.max)) return `«${q.label}» debe estar entre ${q.min ?? "−∞"} y ${q.max ?? "∞"}`;
      }
    }
    return null;
  };

  const goTo = (i: number) => {
    setError("");
    setScreen(i);
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const next = () => {
    const problem = screenError(current);
    if (problem) return setError(problem);
    if (isLast) return send();
    goTo(current + 1);
  };

  /** Si el servidor rechaza un dato concreto, se vuelve a la pantalla donde está. */
  const screenOfMessage = (message: string): number | null => {
    const name = /«([^»]+)»/.exec(message)?.[1];
    if (!name) return null;
    const i = screens.findIndex((s) => s.fields.some((f) => f.label === name) || s.questions.some((q) => q.label === name));
    return i === -1 ? null : i + 1;
  };

  const send = async () => {
    setError("");
    for (let i = 0; i < total; i++) {
      const problem = screenError(i);
      if (problem) {
        goTo(i);
        return setError(problem);
      }
    }
    if (!consent) return setError("Debes aceptar el tratamiento de tus datos para registrarte");
    setBusy(true);
    try {
      const res = await recruitPortalApi.requestProjectRegistration(slug, projectSlug, {
        fullName: fullName.trim(),
        channel,
        destination: channel === "email" ? email.trim() : phone.e164,
        ...(channel === "email" ? { phone: otherPhone.e164 } : otherEmail.trim() ? { email: otherEmail.trim() } : {}),
        consent,
        values,
        answers,
        role,
      });
      setOtp({ otpId: res.otpId, masked: res.maskedDestination });
      setCode("");
      setPhase("code");
      setResendIn(30);
    } catch (err) {
      const message = portalError(err, "No se pudo enviar el código");
      const at = screenOfMessage(message);
      if (at !== null) goTo(at);
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value: string) => {
    if (busy || !otp || value.length < 6) return;
    setError("");
    setBusy(true);
    try {
      const res = await recruitPortalApi.verifyProjectRegistration(slug, projectSlug, otp.otpId, value);
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        /* nada que borrar */
      }
      // La sesión queda guardada solo para esta landing.
      if (res.sessionToken) {
        localStorage.setItem(projectTokenKey(slug, projectSlug), res.sessionToken);
        onSession();
      }
      setOutcome(res.status);
      setPhase("done");
    } catch (err) {
      setError(portalError(err, "Código incorrecto"));
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  if (phase === "done") {
    const closed = outcome === "closed";
    return (
      <div className="mx-auto w-full max-w-md space-y-3 rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">{closed ? "El registro ya cerró" : outcome === "existing" ? "Ya estabas registrado" : "Recibimos tu registro"}</h1>
        <p className="text-sm text-muted-foreground">
          {closed
            ? `${project.name} dejó de recibir registros mientras verificabas tu código.`
            : outcome === "existing"
              ? `Ya teníamos tu registro en ${project.name}. No tienes que hacer nada más.`
              : `Gracias por registrarte en ${project.name}. ${info.tenant.name} te contactará.`}
        </p>
      </div>
    );
  }

  const destinationLabel = channel === "email" ? "correo" : "WhatsApp";
  const screenTitle = current === 0 ? "Tus datos de contacto" : screens[current - 1].title;
  const screenDescription =
    current === 0
      ? `Verificaremos tu ${destinationLabel} con un código al final. Podrás volver a ingresar con un código para ver tu estado.`
      : screens[current - 1].description;

  return (
    <div ref={topRef} className="mx-auto w-full max-w-md scroll-mt-4 rounded-2xl border border-border bg-card shadow-sm">
      <div className="px-6 pt-6 text-center">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-700/30 dark:text-brand-100">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">{`Regístrate en ${project.name}`}</h1>
      </div>

      {!open ? (
        <p role="status" className="m-6 rounded-lg bg-amber-50 px-3 py-2 text-center text-xs text-amber-900 dark:bg-amber-500/15 dark:text-amber-100">
          Por ahora este proyecto no recibe registros.
        </p>
      ) : phase === "code" ? (
        <div className="space-y-4 p-6">
          <p className="text-center text-sm text-muted-foreground">Escribe el código de 6 dígitos que enviamos a {otp?.masked}.</p>
          <OtpInput value={code} onChange={setCode} onComplete={verify} />
          {error && <p role="alert" className="text-center text-xs text-rose-600 dark:text-rose-400">{error}</p>}
          <button type="button" onClick={() => verify(code)} disabled={busy || code.length < 6} className={`${primaryButton} w-full justify-center py-2.5 text-sm`}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Confirmar
          </button>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <button type="button" onClick={() => { setPhase("form"); setError(""); }} className="hover:text-foreground">Cambiar datos</button>
            <button type="button" onClick={send} disabled={resendIn > 0 || busy} className="hover:text-foreground disabled:opacity-50">
              {resendIn > 0 ? `Reenviar en ${resendIn} s` : "Reenviar código"}
            </button>
          </div>
        </div>
      ) : (
        <div className="p-6 pt-4">
          {total > 1 && (
            <div className="mb-4">
              <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>
                  Paso {current + 1} de {total}
                </span>
                <span>{Math.round(((current + 1) / total) * 100)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={current + 1} aria-label="Progreso del registro">
                <div className="h-full rounded-full bg-brand-600 transition-all duration-300" style={{ width: `${((current + 1) / total) * 100}%` }} />
              </div>
            </div>
          )}

          <div className="mb-4">
            <h2 className="text-base font-semibold text-foreground">{screenTitle}</h2>
            {screenDescription && <p className="mt-0.5 text-sm text-muted-foreground">{screenDescription}</p>}
          </div>

          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              next();
            }}
            className="space-y-4"
          >
            {/* Todas las pantallas quedan montadas (ocultas) para no perder el estado de sus campos. */}
            <div hidden={current !== 0} className="space-y-3">
              {roles.length > 1 && (
                <fieldset>
                  <legend className="mb-1 block text-xs font-medium text-foreground">¿Cómo quieres participar?</legend>
                  <div className="grid gap-1.5">
                    {roles.map((r) => (
                      <label key={r.key} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${role === r.key ? "border-brand-600 bg-brand-50 dark:bg-brand-700/30" : "border-border hover:bg-muted"}`}>
                        <input type="radio" name="role" checked={role === r.key} onChange={() => setRole(r.key)} />
                        <span className="text-foreground">{r.label}</span>
                      </label>
                    ))}
                  </div>
                  {picked?.needsApproval && <p className="mt-1 text-[11px] text-muted-foreground">Tu postulación como {picked.label.toLowerCase()} será revisada por el equipo antes de confirmarla.</p>}
                </fieldset>
              )}
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-foreground">Tu nombre completo</span>
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={100} autoComplete="name" placeholder="Nombre y apellido" className={inputClass} />
              </label>
              {canPick && (
                <div>
                  <span className="mb-1 block text-xs font-medium text-foreground">¿Cómo quieres recibir el código?</span>
                  <div className="grid grid-cols-2 gap-2">
                    {(["phone", "email"] as Channel[]).map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-pressed={channel === c}
                        onClick={() => setChannel(c)}
                        className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm ${channel === c ? "border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-700/30 dark:text-brand-100" : "border-border text-muted-foreground hover:bg-muted"}`}
                      >
                        {c === "email" ? <Mail className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />} {c === "email" ? "Correo" : "WhatsApp"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {channel === "email" ? (
                <>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-foreground">Tu correo electrónico</span>
                    <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tucorreo@ejemplo.com" className={inputClass} />
                  </label>
                  <div>
                    <span className="mb-1 block text-xs font-medium text-foreground">Tu número de teléfono</span>
                    <PhonePortalInput dial={otherPhone.dial} value={otherPhone.national} onChange={(v) => setOtherPhone(v)} />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <span className="mb-1 block text-xs font-medium text-foreground">Tu número de WhatsApp</span>
                    <PhonePortalInput dial={phone.dial} value={phone.national} onChange={(v) => setPhone(v)} />
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-foreground">
                      Tu correo electrónico <span className="font-normal text-muted-foreground">(opcional)</span>
                    </span>
                    <input type="email" inputMode="email" autoComplete="email" value={otherEmail} onChange={(e) => setOtherEmail(e.target.value)} placeholder="tucorreo@ejemplo.com" className={inputClass} />
                  </label>
                </>
              )}
            </div>

            {screens.map((s, i) => (
              <div key={i} hidden={current !== i + 1} className="space-y-4">
                {s.fields.map((f) => (
                  <Field key={f.key} label={f.required ? `${f.label} *` : f.label}>
                    <FieldInput f={f} value={values[f.key] ?? ""} onChange={(v) => setValues((st) => ({ ...st, [f.key]: v }))} />
                  </Field>
                ))}
                {s.questions.length > 0 && <QuestionFields questions={s.questions} answers={answers} onChange={(id, v) => setAnswers((a) => ({ ...a, [id]: v }))} />}
              </div>
            ))}

            {isLast && (
              <label className="flex items-start gap-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
                <span>{info.registration.consentText.replace(/\{\{\s*empresa\s*\}\}/gi, info.tenant.name)}</span>
              </label>
            )}

            {error && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

            <div className="flex items-center gap-2">
              {current > 0 && (
                <button type="button" onClick={() => goTo(current - 1)} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  <ArrowLeft className="h-4 w-4" /> Atrás
                </button>
              )}
              <button type="submit" disabled={busy} className={`${primaryButton} flex-1 justify-center py-2.5 text-sm`}>
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {isLast ? `Registrarme y recibir el código` : "Continuar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
