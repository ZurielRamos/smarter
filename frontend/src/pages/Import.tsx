import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FileUploader } from "@/components/FileUploader";
import { DataPreview } from "@/components/DataPreview";
import { FieldMapper } from "@/components/FieldMapper";
import { motion } from "framer-motion";
import headerBg from "@/assets/header-background.jpg";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import {
  getTargetFields,
  uploadFile,
  getTemplateByStructure,
  getCustomFields,
  validatePreview,
  deduplicatePreview,
  executeImport,
  getImportJob,
} from "@/services/api";
import type {
  TargetField,
  ParseResult,
  MappingConfig,
  ImportJob,
  ValidationPreviewResult,
  DeduplicatePreviewResult,
  DeduplicateStrategy,
  ValidationRule,
} from "@/types";
import {
  CheckCircle,
  Upload,
  GitCompareArrows,
  AlertCircle,
  Eye,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Copy,
  Loader2,
  XCircle,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Step = "upload" | "preview" | "map" | "validate" | "deduplicate" | "processing" | "success";

export function Import() {
  const [step, setStep] = useState<Step>("upload");
  const [targetFields, setTargetFields] = useState<TargetField[]>([]);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [mapping, setMapping] = useState<MappingConfig>({});
  const [matchFields, setMatchFields] = useState<string[]>([]);
  const [deduplicateStrategy, setDeduplicateStrategy] = useState<DeduplicateStrategy>("merge_non_empty");
  const [overwriteFields, setOverwriteFields] = useState<string[]>([]);
  const [initialTransforms, setInitialTransforms] = useState<Record<string, any>>({});
  const [currentTransforms, setCurrentTransforms] = useState<Record<string, any>>({});
  const [validationResult, setValidationResult] = useState<ValidationPreviewResult | null>(null);
  const [deduplicateResult, setDeduplicateResult] = useState<DeduplicatePreviewResult | null>(null);
  const [importJob, setImportJob] = useState<ImportJob | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preloadedFields, setPreloadedFields] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const currentTenant = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const tenantId = currentTenant?.tenantId;

  useEffect(() => {
    async function loadFields() {
      try {
        const systemFields = await getTargetFields();
        if (tenantId) {
          const customFields = await getCustomFields(tenantId);
          const customTargetFields: TargetField[] = customFields
            .filter((f) => !f.isSystem && f.fieldType !== "computed")
            .map((f) => ({
              field: f.fieldKey,
              label: f.fieldLabel,
              required: f.isRequired,
              type: (f.fieldType === "select" ? "list" : f.fieldType) as any,
              allowMultiple: false,
              category: "Campos personalizados",
            }));
          setTargetFields([...systemFields, ...customTargetFields]);
        } else {
          setTargetFields(systemFields);
        }
      } catch {
        setError("No se pudo conectar con el servidor");
      }
    }
    loadFields();
  }, [tenantId]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleFileSelected = async (file: File) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await uploadFile(file);
      setParseResult(result);
      setStep("preview");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error al procesar el archivo";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoToMapping = async () => {
    const initialMapping: MappingConfig = {};
    targetFields.forEach((f) => { initialMapping[f.field] = []; });

    if (parseResult && tenantId) {
      try {
        const template = await getTemplateByStructure(tenantId, parseResult.headers);
        if (template) {
          const headers = new Set(parseResult.headers);
          let loaded = 0;
          for (const [field, sources] of Object.entries(template.mapping)) {
            if (!initialMapping.hasOwnProperty(field)) continue;
            const validSources = sources.filter((s) => headers.has(s));
            if (validSources.length > 0) {
              initialMapping[field] = validSources;
              loaded++;
            }
          }
          setPreloadedFields(loaded);
          if (template.transforms) setInitialTransforms(template.transforms);
        }
      } catch { /* silently fail */ }
    }

    setMapping(initialMapping);
    setStep("map");
  };

  const handleSubmitMapping = async (transforms?: Record<string, any>) => {
    if (!parseResult || !tenantId) return;
    setCurrentTransforms(transforms || {});
    setIsLoading(true);
    setError(null);
    try {
      const result = await validatePreview({
        fileId: parseResult.fileId,
        tenantId,
        mapping,
        transforms,
      });
      setValidationResult(result);
      setStep("validate");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error en la validación";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoToDeduplicate = async () => {
    if (!parseResult || !tenantId) return;
    if (matchFields.length === 0) {
      // Skip dedup, go directly to import
      await handleExecuteImport();
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await deduplicatePreview({
        fileId: parseResult.fileId,
        tenantId,
        mapping,
        transforms: currentTransforms,
        matchFields,
      });
      setDeduplicateResult(result);
      setStep("deduplicate");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error en la deduplicación";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecuteImport = async () => {
    if (!parseResult || !tenantId) return;
    setIsLoading(true);
    setError(null);
    setStep("processing");
    try {
      const job = await executeImport({
        tenantId,
        fileId: parseResult.fileId,
        mapping,
        transforms: currentTransforms,
        matchFields: matchFields.length > 0 ? matchFields : undefined,
        deduplicateStrategy: matchFields.length > 0 ? deduplicateStrategy : undefined,
        overwriteFields: deduplicateStrategy === 'overwrite_selected' ? overwriteFields : undefined,
        headers: parseResult.headers,
        templateName: "auto",
      });
      setImportJob(job);

      // If async (still pending/processing), poll for status
      if (!['completed', 'completed_with_errors', 'failed'].includes(job.status)) {
        pollRef.current = setInterval(async () => {
          try {
            const updated = await getImportJob(job.id);
            setImportJob(updated);
            if (['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(updated.status)) {
              if (pollRef.current) clearInterval(pollRef.current);
              pollRef.current = null;
              setStep("success");
            }
          } catch { /* ignore polling errors */ }
        }, 1500);
      } else {
        setStep("success");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error al ejecutar la importación";
      setError(message);
      setStep("validate");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setStep("upload");
    setParseResult(null);
    setMapping({});
    setImportJob(null);
    setValidationResult(null);
    setDeduplicateResult(null);
    setError(null);
    setPreloadedFields(0);
    setMatchFields([]);
    setCurrentTransforms({});
    if (pollRef.current) clearInterval(pollRef.current);
  };

  const steps = [
    { key: "upload", label: "Subir archivo", icon: Upload },
    { key: "preview", label: "Revisar datos", icon: Eye },
    { key: "map", label: "Mapear campos", icon: GitCompareArrows },
    { key: "validate", label: "Validar", icon: ShieldCheck },
    { key: "deduplicate", label: "Duplicados", icon: Copy },
    { key: "success", label: "Completado", icon: CheckCircle },
  ] as const;

  const stepKeys = steps.map((s) => s.key);
  const currentStepIdx = stepKeys.indexOf(step === "processing" ? "success" : step as any);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Dark section - title + stepper */}
      <div
        className="px-8 pt-16 pb-4 shrink-0 rounded-b-2xl"
        style={{ backgroundImage: `url(${headerBg})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`/${slug}/clients`)}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-white">Importar Datos</h1>
              <p className="text-brand-300 mt-0.5 text-sm">
                Pipeline ETL: sube, mapea, valida, deduplica y carga
              </p>
            </div>
          </div>

          {/* Stepper */}
          <div className="flex items-center gap-2 pl-11">
            {steps.map((s, idx) => {
              const Icon = s.icon;
              const isActive = s.key === step || (step === "processing" && s.key === "success");
              const isPast = currentStepIdx > idx;
              return (
                <div key={s.key} className="flex items-center gap-2">
                  <div className={cn(
                    "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                    isActive ? "bg-brand-600 text-white" : isPast ? "bg-accent-500/20 text-accent-300" : "bg-brand-800 text-brand-400"
                  )}>
                    <Icon className="h-3.5 w-3.5" />
                    <span>{s.label}</span>
                  </div>
                  {idx < steps.length - 1 && (
                    <div className={cn("w-5 h-0.5", isPast ? "bg-accent-400" : "bg-brand-700")} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Light section - content */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }} className="flex-1 min-h-0 flex flex-col py-4 overflow-hidden">
        <div className="bg-white rounded-xl border border-gray-200 flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm shrink-0 mx-4 mt-4">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Step: Upload */}
          {step === "upload" && (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-full max-w-xl">
                <FileUploader onFileSelected={handleFileSelected} isLoading={isLoading} />
              </div>
            </div>
          )}

          {/* Step: Preview */}
          {step === "preview" && parseResult && (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="flex-1 min-h-0 overflow-auto">
                <DataPreview headers={parseResult.headers} preview={parseResult.preview} totalRows={parseResult.totalRows} />
              </div>
              <div className="flex justify-end px-4 py-3 shrink-0 border-t border-gray-100">
                <Button onClick={handleGoToMapping} size="lg" className="gap-2 bg-brand-800 hover:bg-brand-700 text-white">
                  Continuar al mapeo <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step: Map */}
          {step === "map" && parseResult && (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              {preloadedFields > 0 && (
                <div className="p-2.5 bg-accent-50 border border-accent-200 rounded-lg text-sm text-accent-700 mb-3 shrink-0 mx-4 mt-4">
                  Se precargaron <strong>{preloadedFields}</strong> campos del mapeo anterior.
                </div>
              )}
              <div className="flex-1 min-h-0">
                <FieldMapper
                  targetFields={targetFields}
                  sourceHeaders={parseResult.headers}
                  preview={parseResult.preview}
                  mapping={mapping}
                  onMappingChange={setMapping}
                  onSubmit={handleSubmitMapping}
                  isLoading={isLoading}
                  matchField={matchFields[0] || "none"}
                  onMatchFieldChange={(field) => setMatchFields(field === "none" ? [] : [field])}
                  initialTransforms={initialTransforms}
                />
              </div>
            </div>
          )}

          {/* Step: Validate */}
          {step === "validate" && validationResult && (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="flex-1 min-h-0 overflow-auto p-6">
                {/* Summary cards */}
                <div className="grid grid-cols-4 gap-4 mb-6">
                  <div className="rounded-xl border border-gray-200 p-4 text-center">
                    <p className="text-2xl font-bold text-gray-800">{validationResult.totalRows.toLocaleString()}</p>
                    <p className="text-xs text-gray-500 mt-1">Filas totales</p>
                  </div>
                  <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
                    <p className="text-2xl font-bold text-green-600">{validationResult.valid}</p>
                    <p className="text-xs text-green-600 mt-1">Válidas</p>
                  </div>
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
                    <p className="text-2xl font-bold text-red-600">{validationResult.invalid}</p>
                    <p className="text-xs text-red-600 mt-1">Con errores</p>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
                    <p className="text-2xl font-bold text-amber-600">{validationResult.warnings}</p>
                    <p className="text-xs text-amber-600 mt-1">Advertencias</p>
                  </div>
                </div>

                {validationResult.invalid === 0 && validationResult.warnings === 0 && (
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border border-green-200 mb-6">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <p className="text-sm text-green-700 font-medium">Todos los registros pasaron la validación correctamente.</p>
                  </div>
                )}

                {/* Error table */}
                {validationResult.errors.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-red-500" /> Errores ({validationResult.errors.length})
                    </h3>
                    <div className="rounded-lg border border-red-100 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-red-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-gray-600 font-medium">Fila</th>
                            <th className="px-3 py-2 text-left text-gray-600 font-medium">Campo</th>
                            <th className="px-3 py-2 text-left text-gray-600 font-medium">Error</th>
                            <th className="px-3 py-2 text-left text-gray-600 font-medium">Valor</th>
                            <th className="px-3 py-2 text-left text-gray-600 font-medium">Sugerencia</th>
                          </tr>
                        </thead>
                        <tbody>
                          {validationResult.errors.slice(0, 20).map((err, idx) => (
                            <tr key={idx} className="border-t border-red-50">
                              <td className="px-3 py-2 font-mono text-gray-500">#{err.rowNumber}</td>
                              <td className="px-3 py-2 font-medium text-gray-700">{err.field}</td>
                              <td className="px-3 py-2 text-red-600">{err.message}</td>
                              <td className="px-3 py-2 text-gray-500 font-mono">{err.originalValue || "—"}</td>
                              <td className="px-3 py-2 text-green-600 font-mono">{err.suggestedValue || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {validationResult.errors.length > 20 && (
                        <div className="px-3 py-2 bg-red-50 text-xs text-red-500 text-center">
                          ...y {validationResult.errors.length - 20} errores más
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Warnings table */}
                {validationResult.warnings.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" /> Advertencias ({validationResult.warnings.length})
                    </h3>
                    <div className="rounded-lg border border-amber-100 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-amber-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-gray-600 font-medium">Fila</th>
                            <th className="px-3 py-2 text-left text-gray-600 font-medium">Campo</th>
                            <th className="px-3 py-2 text-left text-gray-600 font-medium">Advertencia</th>
                            <th className="px-3 py-2 text-left text-gray-600 font-medium">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {validationResult.warnings.slice(0, 10).map((w, idx) => (
                            <tr key={idx} className="border-t border-amber-50">
                              <td className="px-3 py-2 font-mono text-gray-500">#{w.rowNumber}</td>
                              <td className="px-3 py-2 font-medium text-gray-700">{w.field}</td>
                              <td className="px-3 py-2 text-amber-600">{w.message}</td>
                              <td className="px-3 py-2 text-gray-500 font-mono">{w.originalValue || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Dedup field selector - always show */}
                <div className="mt-6 p-4 rounded-xl bg-blue-50 border border-blue-200">
                  <p className="text-sm font-medium text-blue-800 mb-1">Detección de duplicados</p>
                  <p className="text-xs text-blue-600 mb-3">Selecciona un campo para detectar contactos que ya existen en la base de datos.</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setMatchFields([])}
                      className={cn(
                        "px-3 py-2 rounded-lg border text-xs font-medium transition-colors",
                        matchFields.length === 0 ? "border-blue-400 bg-white text-blue-700" : "border-blue-100 bg-white/50 text-gray-600 hover:bg-white"
                      )}
                    >
                      No verificar
                    </button>
                    {targetFields.filter((f) => Object.keys(mapping).includes(f.field) && (mapping[f.field]?.length > 0)).map((f) => (
                      <button
                        key={f.field}
                        type="button"
                        onClick={() => setMatchFields([f.field])}
                        className={cn(
                          "px-3 py-2 rounded-lg border text-xs font-medium transition-colors",
                          matchFields[0] === f.field ? "border-blue-400 bg-white text-blue-700" : "border-blue-100 bg-white/50 text-gray-600 hover:bg-white"
                        )}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Strategy selector */}
                {matchFields.length > 0 && (
                  <div className="mt-4 p-4 rounded-xl bg-indigo-50 border border-indigo-200">
                    <p className="text-sm font-medium text-indigo-800 mb-2">Estrategia para duplicados</p>
                    <p className="text-xs text-indigo-600 mb-3">Si se detectan contactos duplicados, ¿qué hacer?</p>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { value: 'merge_non_empty', label: 'Completar vacíos', desc: 'Solo llenar campos que estén vacíos' },
                        { value: 'overwrite', label: 'Sobrescribir todo', desc: 'Reemplazar todos los campos con datos nuevos' },
                        { value: 'overwrite_selected', label: 'Sobrescribir campos', desc: 'Elegir qué campos actualizar' },
                        { value: 'keep_existing', label: 'Mantener existente', desc: 'No modificar duplicados' },
                        { value: 'append_tags', label: 'Fusionar tags', desc: 'Combinar etiquetas y completar vacíos' },
                      ] as const).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setDeduplicateStrategy(opt.value)}
                          className={cn(
                            "text-left p-3 rounded-lg border transition-colors",
                            deduplicateStrategy === opt.value ? "border-indigo-400 bg-white" : "border-indigo-100 hover:bg-white"
                          )}
                        >
                          <p className={cn("text-xs font-medium", deduplicateStrategy === opt.value ? "text-indigo-700" : "text-gray-700")}>{opt.label}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">{opt.desc}</p>
                        </button>
                      ))}
                    </div>

                    {/* Field selector for overwrite_selected */}
                    {deduplicateStrategy === 'overwrite_selected' && (
                      <div className="mt-3 p-3 rounded-lg bg-white border border-indigo-200">
                        <p className="text-xs font-medium text-gray-700 mb-2">Campos a sobrescribir:</p>
                        <div className="flex flex-wrap gap-2">
                          {targetFields
                            .filter((f) => mapping[f.field]?.length > 0 && !matchFields.includes(f.field))
                            .map((f) => {
                              const isSelected = overwriteFields.includes(f.field);
                              return (
                                <button
                                  key={f.field}
                                  type="button"
                                  onClick={() => {
                                    if (isSelected) {
                                      setOverwriteFields(overwriteFields.filter((x) => x !== f.field));
                                    } else {
                                      setOverwriteFields([...overwriteFields, f.field]);
                                    }
                                  }}
                                  className={cn(
                                    "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                                    isSelected
                                      ? "bg-indigo-100 border-indigo-400 text-indigo-700"
                                      : "bg-gray-50 border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600"
                                  )}
                                >
                                  {isSelected && <span className="mr-1">✓</span>}
                                  {f.label}
                                </button>
                              );
                            })}
                        </div>
                        {overwriteFields.length === 0 && (
                          <p className="text-[10px] text-amber-600 mt-2">Selecciona al menos un campo para sobrescribir</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between px-6 py-3 shrink-0 border-t border-gray-100">
                <Button variant="ghost" onClick={() => setStep("map")} className="gap-2 text-gray-600">
                  <ArrowLeft className="h-4 w-4" /> Volver al mapeo
                </Button>
                <div className="flex items-center gap-3">
                  {validationResult.invalid > 0 && (
                    <p className="text-xs text-amber-600">
                      Los {validationResult.invalid} registros con errores se omitirán
                    </p>
                  )}
                  <Button onClick={handleGoToDeduplicate} size="lg" className="gap-2 bg-brand-800 hover:bg-brand-700 text-white">
                    {matchFields.length > 0 ? "Verificar duplicados" : "Importar ahora"}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Step: Deduplicate */}
          {step === "deduplicate" && deduplicateResult && (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="flex-1 min-h-0 overflow-auto p-6">
                {/* Summary */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="rounded-xl border border-gray-200 p-4 text-center">
                    <p className="text-2xl font-bold text-gray-800">{deduplicateResult.totalRows.toLocaleString()}</p>
                    <p className="text-xs text-gray-500 mt-1">Filas en archivo</p>
                    {deduplicateResult.isEstimate && (
                      <p className="text-[10px] text-gray-400 mt-0.5">Muestra: {deduplicateResult.totalSample} filas</p>
                    )}
                  </div>
                  <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
                    <p className="text-2xl font-bold text-green-600">~{deduplicateResult.new.toLocaleString()}</p>
                    <p className="text-xs text-green-600 mt-1">Nuevos registros</p>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
                    <p className="text-2xl font-bold text-amber-600">~{deduplicateResult.duplicatesCount.toLocaleString()}</p>
                    <p className="text-xs text-amber-600 mt-1">Duplicados{deduplicateResult.isEstimate ? " (estimado)" : ""}</p>
                    {deduplicateResult.isEstimate && (
                      <p className="text-[10px] text-amber-500 mt-0.5">{deduplicateResult.sampleDupRate}% tasa de duplicación</p>
                    )}
                  </div>
                </div>

                {deduplicateResult.duplicates.length === 0 && (
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border border-green-200 mb-6">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <p className="text-sm text-green-700 font-medium">No se detectaron duplicados en la muestra analizada.</p>
                  </div>
                )}

                {/* Duplicates detail */}
                {deduplicateResult.duplicates.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <Copy className="h-4 w-4 text-amber-500" /> Muestra de duplicados detectados
                    </h3>
                    <div className="space-y-2">
                      {deduplicateResult.duplicates.map((dup, idx) => (
                        <div key={idx} className="rounded-lg border border-amber-100 p-3 bg-amber-50/50">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-mono text-gray-500">Fila #{dup.rowNumber}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                              Match: {dup.matchedOn.join(", ")} ({Math.round(dup.confidence * 100)}%)
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div>
                              <p className="text-[10px] text-gray-400 uppercase mb-1">Entrante</p>
                              <p className="text-gray-700">{String(dup.incoming.firstName || "")} {String(dup.incoming.lastName || "")}</p>
                              <p className="text-gray-500 font-mono">{String(dup.incoming.phone || dup.incoming.email || "—")}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-400 uppercase mb-1">Existente en BD</p>
                              <p className="text-gray-700">{dup.existing.firstName} {dup.existing.lastName}</p>
                              <p className="text-gray-500 font-mono">{dup.existing.phone || dup.existing.email || "—"}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {deduplicateResult.duplicatesCount > deduplicateResult.duplicates.length && (
                      <p className="text-xs text-gray-400 mt-3 text-center italic">
                        Se muestran {deduplicateResult.duplicates.length} ejemplos de ~{deduplicateResult.duplicatesCount.toLocaleString()} duplicados estimados.
                        La deduplicación completa se ejecutará al importar.
                      </p>
                    )}
                  </div>
                )}

                {/* Strategy reminder */}
                <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-100">
                  <p className="text-xs text-blue-700">
                    <strong>Estrategia seleccionada:</strong>{" "}
                    {deduplicateStrategy === "merge_non_empty" && "Completar campos vacíos"}
                    {deduplicateStrategy === "overwrite" && "Sobrescribir con datos nuevos"}
                    {deduplicateStrategy === "keep_existing" && "Mantener registros existentes sin cambios"}
                    {deduplicateStrategy === "append_tags" && "Fusionar tags y completar vacíos"}
                    {deduplicateStrategy === "overwrite_selected" && `Sobrescribir: ${overwriteFields.join(", ") || "ninguno"}`}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between px-6 py-3 shrink-0 border-t border-gray-100">
                <Button variant="ghost" onClick={() => setStep("validate")} className="gap-2 text-gray-600">
                  <ArrowLeft className="h-4 w-4" /> Volver
                </Button>
                <Button onClick={handleExecuteImport} size="lg" className="gap-2 bg-brand-800 hover:bg-brand-700 text-white">
                  Ejecutar importación <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step: Processing */}
          {step === "processing" && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md">
                <Loader2 className="h-12 w-12 text-brand-600 animate-spin mx-auto mb-4" />
                <h2 className="text-xl font-bold text-gray-800 mb-2">Procesando importación...</h2>
                {importJob && (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-500">
                      Fase: <span className="font-medium text-gray-700">{importJob.currentPhase || "iniciando"}</span>
                    </p>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-brand-600 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${importJob.progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400">{importJob.progress}% completado</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step: Success */}
          {step === "success" && importJob && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center py-10 px-8 rounded-xl max-w-lg w-full">
                {importJob.status === "failed" ? (
                  <>
                    <XCircle className="h-14 w-14 text-red-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-red-600">Importación fallida</h2>
                    <p className="text-sm text-gray-600 mt-2">{importJob.errorMessage || "Error desconocido"}</p>
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-14 w-14 text-accent-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-accent-600">
                      {importJob.status === "completed_with_errors" ? "Importación con advertencias" : "Importación Exitosa"}
                    </h2>
                  </>
                )}

                {/* Metrics */}
                {importJob.status !== "failed" && (
                  <div className="grid grid-cols-3 gap-3 mt-6">
                    <div className="rounded-lg bg-green-50 border border-green-200 p-3">
                      <p className="text-xl font-bold text-green-600">{importJob.createdRecords}</p>
                      <p className="text-[10px] text-green-600 uppercase mt-1">Creados</p>
                    </div>
                    <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
                      <p className="text-xl font-bold text-blue-600">{importJob.updatedRecords}</p>
                      <p className="text-[10px] text-blue-600 uppercase mt-1">Actualizados</p>
                    </div>
                    <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                      <p className="text-xl font-bold text-gray-600">{importJob.skippedRecords + importJob.errorRows}</p>
                      <p className="text-[10px] text-gray-500 uppercase mt-1">Omitidos</p>
                    </div>
                  </div>
                )}

                {importJob.durationMs && (
                  <p className="text-xs text-gray-400 mt-4 flex items-center justify-center gap-1">
                    <Clock className="h-3 w-3" />
                    Completado en {(importJob.durationMs / 1000).toFixed(1)}s
                  </p>
                )}

                <div className="flex gap-3 justify-center mt-6">
                  <Button onClick={handleReset} variant="outline" size="lg">Subir otro archivo</Button>
                  <Button onClick={() => navigate(`/${slug}/clients`)} size="lg" className="bg-brand-800 hover:bg-brand-700 text-white">
                    Ver contactos
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
