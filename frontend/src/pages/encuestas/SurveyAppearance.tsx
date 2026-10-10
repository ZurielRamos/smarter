import { useRef, useState } from "react";
import { Loader2, Trash2, Save, Image as ImageIcon, Palette } from "lucide-react";
import { toast } from "sonner";
import { ColorPicker } from "@/components/ui/color-picker";
import {
  updateSurvey,
  uploadSurveyLogo,
  removeSurveyLogo,
  type SurveyItem,
} from "@/services/surveys";

const DEFAULT_PRIMARY = "#1f6feb";
const DEFAULT_BACKGROUND = "#f3f4f6";

/**
 * Apariencia de la encuesta en el enlace público: título mostrado, logo de
 * header y colores (primario + fondo). No afecta al Flow de WhatsApp.
 */
export function SurveyAppearance({
  survey,
  onChanged,
}: {
  survey: SurveyItem;
  onChanged: () => void;
}) {
  const [displayTitle, setDisplayTitle] = useState(survey.displayTitle || "");
  const [savingTitle, setSavingTitle] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [primary, setPrimary] = useState(survey.theme?.primary || DEFAULT_PRIMARY);
  const [background, setBackground] = useState(survey.theme?.background || DEFAULT_BACKGROUND);
  const [savingTheme, setSavingTheme] = useState(false);

  const titleDirty = (survey.displayTitle || "") !== displayTitle.trim();
  const themeDirty =
    (survey.theme?.primary || DEFAULT_PRIMARY) !== primary ||
    (survey.theme?.background || DEFAULT_BACKGROUND) !== background;

  const saveTitle = async () => {
    setSavingTitle(true);
    try {
      await updateSurvey(survey.id, { displayTitle: displayTitle.trim() || null });
      toast.success("Título actualizado");
      onChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "No se pudo guardar el título");
    } finally {
      setSavingTitle(false);
    }
  };

  // Seleccionar imagen = subir directo (sin botón intermedio).
  const onPickFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecciona una imagen");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("La imagen no debe superar 5 MB");
      return;
    }
    setUploading(true);
    try {
      await uploadSurveyLogo(survey.id, file);
      toast.success("Logo actualizado");
      onChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "No se pudo subir el logo");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeLogo = async () => {
    setUploading(true);
    try {
      await removeSurveyLogo(survey.id);
      toast.success("Logo eliminado");
      onChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "No se pudo eliminar el logo");
    } finally {
      setUploading(false);
    }
  };

  const saveTheme = async () => {
    setSavingTheme(true);
    try {
      await updateSurvey(survey.id, { theme: { primary, background } });
      toast.success("Colores actualizados");
      onChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "No se pudieron guardar los colores");
    } finally {
      setSavingTheme(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Título + logo */}
      <div className="rounded-xl border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <ImageIcon className="h-4 w-4 text-brand-600" />
          <h3 className="text-sm font-semibold text-foreground">Encabezado</h3>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Título mostrado */}
          <div>
            <label className="block text-[11px] font-medium text-foreground mb-1.5">
              Título de la encuesta
            </label>
            <div className="flex items-center gap-2">
              <input
                value={displayTitle}
                onChange={(e) => setDisplayTitle(e.target.value)}
                placeholder={survey.name}
                maxLength={200}
                className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200"
              />
              <button
                onClick={saveTitle}
                disabled={!titleDirty || savingTitle}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
              >
                {savingTitle ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Lo que verá el encuestado. Si lo dejas vacío, se usa el nombre interno ({survey.name}).
            </p>
          </div>

          {/* Logo: seleccionar sube directo; clic en el recuadro abre el selector */}
          <div>
            <label className="block text-[11px] font-medium text-foreground mb-1.5">
              Logo / imagen de header
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                title={survey.logoUrl ? "Cambiar imagen" : "Seleccionar imagen"}
                className="h-16 w-16 rounded-lg border border-dashed border-border bg-muted/40 flex items-center justify-center overflow-hidden shrink-0 hover:border-brand-300 transition-colors disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : survey.logoUrl ? (
                  <img src={survey.logoUrl} alt="Logo" className="h-full w-full object-contain" />
                ) : (
                  <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
                )}
              </button>
              {survey.logoUrl && (
                <button
                  onClick={removeLogo}
                  disabled={uploading}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Eliminar
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onPickFile(f);
                }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Haz clic para seleccionar. PNG, JPG o WebP. Máx. 5 MB.
            </p>
          </div>
        </div>
      </div>

      {/* Colores */}
      <div className="rounded-xl border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-brand-600" />
            <h3 className="text-sm font-semibold text-foreground">Colores del formulario</h3>
          </div>
          <button
            onClick={saveTheme}
            disabled={!themeDirty || savingTheme}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
          >
            {savingTheme ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Guardar colores
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <ColorPicker
            label="Color principal (botones y acentos)"
            value={primary}
            onChange={setPrimary}
          />
          <ColorPicker label="Fondo de la página" value={background} onChange={setBackground} />
        </div>

        {/* Vista previa rápida */}
        <div className="mt-4">
          <p className="text-[11px] font-medium text-foreground mb-1.5">Vista previa</p>
          <div className="rounded-lg border border-border p-4" style={{ background }}>
            <div className="bg-white rounded-lg shadow-sm p-4 max-w-xs mx-auto">
              <p className="text-sm font-semibold mb-2">{displayTitle || survey.name}</p>
              <div className="h-8 rounded-md border border-gray-200 mb-3" />
              <button
                type="button"
                className="w-full py-2 rounded-md text-white text-xs font-medium"
                style={{ background: primary }}
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


