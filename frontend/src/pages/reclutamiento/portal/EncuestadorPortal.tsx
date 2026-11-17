import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, LogOut, Mail, MessageCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { OtpInput } from "@/pages/cursos/OtpInput";
import { PhonePortalInput } from "@/pages/cursos/PhonePortalInput";
import {
  isUnauthorized,
  portalError,
  portalTokenKey,
  recruitPortalApi,
  type InvitationInfo,
  type PortalInfo,
  type PortalMe,
} from "@/services/recruitPortal";
import { inputClass, primaryButton, secondaryButton } from "../shared";
import { ContractsSection, DataSection, DocumentsSection } from "./PortalSections";

type Channel = "email" | "phone";

/** Pantalla de acceso: enlace de invitación o correo/teléfono, y código de verificación. */
function LoginGate({
  slug,
  info,
  inviteToken,
  onLoggedIn,
}: {
  slug: string;
  info: PortalInfo;
  inviteToken: string | null;
  onLoggedIn: (token: string) => void;
}) {
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [inviteFailed, setInviteFailed] = useState(false);
  const [loadingInvite, setLoadingInvite] = useState(!!inviteToken);
  const [channel, setChannel] = useState<Channel>(info.verificationChannel === "phone" ? "phone" : "email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState({ national: "", e164: "" });
  const [step, setStep] = useState<"destination" | "code">("destination");
  const [otp, setOtp] = useState<{ otpId: string; masked: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!inviteToken) return;
    recruitPortalApi
      .invitation(slug, inviteToken)
      .then((r) => {
        setInvitation(r);
        if (r.channels[0]) setChannel(r.channels[0].channel);
      })
      .catch(() => setInviteFailed(true))
      .finally(() => setLoadingInvite(false));
  }, [slug, inviteToken]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const useInvitation = !!invitation && invitation.channels.length > 0;
  const canPick = info.verificationChannel === "both";

  const send = async () => {
    setError("");
    if (!useInvitation) {
      if (channel === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError("Escribe un correo válido");
      if (channel === "phone" && phone.national.length < 4) return setError("Escribe tu número de WhatsApp");
    }
    setBusy(true);
    try {
      const res = await recruitPortalApi.requestCode(slug, {
        channel,
        ...(useInvitation ? { inviteToken: inviteToken! } : { destination: channel === "email" ? email.trim() : phone.e164 }),
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
      const res = await recruitPortalApi.verifyCode(slug, otp.otpId, value);
      onLoggedIn(res.portalToken);
    } catch (err) {
      setError(portalError(err, "Código incorrecto"));
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  if (loadingInvite) return <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" aria-label="Cargando" />;

  return (
    <div className="mx-auto w-full max-w-sm space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-700/30 dark:text-brand-100">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">
          {useInvitation && invitation?.name ? `Hola, ${invitation.name}` : "Verifica tu identidad"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {step === "destination"
            ? `Te enviaremos un código de verificación para entrar al portal de ${info.tenant.name}.`
            : `Escribe el código de 6 dígitos que enviamos a ${otp?.masked}.`}
        </p>
      </div>

      {inviteToken && inviteFailed && (
        <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/15 dark:text-amber-100">
          Tu enlace de invitación venció o ya no es válido. Puedes entrar con tu correo o tu WhatsApp registrados, o pedir una invitación nueva.
        </p>
      )}

      {step === "destination" ? (
        <div className="space-y-3">
          {useInvitation ? (
            <div className="space-y-2">
              {invitation!.channels.map((c) => (
                <button
                  key={c.channel}
                  type="button"
                  onClick={() => setChannel(c.channel)}
                  aria-pressed={channel === c.channel}
                  className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${channel === c.channel ? "border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-700/30 dark:text-brand-100" : "border-border text-foreground hover:bg-muted"}`}
                >
                  {c.channel === "email" ? <Mail className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
                  <span>{c.channel === "email" ? "Correo" : "WhatsApp"}: <strong>{c.masked}</strong></span>
                </button>
              ))}
            </div>
          ) : (
            <>
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
              <p className="text-[11px] text-muted-foreground">Usa el correo o el número con el que te registraron.</p>
            </>
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
            <button type="button" onClick={() => { setStep("destination"); setError(""); }} className="hover:text-foreground">Cambiar destino</button>
            <button type="button" onClick={send} disabled={resendIn > 0 || busy} className="hover:text-foreground disabled:opacity-50">
              {resendIn > 0 ? `Reenviar en ${resendIn} s` : "Reenviar código"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Portal público del encuestador: completar datos, subir documentos y firmar contratos. */
export function EncuestadorPortal() {
  const { tenantSlug } = useParams();
  const slug = tenantSlug ?? "";
  const [searchParams, setSearchParams] = useSearchParams();
  const inviteToken = searchParams.get("i");

  const [info, setInfo] = useState<PortalInfo | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [token, setToken] = useState<string | null>(() => (slug ? localStorage.getItem(portalTokenKey(slug)) : null));
  const [me, setMe] = useState<PortalMe | null>(null);
  const [checking, setChecking] = useState(!!token);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  useEffect(() => {
    if (!slug) return;
    recruitPortalApi.info(slug).then(setInfo).catch(() => setUnavailable(true));
  }, [slug]);

  const logout = useCallback(
    (message?: string) => {
      localStorage.removeItem(portalTokenKey(slug));
      setToken(null);
      setMe(null);
      if (message) toast.message(message);
    },
    [slug],
  );

  /** Recarga los datos; si la sesión ya no vale, vuelve al acceso. */
  const refresh = useCallback(async () => {
    const t = tokenRef.current;
    if (!t) return;
    try {
      setMe(await recruitPortalApi.me(slug, t));
    } catch (err) {
      if (isUnauthorized(err)) logout("Tu sesión terminó. Verifica tu identidad de nuevo.");
      else toast.error(portalError(err, "No se pudo cargar tu información"));
    }
  }, [slug, logout]);

  useEffect(() => {
    if (!token) {
      setChecking(false);
      return;
    }
    setChecking(true);
    refresh().finally(() => setChecking(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const onLoggedIn = (t: string) => {
    localStorage.setItem(portalTokenKey(slug), t);
    setToken(t);
    // El enlace de invitación ya cumplió su función: se quita de la barra de direcciones.
    if (searchParams.has("i")) {
      searchParams.delete("i");
      setSearchParams(searchParams, { replace: true });
    }
  };

  if (unavailable) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 px-6 text-center">
        <h1 className="text-lg font-semibold text-foreground">Portal no disponible</h1>
        <p className="mt-1 text-sm text-muted-foreground">El enlace no es válido o el portal no está habilitado.</p>
      </div>
    );
  }
  if (!info || checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Cargando" />
      </div>
    );
  }

  if (!token || !me) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-muted/40 px-4 py-10">
        <p className="text-sm font-medium text-muted-foreground">{info.tenant.name}</p>
        <LoginGate slug={slug} info={info} inviteToken={inviteToken} onLoggedIn={onLoggedIn} />
        {info.welcomeMessage && <p className="max-w-sm whitespace-pre-wrap text-center text-xs text-muted-foreground">{info.welcomeMessage}</p>}
      </div>
    );
  }

  const { progress } = me;
  const allDone = progress.missingFields === 0 && progress.missingDocuments === 0 && progress.contractsToSign === 0;

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{me.tenant.name}</p>
            <p className="truncate text-xs text-muted-foreground">{me.profile.name || me.profile.email || me.profile.phone}</p>
          </div>
          <button type="button" onClick={() => logout()} className={`${secondaryButton} ml-auto`}>
            <LogOut className="h-3.5 w-3.5" /> Salir
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        {me.welcomeMessage && <p className="whitespace-pre-wrap rounded-xl bg-card px-4 py-3 text-sm text-foreground shadow-sm">{me.welcomeMessage}</p>}

        <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm ${allDone ? "bg-green-50 text-green-800 dark:bg-green-500/15 dark:text-green-200" : "bg-amber-50 text-amber-900 dark:bg-amber-500/15 dark:text-amber-100"}`}>
          {allDone ? <CheckCircle2 className="h-4 w-4" /> : null}
          <span>
            {allDone
              ? "Todo está al día. Gracias."
              : [
                  progress.missingFields > 0 && `${progress.missingFields} dato(s) por completar`,
                  progress.missingDocuments > 0 && `${progress.missingDocuments} documento(s) por subir`,
                  progress.contractsToSign > 0 && `${progress.contractsToSign} contrato(s) por firmar`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </span>
        </div>

        {me.contracts.length > 0 && <ContractsSection slug={slug} token={token} me={me} onChanged={refresh} onSessionLost={() => logout("Tu sesión terminó. Verifica tu identidad de nuevo.")} />}
        {me.fields.length > 0 && <DataSection slug={slug} token={token} me={me} onChanged={setMe} onSessionLost={() => logout("Tu sesión terminó. Verifica tu identidad de nuevo.")} />}
        {me.documents.length > 0 && <DocumentsSection slug={slug} token={token} me={me} onChanged={refresh} onSessionLost={() => logout("Tu sesión terminó. Verifica tu identidad de nuevo.")} />}
      </main>
    </div>
  );
}
