import { useState } from "react";
import { FileSignature, FileText, FileSearch, Loader2, Pencil, Plus, Send, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/ConfirmModal";
import { reclutamientoApi, type SurveyorContract } from "@/services/reclutamiento";
import { ContractDocumentModal } from "./ContractDocumentModal";
import { ContractFormModal } from "./ContractFormModal";
import { SignContractModal } from "./SignContractModal";
import { ContractStatusBadge, SignatureBadge, primaryButton, secondaryButton } from "./shared";
import { formatDate, formatMoney } from "./format";

interface Props {
  tenantId: string;
  profileId: string;
  contracts: SurveyorContract[];
  /** Perfil terminado: solo lectura. */
  locked: boolean;
  onChanged: () => void;
}

export function ContractsPanel({ tenantId, profileId, contracts, locked, onChanged }: Props) {
  const [editing, setEditing] = useState<SurveyorContract | "new" | null>(null);
  const [signing, setSigning] = useState<SurveyorContract | null>(null);
  const [viewing, setViewing] = useState<SurveyorContract | null>(null);
  const [toEnd, setToEnd] = useState<SurveyorContract | null>(null);
  const [toDelete, setToDelete] = useState<SurveyorContract | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);

  const activate = async (c: SurveyorContract) => {
    setActivatingId(c.id);
    try {
      await reclutamientoApi.activateContract(tenantId, c.id);
      toast.success("Contrato activado");
      onChanged();
    } catch {
      /* el interceptor ya muestra el mensaje del servidor */
    } finally {
      setActivatingId(null);
    }
  };

  const [portalBusyId, setPortalBusyId] = useState<string | null>(null);
  const togglePortal = async (c: SurveyorContract) => {
    setPortalBusyId(c.id);
    try {
      if (c.sentToContactAt) {
        await reclutamientoApi.withdrawContractFromPortal(tenantId, c.id);
        toast.success("Contrato retirado del portal");
      } else {
        await reclutamientoApi.sendContractToPortal(tenantId, c.id);
        toast.success("Contrato disponible en el portal. Invita al encuestador si aún no lo hiciste.");
      }
      onChanged();
    } catch {
      /* el interceptor muestra el motivo */
    } finally {
      setPortalBusyId(null);
    }
  };

  const end = async () => {
    if (!toEnd) return;
    await reclutamientoApi.endContract(tenantId, toEnd.id);
    setToEnd(null);
    toast.success("Contrato terminado");
    onChanged();
  };

  const remove = async () => {
    if (!toDelete) return;
    await reclutamientoApi.deleteContract(tenantId, toDelete.id);
    setToDelete(null);
    toast.success("Borrador eliminado");
    onChanged();
  };

  return (
    <section className="rounded-xl border border-border bg-background">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Contratos</h3>
        {!locked && (
          <button type="button" onClick={() => setEditing("new")} className={`${primaryButton} ml-auto`}>
            <Plus className="h-3.5 w-3.5" /> Nuevo contrato
          </button>
        )}
      </header>

      {contracts.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">
          Sin contratos. Genera uno desde una plantilla, regístrale la firma y actívalo.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {contracts.map((c) => {
            const fromTemplate = !!c.templateId;
            const signatureRequired = fromTemplate;
            const needsSignature = signatureRequired && c.signatureStatus !== "signed";
            const isDraft = c.status === "draft";
            const signed = c.signatureStatus === "signed";
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                    {formatMoney(c.defaultRate, c.currency)} por respuesta
                    <ContractStatusBadge status={c.status} />
                    {fromTemplate && <SignatureBadge signed={signed} />}
                    {fromTemplate && c.sentToContactAt && !signed && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-800 dark:bg-sky-500/20 dark:text-sky-200">En el portal</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fromTemplate && <>{c.contractNumber} · {c.templateName} v{c.templateVersion} · </>}
                    {c.countryCode} · {formatDate(c.startDate)} → {c.endDate ? formatDate(c.endDate) : "sin fecha de fin"}
                  </p>
                  {!fromTemplate && <p className="text-[11px] text-muted-foreground">Contrato manual: el documento se gestiona fuera de la plataforma.</p>}
                  {c.notes && <p className="mt-1 text-xs text-muted-foreground">{c.notes}</p>}
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  {fromTemplate && (
                    <button type="button" onClick={() => setViewing(c)} className={secondaryButton}>
                      <FileSearch className="h-3.5 w-3.5" /> Ver documento
                    </button>
                  )}
                  {!locked && isDraft && fromTemplate && !signed && (
                    <button type="button" onClick={() => togglePortal(c)} disabled={portalBusyId === c.id} className={secondaryButton}>
                      {portalBusyId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : c.sentToContactAt ? <Undo2 className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
                      {c.sentToContactAt ? "Retirar del portal" : "Enviar al portal"}
                    </button>
                  )}
                  {!locked && isDraft && fromTemplate && !signed && (
                    <button type="button" onClick={() => setSigning(c)} className={secondaryButton}>
                      <FileSignature className="h-3.5 w-3.5" /> Registrar firma
                    </button>
                  )}
                  {!locked && isDraft && (
                    <>
                      <button
                        type="button"
                        onClick={() => activate(c)}
                        disabled={activatingId === c.id || needsSignature}
                        title={needsSignature ? "Registra la firma antes de activar" : undefined}
                        className={primaryButton}
                      >
                        {activatingId === c.id && <Loader2 className="h-3 w-3 animate-spin" />}
                        Activar
                      </button>
                      {!signed && (
                        <>
                          {!c.sentToContactAt && (
                          <button type="button" aria-label="Editar contrato" onClick={() => setEditing(c)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          )}
                          <button type="button" aria-label="Eliminar borrador" onClick={() => setToDelete(c)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-rose-500">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </>
                  )}
                  {!locked && c.status === "active" && (
                    <button type="button" onClick={() => setToEnd(c)} className={secondaryButton}>Terminar</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <ContractFormModal
          tenantId={tenantId}
          profileId={profileId}
          contract={editing === "new" ? null : editing}
          // Valores del último contrato como punto de partida de uno nuevo.
          template={contracts[0] ?? null}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast.success("Contrato guardado");
            onChanged();
          }}
        />
      )}

      {signing && (
        <SignContractModal
          tenantId={tenantId}
          contract={signing}
          onClose={() => setSigning(null)}
          onSaved={() => {
            setSigning(null);
            toast.success("Firma registrada");
            onChanged();
          }}
        />
      )}

      {viewing && <ContractDocumentModal tenantId={tenantId} contractId={viewing.id} onClose={() => setViewing(null)} />}

      <ConfirmModal
        open={!!toEnd}
        onClose={() => setToEnd(null)}
        onConfirm={end}
        title="Terminar contrato"
        description="El contrato dejará de estar vigente. Para volver a activar al encuestador necesitarás otro contrato activo."
        confirmLabel="Terminar contrato"
        variant="warning"
      />
      <ConfirmModal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        title="Eliminar borrador"
        description="Se eliminará este contrato en borrador. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        variant="danger"
      />
    </section>
  );
}
