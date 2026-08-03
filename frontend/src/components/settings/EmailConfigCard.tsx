import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  Mail,
  Save,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Copy,
  RefreshCw,
} from "lucide-react";
import { api } from "@/services/api";

interface EmailConfig {
  id: string;
  fromEmail: string;
  fromName: string;
  domain: string;
  domainStatus: "pending" | "verified" | "failed";
  verifiedAt: string | null;
}

interface DnsRecord {
  type: string;
  name: string;
  value: string;
  purpose: string;
}

interface VerifyResult {
  verified: boolean;
  results: { record: string; status: "ok" | "missing" | "error"; detail?: string }[];
}

export function EmailConfigCard() {
  const { slug } = useParams();
  const { user } = useAuth();
  const currentTenant = user?.tenantRoles?.find((tr) => tr.tenant.slug === slug);
  const tenantId = currentTenant?.tenantId;

  const [config, setConfig] = useState<EmailConfig | null>(null);
  const [dnsRecords, setDnsRecords] = useState<DnsRecord[]>([]);
  const [form, setForm] = useState({ fromEmail: "", fromName: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const fetchConfig = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/email-config/${tenantId}`);
      if (data) {
        setConfig(data);
        setForm({ fromEmail: data.fromEmail, fromName: data.fromName });
        fetchDnsRecords();
      }
    } catch {} finally {
      setLoading(false);
    }
  };

  const fetchDnsRecords = async () => {
    if (!tenantId) return;
    try {
      const { data } = await api.get(`/email-config/${tenantId}/dns-records`);
      setDnsRecords(data.records || []);
    } catch {}
  };

  useEffect(() => { fetchConfig(); }, [tenantId]);

  const handleSave = async () => {
    if (!tenantId || !form.fromEmail || !form.fromName) return;
    setSaving(true);
    try {
      const { data } = await api.post(`/email-config/${tenantId}`, form);
      setConfig(data);
      setVerifyResult(null);
      // Refetch DNS records for new domain
      const dnsRes = await api.get(`/email-config/${tenantId}/dns-records`);
      setDnsRecords(dnsRes.data.records || []);
    } catch {} finally {
      setSaving(false);
    }
  };

  const handleVerify = async () => {
    if (!tenantId) return;
    setVerifying(true);
    try {
      const { data } = await api.post<VerifyResult>(`/email-config/${tenantId}/verify`);
      setVerifyResult(data);
      if (data.verified) {
        setConfig((prev) => prev ? { ...prev, domainStatus: "verified", verifiedAt: new Date().toISOString() } : prev);
      } else {
        setConfig((prev) => prev ? { ...prev, domainStatus: "failed" } : prev);
      }
    } catch {} finally {
      setVerifying(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-orange-50 flex items-center justify-center">
          <Mail className="h-4.5 w-4.5 text-orange-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Configuración de Email</h3>
          <p className="text-xs text-gray-400">Configura el remitente y verifica tu dominio para enviar emails</p>
        </div>
        {config?.domainStatus === "verified" && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">
            <CheckCircle2 className="h-3 w-3" /> Verificado
          </span>
        )}
        {config?.domainStatus === "failed" && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-medium">
            <XCircle className="h-3 w-3" /> Falló
          </span>
        )}
        {config?.domainStatus === "pending" && config && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">
            <AlertCircle className="h-3 w-3" /> Pendiente
          </span>
        )}
      </div>

      <div className="p-5 space-y-5">
        {/* Form */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre del remitente</label>
            <input
              type="text"
              value={form.fromName}
              onChange={(e) => setForm({ ...form, fromName: e.target.value })}
              placeholder="Mi Empresa"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email del remitente</label>
            <input
              type="email"
              value={form.fromEmail}
              onChange={(e) => setForm({ ...form, fromEmail: e.target.value })}
              placeholder="comunicaciones@miempresa.com"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || !form.fromEmail || !form.fromName}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          Guardar
        </button>

        {/* DNS Records */}
        {config && dnsRecords.length > 0 && (
          <div className="pt-4 border-t border-gray-100">
            <h4 className="text-sm font-semibold text-gray-900 mb-1">Registros DNS</h4>
            <p className="text-xs text-gray-500 mb-4">
              Agrega estos registros en la configuración DNS de <code className="bg-gray-100 px-1 rounded">{config.domain}</code> para verificar tu dominio.
            </p>

            <div className="space-y-3">
              {dnsRecords.map((record, i) => (
                <div key={i} className="p-3 rounded-lg border border-gray-200 bg-gray-50/50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-700 font-mono font-bold">
                          {record.type}
                        </span>
                        <span className="text-xs text-gray-500">{record.purpose}</span>
                      </div>
                      <div className="mt-2 space-y-1">
                        <div>
                          <span className="text-[10px] font-medium text-gray-400 uppercase">Nombre</span>
                          <p className="text-xs font-mono text-gray-700 break-all">{record.name}</p>
                        </div>
                        <div>
                          <span className="text-[10px] font-medium text-gray-400 uppercase">Valor</span>
                          <p className="text-xs font-mono text-gray-700 break-all">{record.value}</p>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => copyToClipboard(record.value, `${i}`)}
                      className="shrink-0 p-1.5 rounded-md hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Copiar valor"
                    >
                      {copied === `${i}` ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Verify button */}
            <div className="mt-4">
              <button
                onClick={handleVerify}
                disabled={verifying}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-brand-300 text-brand-700 hover:bg-brand-50 text-xs font-medium transition-colors disabled:opacity-50"
              >
                {verifying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Verificar dominio
              </button>
            </div>

            {/* Verify results */}
            {verifyResult && (
              <div className={`mt-3 p-3 rounded-lg border ${verifyResult.verified ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                <p className={`text-xs font-medium mb-2 ${verifyResult.verified ? "text-green-800" : "text-red-800"}`}>
                  {verifyResult.verified ? "✓ Dominio verificado correctamente" : "✗ Verificación incompleta"}
                </p>
                <div className="space-y-1">
                  {verifyResult.results.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {r.status === "ok" ? (
                        <CheckCircle2 className="h-3 w-3 text-green-600 shrink-0" />
                      ) : (
                        <XCircle className="h-3 w-3 text-red-500 shrink-0" />
                      )}
                      <span className={r.status === "ok" ? "text-green-700" : "text-red-700"}>
                        {r.record}{r.detail ? ` — ${r.detail}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!config && (
          <div className="text-center py-4">
            <p className="text-xs text-gray-400">Ingresa tu email y nombre de remitente para ver los registros DNS necesarios.</p>
          </div>
        )}
      </div>
    </div>
  );
}
