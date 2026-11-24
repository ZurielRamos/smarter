import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Mail, MessageCircle, ShieldCheck } from "lucide-react";
import { OtpInput } from "@/pages/cursos/OtpInput";
import { PhonePortalInput } from "@/pages/cursos/PhonePortalInput";
import { portalError, projectTokenKey, recruitPortalApi, type PortalInfo } from "@/services/recruitPortal";
import { Field, inputClass, primaryButton } from "../shared";
import { FieldInput } from "./PortalSections";
import { firstMissing, type Answers } from "./answers";
import { QuestionFields } from "./QuestionFields";

type Channel = "email" | "phone";
type Step = "form" | "code" | "done";

/**
 * Registro desde la landing de un proyecto. La persona deja su nombre, su
 * teléfono y correo (verifica uno con un código), los datos personales y las
 * preguntas que pide el proyecto. Queda como contacto de la cuenta y como
 * prospecto del proyecto, con sesión solo en esta landing.
 */
export function ProjectRegistration({ slug, projectSlug, info, onSession }: { slug: string; projectSlug: string; info: PortalInfo; onSession: () => void }) {
  const project = info.project!;
  const questions = project.questions;
  const fields = project.fields;
  const open = info.registration.open;
  const [step, setStep] = useState<Step>("form");
  const [fullName, setFullName] = useState("");
  const [channel, setChannel] = useState<Channel>(info.verificationChannel === "phone" ? "phone" : "email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState({ national: "", e164: "" });
  const [otherEmail, setOtherEmail] = useState("");
  const [otherPhone, setOtherPhone] = useState({ national: "", e164: "" });
  const [values, setValues] = useState<Record<string, string>>({});
  const roles = project.roles ?? [];
  const [role, setRole] = useState(project.defaultRole);
  const picked = roles.find((r) => r.key === role);
  const [answers, setAnswers] = useState<Answers>({});
  const [consent, setConsent] = useState(false);
  const [otp, setOtp] = useState<{ otpId: string; masked: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<"applied" | "existing" | "closed">("applied");
  const canPick = info.verificationChannel === "both";

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const send = async () => {
    setError("");
    if (fullName.trim().length < 3) return setError("Escribe tu nombre completo");
    if (channel === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError("Escribe un correo válido");
    if (channel === "phone" && phone.national.length < 4) return setError("Escribe tu número de WhatsApp");
    if (channel === "email" && otherPhone.national.length < 4) return setError("Escribe tu número de teléfono");
    if (channel === "phone" && otherEmail.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(otherEmail.trim())) return setError("Escribe un correo válido");
    const missingField = fields.find((f) => f.required && !(values[f.key] ?? "").trim());
    if (missingField) return setError(`Completa: «${missingField.label}»`);
    const missing = firstMissing(questions, answers);
    if (missing) return setError(`Responde: «${missing.label}»`);
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
      setStep("code");
      setResendIn(30);
    } catch (err) {
      setError(portalError(err, "No se pudo enviar el código"));
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
      // La sesión queda guardada solo para esta landing.
      if (res.sessionToken) {
        localStorage.setItem(projectTokenKey(slug, projectSlug), res.sessionToken);
        onSession();
      }
      setOutcome(res.status);
      setStep("done");
    } catch (err) {
      setError(portalError(err, "Código incorrecto"));
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  if (step === "done") {
    const closed = outcome === "closed";
    return (
      <div className="mx-auto w-full max-w-sm space-y-3 rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
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

  return (
    <div className="mx-auto w-full max-w-sm space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-700/30 dark:text-brand-100">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">{`Regístrate en ${project.name}`}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {step === "form"
            ? `Verificaremos tu ${channel === "email" ? "correo" : "WhatsApp"} con un código y guardaremos tu registro. Podrás volver a ingresar con un código para ver tu estado.`
            : `Escribe el código de 6 dígitos que enviamos a ${otp?.masked}.`}
        </p>
      </div>
      {!open ? (
        <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-center text-xs text-amber-900 dark:bg-amber-500/15 dark:text-amber-100">
          Por ahora este proyecto no recibe registros.
        </p>
      ) : step === "form" ? (
        <div className="space-y-3">
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
            <div className="grid grid-cols-2 gap-2">
              {(["email", "phone"] as Channel[]).map((c) => (
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
          )}
          {channel === "email" ? (
            <>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-foreground">Tu correo electrónico (lo verificamos con un código)</span>
                <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tucorreo@ejemplo.com" className={inputClass} />
              </label>
              <div>
                <span className="mb-1 block text-xs font-medium text-foreground">Tu número de teléfono</span>
                <PhonePortalInput value={otherPhone.national} onChange={(v) => setOtherPhone({ national: v.national, e164: v.e164 })} />
              </div>
            </>
          ) : (
            <>
              <div>
                <span className="mb-1 block text-xs font-medium text-foreground">Tu número de WhatsApp (lo verificamos con un código)</span>
                <PhonePortalInput value={phone.national} onChange={(v) => setPhone({ national: v.national, e164: v.e164 })} />
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-foreground">Tu correo electrónico (opcional)</span>
                <input type="email" inputMode="email" autoComplete="email" value={otherEmail} onChange={(e) => setOtherEmail(e.target.value)} placeholder="tucorreo@ejemplo.com" className={inputClass} />
              </label>
            </>
          )}
          {fields.length > 0 && (
            <div className="space-y-3 border-t border-border pt-3">
              {fields.map((f) => (
                <Field key={f.key} label={f.required ? `${f.label} *` : f.label}>
                  <FieldInput f={f} value={values[f.key] ?? ""} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
                </Field>
              ))}
            </div>
          )}
          {questions.length > 0 && (
            <div className="space-y-3 border-t border-border pt-3">
              <QuestionFields questions={questions} answers={answers} onChange={(id, v) => setAnswers((a) => ({ ...a, [id]: v }))} />
            </div>
          )}
          <label className="flex items-start gap-2 text-[11px] text-muted-foreground">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
            <span>{info.registration.consentText.replace(/\{\{\s*empresa\s*\}\}/gi, info.tenant.name)}</span>
          </label>
          {error && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
          <button type="button" onClick={send} disabled={busy} className={`${primaryButton} w-full justify-center py-2.5 text-sm`}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Registrarme
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <OtpInput value={code} onChange={setCode} onComplete={verify} />
          {error && <p role="alert" className="text-center text-xs text-rose-600 dark:text-rose-400">{error}</p>}
          <button type="button" onClick={() => verify(code)} disabled={busy || code.length < 6} className={`${primaryButton} w-full justify-center py-2.5 text-sm`}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Confirmar
          </button>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <button type="button" onClick={() => { setStep("form"); setError(""); }} className="hover:text-foreground">Cambiar datos</button>
            <button type="button" onClick={send} disabled={resendIn > 0 || busy} className="hover:text-foreground disabled:opacity-50">
              {resendIn > 0 ? `Reenviar en ${resendIn} s` : "Reenviar código"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
