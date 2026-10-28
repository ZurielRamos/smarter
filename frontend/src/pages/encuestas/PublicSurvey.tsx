import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { CheckCircle, Loader2, ArrowLeft } from "lucide-react";
import axios from "axios";
import {
  screensInOrder,
  SurveyFormFields,
  validateFields,
  type SurveyScreen,
} from "./SurveyFormFields";
import { useBranding } from "@/context/BrandingContext";

// Cliente sin interceptores de auth: la encuesta pública no requiere token.
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });

interface PublicSurveyData {
  id: string;
  name: string;
  displayTitle: string | null;
  description: string | null;
  logoUrl: string | null;
  theme: { primary?: string; background?: string } | null;
  requireLocation: boolean;
  flowJson: Record<string, any> | null;
}

export function PublicSurvey() {
  const branding = useBranding();
  const { surveySlug } = useParams();
  const [searchParams] = useSearchParams();
  const agentToken = searchParams.get("a"); // enlace por agente: /s/:slug?a=token
  const [survey, setSurvey] = useState<PublicSurveyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [values, setValues] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!surveySlug) return;
    api
      .get<PublicSurveyData>(`/surveys/public/${surveySlug}`)
      .then(({ data }) => setSurvey(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [surveySlug]);

  // Pantallas en orden de navegación (según routing_model), igual que WhatsApp.
  const screens = useMemo<SurveyScreen[]>(
    () => screensInOrder(survey?.flowJson || null),
    [survey],
  );

  const current = screens[step];
  const isLast = step === screens.length - 1;

  // Al escribir, limpia el error de ese campo (feedback inmediato y elegante).
  const setValue = (name: string, value: any) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => {
      if (!e[name]) return e;
      const next = { ...e };
      delete next[name];
      return next;
    });
  };

  // Pide la ubicación del navegador (si la encuesta la requiere).
  const requestLocation = (): Promise<{ lat: number; lng: number; accuracy?: number }> =>
    new Promise((resolve, reject) => {
      if (!("geolocation" in navigator)) {
        reject(new Error("Tu navegador no soporta geolocalización."));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }),
        () => reject(new Error("Necesitamos tu ubicación para enviar la encuesta. Permite el acceso e inténtalo de nuevo.")),
        { enableHighAccuracy: true, timeout: 10000 },
      );
    });

  const [locationError, setLocationError] = useState<string | null>(null);

  const submit = async () => {
    if (!survey) return;
    setSubmitting(true);
    setLocationError(null);
    try {
      let location: { lat: number; lng: number; accuracy?: number } | null = null;
      if (survey.requireLocation) {
        try {
          location = await requestLocation();
        } catch (geoErr: any) {
          setLocationError(geoErr?.message || "No se pudo obtener tu ubicación.");
          setSubmitting(false);
          return;
        }
      }
      await api.post(`/surveys/public/${survey.id}/submit`, {
        responseData: values,
        location,
        agentToken,
      });
      setSubmitted(true);
    } catch {
      /* cliente sin interceptores: sin toast global */
    } finally {
      setSubmitting(false);
    }
  };

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    // Validación propia de la pantalla actual (obligatorios + formato).
    const screenErrors = validateFields(current?.fields || [], values);
    if (Object.keys(screenErrors).length > 0) {
      setErrors(screenErrors);
      return;
    }
    setErrors({});
    if (isLast) {
      submit();
    } else {
      setStep((s) => Math.min(s + 1, screens.length - 1));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (error || !survey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="text-center">
          <p className="text-lg font-medium text-foreground">Encuesta no encontrada</p>
          <p className="text-sm text-muted-foreground mt-1">
            Esta encuesta no existe o no está disponible.
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="bg-card rounded-2xl shadow-lg p-10 max-w-md w-full mx-4 text-center">
          <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">¡Gracias!</h2>
          <p className="text-sm text-muted-foreground">Tu respuesta ha sido registrada.</p>
        </div>
      </div>
    );
  }

  const totalSteps = screens.length;
  const primary = survey.theme?.primary || undefined;
  const background = survey.theme?.background || undefined;

  return (
    <div
      className="min-h-screen py-12 px-4 bg-muted"
      style={background ? { background } : undefined}
    >
      <div className="max-w-lg mx-auto">
        <div className="bg-card rounded-2xl shadow-lg p-8">
          {/* Header: logo (si hay) siempre visible; título + descripción solo
              en la primera pantalla. */}
          {survey.logoUrl && (
            <div className="flex justify-center mb-4">
              <img
                src={survey.logoUrl}
                alt=""
                className="max-h-16 max-w-[60%] object-contain"
              />
            </div>
          )}
          {step === 0 && (
            <>
              <h1 className="text-2xl font-bold text-foreground mb-1">
                {survey.displayTitle || survey.name}
              </h1>
              {survey.description && (
                <p className="text-sm text-muted-foreground mb-5">{survey.description}</p>
              )}
            </>
          )}

          {/* Progreso multi-pantalla */}
          {totalSteps > 1 && (
            <div className="mb-5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-medium text-muted-foreground">
                  {current?.title || `Paso ${step + 1}`}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Paso {step + 1} de {totalSteps}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={"h-full rounded-full transition-all" + (primary ? "" : " bg-brand-600")}
                  style={{
                    width: `${((step + 1) / totalSteps) * 100}%`,
                    ...(primary ? { background: primary } : {}),
                  }}
                />
              </div>
            </div>
          )}

          {totalSteps === 0 ? (
            <p className="text-sm text-muted-foreground">Esta encuesta aún no tiene preguntas.</p>
          ) : (
            <form onSubmit={handleNext} className="space-y-5">
              <SurveyFormFields
                fields={current?.fields || []}
                values={values}
                onChange={setValue}
                errors={errors}
              />

              {survey.requireLocation && isLast && (
                <div className="flex items-start gap-2 text-[11px] text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                  <span className="shrink-0">📍</span>
                  <span>Al enviar, se te pedirá compartir tu ubicación.</span>
                </div>
              )}
              {locationError && (
                <p className="text-xs text-red-500">{locationError}</p>
              )}

              <div className="flex items-center gap-2 pt-1">
                {step > 0 && (
                  <button
                    type="button"
                    onClick={() => setStep((s) => Math.max(0, s - 1))}
                    className="flex items-center gap-1.5 px-4 py-3 rounded-xl text-sm font-medium text-foreground border border-border hover:bg-muted transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" /> Atrás
                  </button>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className={
                    "flex-1 py-3 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-60" +
                    (primary ? "" : " bg-brand-700 hover:bg-brand-600")
                  }
                  style={primary ? { background: primary } : undefined}
                >
                  {submitting
                    ? "Enviando..."
                    : isLast
                      ? current?.footerLabel || "Enviar"
                      : current?.footerLabel || "Continuar"}
                </button>
              </div>
            </form>
          )}
        </div>
        <p className="text-center text-[10px] text-muted-foreground mt-4">Powered by {branding.name}</p>
      </div>
    </div>
  );
}
