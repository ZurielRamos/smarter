import { useEffect, useState } from "react";
import { Loader2, Printer, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { reclutamientoApi, type ContractDocument } from "@/services/reclutamiento";
import { ContractText } from "./TemplatePreview";
import { ModalShell, SignatureBadge, secondaryButton, primaryButton } from "./shared";
import { formatDate } from "./format";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Abre el contrato en una pestaña lista para imprimir o guardar como PDF. Todo el texto se escapa. */
function printContract(doc: ContractDocument) {
  const en = doc.languageCode === "en";
  const sig = doc.signature;
  const clauses = doc.clauses
    .map((c) => `${c.title ? `<h2>${en ? "Clause" : "Cláusula"} ${c.number}. ${esc(c.title)}</h2>` : ""}<p>${esc(c.body)}</p>`)
    .join("");
  const footer = [
    `${en ? "Contract" : "Contrato"} ${esc(doc.number ?? "")}`,
    `SHA-256: ${esc(doc.contentHash ?? "")}`,
    sig.status === "signed" && sig.evidence
      ? `${en ? "Signed" : "Firmado"}: ${esc(sig.signedAt ?? "")} · ${esc(sig.evidence.method)}${sig.evidence.reference ? ` · ${esc(sig.evidence.reference)}` : ""}`
      : en ? "Not signed" : "Sin firmar",
  ].join("<br>");
  const html = `<!doctype html><html lang="${doc.languageCode ?? "es"}"><head><meta charset="utf-8"><title>${esc(doc.number ?? "Contrato")}</title>
<style>body{font-family:Georgia,'Times New Roman',serif;max-width:760px;margin:40px auto;padding:0 24px;color:#111;line-height:1.55;font-size:13px}
h1{font-size:18px;text-align:center;margin:0 0 4px}.meta{text-align:center;color:#555;font-size:11px;margin-bottom:28px}
h2{font-size:12px;text-transform:uppercase;letter-spacing:.04em;margin:18px 0 4px}p{white-space:pre-wrap;text-align:justify;margin:0}
.foot{margin-top:32px;border-top:1px solid #ccc;padding-top:8px;font-size:10px;color:#666;word-break:break-all}
@media print{body{margin:0 auto}}</style></head><body>
<h1>${esc(doc.title ?? "")}</h1><div class="meta">${esc(doc.number ?? "")}</div>${clauses}<div class="foot">${footer}</div></body></html>`;

  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const win = window.open(url, "_blank");
  if (!win) {
    URL.revokeObjectURL(url);
    toast.error("Permite las ventanas emergentes para imprimir el contrato");
    return;
  }
  win.addEventListener("load", () => win.print());
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

export function ContractDocumentModal({ tenantId, contractId, onClose }: { tenantId: string; contractId: string; onClose: () => void }) {
  const [doc, setDoc] = useState<ContractDocument | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    reclutamientoApi
      .contractDocument(tenantId, contractId)
      .then(setDoc)
      .catch(() => setFailed(true));
  }, [tenantId, contractId]);

  return (
    <ModalShell title="Documento del contrato" onClose={onClose} wide>
      <div className="space-y-3 px-5 py-4">
        {!doc && !failed && <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Cargando" /></div>}
        {failed && <p className="text-sm text-muted-foreground">No se pudo cargar el documento.</p>}
        {doc && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-foreground">{doc.number}</span>
              <span className="text-muted-foreground">{doc.title} · v{doc.templateVersion}</span>
              <SignatureBadge signed={doc.signature.status === "signed"} />
              {doc.integrityOk ? (
                <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-300"><ShieldCheck className="h-3.5 w-3.5" /> Íntegro</span>
              ) : (
                <span role="alert" className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400"><ShieldAlert className="h-3.5 w-3.5" /> El texto no coincide con su huella</span>
              )}
              <button type="button" onClick={() => printContract(doc)} className={`${primaryButton} ml-auto`}>
                <Printer className="h-3.5 w-3.5" /> Imprimir / PDF
              </button>
            </div>

            <ContractText clauses={doc.clauses} language={doc.languageCode ?? "es"} />

            <dl className="space-y-1 rounded-lg bg-muted px-3 py-2 text-[11px] text-muted-foreground">
              <div><dt className="inline font-medium">Huella SHA-256: </dt><dd className="inline break-all font-mono">{doc.contentHash}</dd></div>
              {doc.signature.status === "signed" && doc.signature.evidence && (
                <div>
                  <dt className="inline font-medium">Firma: </dt>
                  <dd className="inline">
                    {formatDate(doc.signature.signedAt)} · {doc.signature.evidence.method}
                    {doc.signature.evidence.reference ? ` · ${doc.signature.evidence.reference}` : ""} · registrada por {doc.signature.evidence.registeredBy}
                  </dd>
                </div>
              )}
            </dl>
          </>
        )}
      </div>
      <div className="flex justify-end border-t border-border px-5 py-3">
        <button type="button" onClick={onClose} className={secondaryButton}>Cerrar</button>
      </div>
    </ModalShell>
  );
}
