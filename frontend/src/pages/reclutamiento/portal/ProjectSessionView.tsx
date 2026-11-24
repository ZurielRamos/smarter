import { useEffect, useState } from "react";
import { Loader2, LogOut, Mail, MessageCircle, ShieldCheck } from "lucide-react";
import { OtpInput } from "@/pages/cursos/OtpInput";
import { PhonePortalInput } from "@/pages/cursos/PhonePortalInput";
import { isUnauthorized, portalError, projectTokenKey, recruitPortalApi, type PortalInfo, type ProjectMe } from "@/services/recruitPortal";
import { formatDateTime } from "../format";
import { Pill, inputClass, primaryButton, secondaryButton } from "../shared";
import { MY_STATUS } from "./prospectStatus";

type Channel = "email" | "phone";

/** Ingreso con código a la landing de un proyecto, para quien ya se registró en él. La sesión vale solo para este proyecto. */
export function ProjectLogin({ slug, projectSlug, info, onLoggedIn }: { slug: string; projectSlug: string; info: PortalInfo; onLoggedIn: () => void }) {
  const project = info.project!;
  const [channel, setChannel] = useState<Channel>(info.verificationChannel === "phone" ? "phone" : "email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState({ national: "", e164: "" });
  const [otp, setOtp] = useState<{ otpId: string; masked: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const send = async () => {
    setError("");
    if (channel === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError("Escribe un correo válido");
    if (channel === "phone" && phone.national.length < 4) return setError("Escribe tu número de WhatsApp");
    setBusy(true);
    try {
      const res = await recruitPortalApi.requestProjectLogin(slug, projectSlug, { channel, destination: channel === "email" ? email.trim() : phone.e164 });
      setOtp({ otpId: res.otpId, masked: res.maskedDestination });
      setCode("");
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
      const res = await recruitPortalApi.verifyProjectLogin(slug, projectSlug, otp.otpId, value);
      localStorage.setItem(projectTokenKey(slug, projectSlug), res.sessionToken);
      onLoggedIn();
    } catch (err) {
      setError(portalError(err, "Código incorrecto"));
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-sm space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-700/30 dark:text-brand-100">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">{`Ingresa a ${project.name}`}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{otp ? `Si ${otp.masked} está registrado en este proyecto, le enviamos un código de 6 dígitos. Escríbelo aquí.` : "Usa el correo o el WhatsApp con el que te registraste en este proyecto. Te enviaremos un código."}</p>
      </div>
      {!otp ? (
        <div className="space-y-3">
          {info.verificationChannel === "both" && (
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
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-foreground">Tu correo electrónico</span>
              <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="tucorreo@ejemplo.com" className={inputClass} />
            </label>
          ) : (
            <div>
              <span className="mb-1 block text-xs font-medium text-foreground">Tu número de WhatsApp</span>
              <PhonePortalInput value={phone.national} onChange={(v) => setPhone({ national: v.national, e164: v.e164 })} onEnter={send} />
            </div>
          )}
          {error && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
          <button type="button" onClick={send} disabled={busy} className={`${primaryButton} w-full justify-center py-2.5 text-sm`}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Enviarme el código
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <OtpInput value={code} onChange={setCode} onComplete={verify} />
          {error && <p role="alert" className="text-center text-xs text-rose-600 dark:text-rose-400">{error}</p>}
          <button type="button" onClick={() => verify(code)} disabled={busy || code.length < 6} className={`${primaryButton} w-full justify-center py-2.5 text-sm`}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Entrar
          </button>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <button type="button" onClick={() => { setOtp(null); setError(""); }} className="hover:text-foreground">Cambiar destino</button>
            <button type="button" onClick={send} disabled={resendIn > 0 || busy} className="hover:text-foreground disabled:opacity-50">
              {resendIn > 0 ? `Reenviar en ${resendIn} s` : "Reenviar código"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Lo que ve la persona con la sesión de esta landing: su estado en el proyecto. */
export function ProjectStatusView({ slug, projectSlug, token, tenantName, onLogout, onSessionLost }: { slug: string; projectSlug: string; token: string; tenantName: string; onLogout: () => void; onSessionLost: () => void }) {
  const [me, setMe] = useState<ProjectMe | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setError("");
    recruitPortalApi
      .projectMe(slug, projectSlug, token)
      .then((r) => alive && setMe(r))
      .catch((err) => {
        if (!alive) return;
        if (isUnauthorized(err)) onSessionLost();
        else setError(portalError(err, "No se pudo cargar tu información"));
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, projectSlug, token, attempt]);

  // Un fallo pasajero (servidor reiniciando, red) no cierra la sesión: se puede reintentar.
  if (error) {
    return (
      <div className="mx-auto w-full max-w-sm space-y-3 rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
        <button type="button" onClick={() => setAttempt((n) => n + 1)} className={`${secondaryButton} w-full justify-center`}>
          Reintentar
        </button>
      </div>
    );
  }
  if (!me) return <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" aria-label="Cargando" />;
  const s = MY_STATUS[me.status];
  return (
    <div className="mx-auto w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div>
        <p className="text-xs text-muted-foreground">{tenantName}</p>
        <h1 className="text-lg font-semibold text-foreground">{me.project.name}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Hola, {me.person.name}</p>
      </div>
      <div className="rounded-xl border border-border bg-background p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-muted-foreground">Tu estado{me.roleLabel ? ` como ${me.roleLabel.toLowerCase()}` : ""}</span>
          <Pill cls={s.cls}>{s.label}</Pill>
        </div>
        <p className="mt-2 text-sm text-foreground">{s.text}</p>
        <p className="mt-2 text-[11px] text-muted-foreground">Te registraste el {formatDateTime(me.registeredAt)}.</p>
      </div>
      <button type="button" onClick={onLogout} className={`${secondaryButton} w-full justify-center`}>
        <LogOut className="h-3.5 w-3.5" /> Salir
      </button>
    </div>
  );
}
