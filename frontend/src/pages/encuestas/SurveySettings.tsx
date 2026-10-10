import { useState } from "react";
import { Loader2, MapPin, MessageCircle, Lock } from "lucide-react";
import { toast } from "sonner";
import { updateSurvey, type SurveyItem } from "@/services/surveys";

/**
 * Configuración de la encuesta. Incluye "Requerir ubicación", que es exclusivo
 * del canal web: solo se puede activar si la encuesta NO está en WhatsApp, y
 * mientras esté activo la encuesta no se podrá publicar en WhatsApp.
 */
export function SurveySettings({
  survey,
  onChanged,
}: {
  survey: SurveyItem;
  onChanged: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const inWhatsApp = !!survey.metaFlowId;

  const toggleLocation = async (next: boolean) => {
    setSaving(true);
    try {
      await updateSurvey(survey.id, { requireLocation: next });
      toast.success(next ? "Ubicación requerida activada" : "Ubicación requerida desactivada");
      onChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "No se pudo guardar la configuración");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Requerir ubicación */}
      <div className="rounded-xl border border-border p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-brand-50 dark:bg-brand-500/15 flex items-center justify-center shrink-0">
              <MapPin className="h-4 w-4 text-brand-600" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">Requerir ubicación</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Al responder por el enlace público, se pedirá al encuestado compartir su ubicación.
              </p>
            </div>
          </div>

          {/* Toggle */}
          <button
            type="button"
            role="switch"
            aria-checked={survey.requireLocation}
            disabled={saving || (inWhatsApp && !survey.requireLocation)}
            onClick={() => toggleLocation(!survey.requireLocation)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              survey.requireLocation ? "bg-brand-600" : "bg-muted-foreground/30"
            }`}
          >
            {saving ? (
              <Loader2 className="h-3 w-3 animate-spin text-white mx-auto" />
            ) : (
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  survey.requireLocation ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            )}
          </button>
        </div>

        {/* Avisos de las reglas de exclusividad con WhatsApp */}
        {inWhatsApp && !survey.requireLocation && (
          <div className="mt-3 flex items-start gap-2 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-3 py-2">
            <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              No disponible: esta encuesta ya está publicada en WhatsApp. WhatsApp no admite captura
              de ubicación. Despublícala para poder activarlo.
            </span>
          </div>
        )}
        {survey.requireLocation && (
          <div className="mt-3 flex items-start gap-2 text-[11px] text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
            <MessageCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Mientras esté activo, esta encuesta <strong>no se puede publicar en WhatsApp</strong>.
              La ubicación solo funciona por el enlace público.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
