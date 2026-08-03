import { useEffect, useState, useRef } from "react";
import headerBg from "@/assets/header-background.jpg";
import {
  Building2,
  Search,
  Plus,
  X,
  Upload,
  Loader2,
  CheckCircle2,
  XCircle,
  Settings2,
  Power,
  Trash2,
  Coins,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ImageCropper } from "@/components/ImageCropper";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/services/api";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  iconPath: string | null;
  isActive: boolean;
  isDev: boolean;
  maxAgents: number;
  createdAt: string;
}

export function AdminAccounts() {
  const { user } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "" });
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [nameStatus, setNameStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [cropperSrc, setCropperSrc] = useState<string | null>(null);
  const [cropperFileName, setCropperFileName] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tenant: Tenant } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [usersModalTenant, setUsersModalTenant] = useState<Tenant | null>(null);
  const [configModalTenant, setConfigModalTenant] = useState<Tenant | null>(null);
  const [configForm, setConfigForm] = useState({ name: '', maxAgents: 5, isDev: false });
  const [configLoading, setConfigLoading] = useState(false);
  const [billingForm, setBillingForm] = useState({ type: 'monthly' as 'monthly' | 'prepaid', monthlyCredits: 0, rollover: false });
  const [billingBalance, setBillingBalance] = useState<{ available: number; reserved: number } | null>(null);
  const [billingPlanExists, setBillingPlanExists] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState(0);
  const [rechargeModalTenant, setRechargeModalTenant] = useState<Tenant | null>(null);
  const [rechargeLoading, setRechargeLoading] = useState(false);
  const [rechargeValue, setRechargeValue] = useState(0);
  const [rechargeBalance, setRechargeBalance] = useState<number | null>(null);
  const [tenantMembers, setTenantMembers] = useState<{ id: string; userId: string; role: string; user: { id: string; name: string; email: string } }[]>([]);
  const [allUsers, setAllUsers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const fetchTenants = () => {
    api.get<Tenant[]>("/tenants").then(({ data }) => setTenants(data)).catch(() => {});
  };

  useEffect(() => { fetchTenants(); }, []);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    function handleClick(e: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent, tenant: Tenant) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, tenant });
  };

  const handleToggleActive = async (tenant: Tenant) => {
    setContextMenu(null);
    try {
      await api.put(`/tenants/${tenant.id}`, { isActive: !tenant.isActive });
      fetchTenants();
    } catch {}
  };

  const handleDeleteTenant = async (tenant: Tenant) => {
    setContextMenu(null);
    try {
      await api.delete(`/tenants/${tenant.id}`);
      fetchTenants();
    } catch {}
  };

  const openUsersModal = async (tenant: Tenant) => {
    setContextMenu(null);
    setUsersModalTenant(tenant);
    setMembersLoading(true);
    try {
      const [membersRes, usersRes] = await Promise.all([
        api.get(`/tenants/${tenant.id}/members`),
        api.get('/users'),
      ]);
      setTenantMembers(membersRes.data);
      setAllUsers(usersRes.data);
    } catch {} finally {
      setMembersLoading(false);
    }
  };

  const openConfigModal = async (tenant: Tenant) => {
    setContextMenu(null);
    setConfigModalTenant(tenant);
    setConfigForm({
      name: tenant.name,
      maxAgents: tenant.maxAgents ?? 5,
      isDev: tenant.isDev ?? false,
    });
    // Fetch billing info
    setBillingLoading(true);
    try {
      const { data } = await api.get(`/tenants/${tenant.id}/billing`);
      if (data.plan) {
        setBillingPlanExists(true);
        setBillingForm({
          type: data.plan.type,
          monthlyCredits: data.plan.monthlyCredits ?? 0,
          rollover: data.plan.rollover ?? false,
        });
      } else {
        setBillingPlanExists(false);
        setBillingForm({ type: 'monthly', monthlyCredits: 0, rollover: false });
      }
      setBillingBalance(data.balance ?? null);
    } catch {
      setBillingPlanExists(false);
      setBillingForm({ type: 'monthly', monthlyCredits: 0, rollover: false });
      setBillingBalance(null);
    } finally {
      setBillingLoading(false);
    }
    setRechargeAmount(0);
  };

  const openRechargeModal = async (tenant: Tenant) => {
    setContextMenu(null);
    setRechargeModalTenant(tenant);
    setRechargeValue(0);
    setRechargeBalance(null);
    try {
      const { data } = await api.get(`/tenants/${tenant.id}/billing/balance`);
      setRechargeBalance(data.available);
    } catch {
      setRechargeBalance(null);
    }
  };

  const handleRecharge = async () => {
    if (!rechargeModalTenant || rechargeValue < 1) return;
    setRechargeLoading(true);
    try {
      await api.post(`/tenants/${rechargeModalTenant.id}/billing/recharge`, {
        amount: rechargeValue,
      });
      setRechargeModalTenant(null);
    } catch {} finally {
      setRechargeLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!configModalTenant) return;
    setConfigLoading(true);
    try {
      await api.put(`/tenants/${configModalTenant.id}`, {
        name: configForm.name,
        maxAgents: configForm.maxAgents,
        isDev: configForm.isDev,
      });

      // Save billing plan
      if (billingPlanExists) {
        await api.patch(`/tenants/${configModalTenant.id}/billing/plan`, {
          type: billingForm.type,
          monthlyCredits: billingForm.monthlyCredits,
          rollover: billingForm.rollover,
        });
      } else {
        await api.post(`/tenants/${configModalTenant.id}/billing/plan`, {
          type: billingForm.type,
          monthlyCredits: billingForm.monthlyCredits,
          rollover: billingForm.rollover,
        });
        setBillingPlanExists(true);
      }

      fetchTenants();
      setConfigModalTenant(null);
    } catch {} finally {
      setConfigLoading(false);
    }
  };

  const handleAssignUser = async (userId: string, role: string) => {
    if (!usersModalTenant) return;
    try {
      await api.post(`/users/${userId}/tenants`, { tenantId: usersModalTenant.id, role });
      const { data } = await api.get(`/tenants/${usersModalTenant.id}/members`);
      setTenantMembers(data);
    } catch {}
  };

  const handleRemoveUser = async (userId: string) => {
    if (!usersModalTenant) return;
    try {
      await api.delete(`/users/${userId}/tenants/${usersModalTenant.id}`);
      setTenantMembers((prev) => prev.filter((m) => m.userId !== userId));
    } catch {}
  };

  const filteredTenants = tenants.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.slug.toLowerCase().includes(search.toLowerCase())
  );

  const generateSlug = (name: string) =>
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  const checkNameAvailability = async () => {
    const slug = generateSlug(form.name);
    if (!slug) {
      setNameStatus("idle");
      return;
    }
    setNameStatus("checking");
    try {
      const { data } = await api.get<{ available: boolean }>(`/tenants/check-slug/${slug}`);
      setNameStatus(data.available ? "available" : "taken");
    } catch {
      setNameStatus("idle");
    }
  };

  const handleIconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCropperSrc(URL.createObjectURL(file));
      setCropperFileName(file.name);
    }
    e.target.value = "";
  };

  const handleCropComplete = (croppedFile: File) => {
    setIconFile(croppedFile);
    setIconPreview(URL.createObjectURL(croppedFile));
    setCropperSrc(null);
    setCropperFileName("");
  };

  const handleCropCancel = () => {
    setCropperSrc(null);
    setCropperFileName("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nameStatus === "taken") return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("name", form.name);
      formData.append("slug", generateSlug(form.name));
      if (iconFile) formData.append("icon", iconFile);

      await api.post("/tenants", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setShowForm(false);
      resetForm();
      fetchTenants();
    } catch {
      // handle error
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm({ name: "" });
    setIconFile(null);
    setIconPreview(null);
    setNameStatus("idle");
    setCropperSrc(null);
    setCropperFileName("");
  };

  const getFileUrl = (path: string | null) => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return `/${path}`;
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Dark section */}
      <div
        className="px-8 pt-16 pb-6 shrink-0 rounded-b-2xl"
        style={{
          backgroundImage: `url(${headerBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Cuentas</h1>
          <Button
            onClick={() => setShowForm(true)}
            className="bg-brand-700 hover:bg-brand-600 text-white gap-2"
          >
            <Plus className="h-4 w-4" />
            Nueva Cuenta
          </Button>
        </div>
      </div>

      {/* Light section */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1, ease: 'easeOut' }} className="py-6 flex-1 min-h-0 overflow-auto">
        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar cuentas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* List or empty */}
        {filteredTenants.length === 0 && !showForm ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="h-16 w-16 rounded-full bg-brand-50 flex items-center justify-center mb-4">
                <Building2 className="h-7 w-7 text-brand-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Sin cuentas registradas
              </h3>
              <p className="text-gray-500 text-sm max-w-sm">
                Aún no hay cuentas creadas. Crea la primera cuenta para comenzar a gestionar organizaciones.
              </p>
              <Button
                onClick={() => setShowForm(true)}
                className="mt-6 bg-brand-700 hover:bg-brand-600 text-white gap-2"
              >
                <Plus className="h-4 w-4" />
                Crear primera cuenta
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTenants.map((tenant) => (
              <div
                key={tenant.id}
                onContextMenu={(e) => handleContextMenu(e, tenant)}
                className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {tenant.iconPath ? (
                      <div className="h-10 w-10 rounded-full bg-brand-800 flex items-center justify-center p-1.5">
                        <img
                          src={getFileUrl(tenant.iconPath)!}
                          alt=""
                          className="h-full w-full rounded-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-brand-800 flex items-center justify-center text-white text-sm font-bold">
                        {tenant.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <h3 className="font-semibold text-gray-900">{tenant.name}</h3>
                      <p className="text-xs text-gray-400">/{tenant.slug}</p>
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      tenant.isActive
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {tenant.isActive ? "Activa" : "Inactiva"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Context Menu */}
        {contextMenu && (
          <div
            ref={contextMenuRef}
            className="fixed z-50 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 animate-in fade-in zoom-in-95 duration-100"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <button
              onClick={() => openConfigModal(contextMenu.tenant)}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Settings2 className="h-4 w-4 text-gray-400" />
              Configurar
            </button>
            <button
              onClick={() => openUsersModal(contextMenu.tenant)}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Building2 className="h-4 w-4 text-gray-400" />
              Gestionar usuarios
            </button>
            <button
              onClick={() => openRechargeModal(contextMenu.tenant)}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Coins className="h-4 w-4 text-gray-400" />
              Cargar créditos
            </button>
            <button
              onClick={() => handleToggleActive(contextMenu.tenant)}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Power className="h-4 w-4 text-gray-400" />
              {contextMenu.tenant.isActive ? "Desactivar" : "Activar"}
            </button>
            <div className="border-t border-gray-100 my-1" />
            <button
              onClick={() => handleDeleteTenant(contextMenu.tenant)}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="h-4 w-4 text-red-400" />
              Eliminar
            </button>
          </div>
        )}

        {/* Create Form Modal */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4"
              onClick={() => { setShowForm(false); resetForm(); }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className="rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto border border-white/15 shadow-[0_0_15px_rgba(255,255,255,0.05)]"
                style={{
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.6) 100%)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between p-6 border-b border-gray-100">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Nueva Cuenta</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Configura una nueva cuenta para una organización</p>
                  </div>
                  <button
                    onClick={() => { setShowForm(false); resetForm(); }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                  {/* Nombre */}
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                      <Building2 size={18} />
                    </span>
                    <input
                      type="text"
                      id="orgName"
                      required
                      value={form.name}
                      onChange={(e) => {
                        setForm({ name: e.target.value });
                        setNameStatus("idle");
                      }}
                      onBlur={checkNameAvailability}
                      placeholder=" "
                      className={`peer w-full pl-11 pr-10 pt-5 pb-2 border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all bg-transparent ${
                        nameStatus === "taken"
                          ? "border-red-400"
                          : nameStatus === "available"
                          ? "border-green-400"
                          : "border-gray-300"
                      }`}
                    />
                    <label
                      htmlFor="orgName"
                      className="absolute left-11 top-1/2 -translate-y-1/2 text-sm text-gray-500 transition-all duration-200 pointer-events-none peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-xs peer-focus:text-brand-600 peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-xs"
                    >
                      Nombre de la organización
                    </label>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {nameStatus === "checking" && <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />}
                      {nameStatus === "available" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                      {nameStatus === "taken" && <XCircle className="h-4 w-4 text-red-500" />}
                    </div>
                  </div>
                  {nameStatus === "taken" && (
                    <p className="text-xs text-red-500 -mt-3">Este nombre ya está en uso</p>
                  )}
                  {form.name && nameStatus === "available" && (
                    <p className="text-xs text-gray-400 -mt-3">Identificador: <span className="font-mono">{generateSlug(form.name)}</span></p>
                  )}

                  {/* Icono */}
                  <div>
                    <label className="flex items-center gap-3 p-3 rounded-lg border-2 border-dashed border-gray-300 hover:border-brand-400 hover:bg-brand-50/50 cursor-pointer transition-colors">
                      {iconPreview ? (
                        <img src={iconPreview} alt="icon" className="h-10 w-10 rounded-lg object-cover border border-gray-200" />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                          <Upload className="h-4 w-4 text-gray-400" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-brand-600 truncate">
                          {iconPreview ? "Cambiar icono" : "Seleccionar icono"}
                        </p>
                        <p className="text-xs text-gray-400">Opcional · Cuadrado · PNG o JPG</p>
                      </div>
                      <input type="file" accept="image/*" onChange={handleIconChange} className="hidden" />
                    </label>
                  </div>

                  {/* Submit */}
                  <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => { setShowForm(false); resetForm(); }}
                      className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={loading || nameStatus === "taken" || nameStatus === "checking" || !form.name.trim()}
                      className="relative px-6 py-2.5 rounded-lg text-white font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden bg-brand-800 hover:bg-brand-700 shadow-lg border border-white/10"
                    >
                      <span className="absolute inset-0 rounded-lg bg-gradient-to-br from-white/20 via-white/5 to-transparent pointer-events-none" />
                      <span className="relative">{loading ? "Creando..." : "Crear Cuenta"}</span>
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Image Cropper */}
        <AnimatePresence>
          {cropperSrc && (
            <ImageCropper
              imageSrc={cropperSrc}
              fileName={cropperFileName}
              aspect={1}
              title="Recortar icono"
              onCropComplete={handleCropComplete}
              onCancel={handleCropCancel}
            />
          )}
        </AnimatePresence>
      </motion.div>

      {/* Config Modal */}
      <AnimatePresence>
        {configModalTenant && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4"
            onClick={() => setConfigModalTenant(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl shadow-2xl border border-white/30 p-6 max-h-[90vh] overflow-y-auto"
              style={{ background: 'rgba(255, 255, 255, 0.92)', backdropFilter: 'blur(20px)' }}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Configurar cuenta</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{configModalTenant.slug}</p>
                </div>
                <button onClick={() => setConfigModalTenant(null)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Form */}
              <div className="space-y-5">
                {/* Nombre */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Nombre</label>
                  <input
                    type="text"
                    value={configForm.name}
                    onChange={(e) => setConfigForm({ ...configForm, name: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  />
                </div>

                {/* Max Agentes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Máximo de agentes</label>
                  <input
                    type="number"
                    min={1}
                    value={configForm.maxAgents}
                    onChange={(e) => setConfigForm({ ...configForm, maxAgents: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-400 mt-1">Número máximo de agentes permitidos en esta cuenta</p>
                </div>

                {/* isDev toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-gray-50/50">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Cuenta de desarrollo</p>
                    <p className="text-xs text-gray-400 mt-0.5">Los webhooks se reenviarán al entorno de desarrollo</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfigForm({ ...configForm, isDev: !configForm.isDev })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      configForm.isDev ? 'bg-brand-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                        configForm.isDev ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Billing Section */}
                <div className="pt-4 border-t border-gray-200">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Plan de créditos</p>

                  {billingLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Plan type */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Tipo de plan</label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setBillingForm({ ...billingForm, type: 'monthly' })}
                            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                              billingForm.type === 'monthly'
                                ? 'border-brand-500 bg-brand-50 text-brand-700'
                                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            Mensual
                          </button>
                          <button
                            type="button"
                            onClick={() => setBillingForm({ ...billingForm, type: 'prepaid' })}
                            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                              billingForm.type === 'prepaid'
                                ? 'border-brand-500 bg-brand-50 text-brand-700'
                                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            Prepago
                          </button>
                        </div>
                      </div>

                      {/* Monthly credits (only for monthly) */}
                      {billingForm.type === 'monthly' && (
                        <>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Créditos mensuales</label>
                            <input
                              type="number"
                              min={0}
                              value={billingForm.monthlyCredits}
                              onChange={(e) => setBillingForm({ ...billingForm, monthlyCredits: parseInt(e.target.value) || 0 })}
                              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                            />
                            <p className="text-xs text-gray-400 mt-1">Créditos otorgados al inicio de cada mes</p>
                          </div>

                          {/* Rollover toggle */}
                          <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-gray-50/50">
                            <div>
                              <p className="text-sm font-medium text-gray-700">Acumular créditos</p>
                              <p className="text-xs text-gray-400 mt-0.5">Los créditos no usados se acumulan al renovar</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setBillingForm({ ...billingForm, rollover: !billingForm.rollover })}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                billingForm.rollover ? 'bg-brand-600' : 'bg-gray-300'
                              }`}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                                  billingForm.rollover ? 'translate-x-6' : 'translate-x-1'
                                }`}
                              />
                            </button>
                          </div>
                        </>
                      )}

                      {/* Balance display */}
                      {billingBalance && (
                        <div className="p-3 rounded-lg bg-brand-50 border border-brand-100">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-brand-800">Balance actual</p>
                            <p className="text-lg font-bold text-brand-700">{billingBalance.available.toLocaleString()}</p>
                          </div>
                          {billingBalance.reserved > 0 && (
                            <p className="text-xs text-brand-600 mt-1">Reservados: {billingBalance.reserved}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setConfigModalTenant(null)}
                  className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveConfig}
                  disabled={configLoading || !configForm.name.trim()}
                  className="relative px-6 py-2.5 rounded-lg text-white font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden bg-brand-800 hover:bg-brand-700 shadow-lg border border-white/10"
                >
                  <span className="absolute inset-0 rounded-lg bg-gradient-to-br from-white/20 via-white/5 to-transparent pointer-events-none" />
                  <span className="relative">{configLoading ? 'Guardando...' : 'Guardar'}</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Users Modal */}
      <AnimatePresence>
        {usersModalTenant && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4"
            onClick={() => setUsersModalTenant(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl shadow-2xl border border-white/30 p-6 max-h-[80vh] flex flex-col overflow-hidden"
              style={{ background: 'rgba(255, 255, 255, 0.92)', backdropFilter: 'blur(20px)' }}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4 shrink-0">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Gestionar usuarios</h3>
                  <p className="text-[11px] text-gray-400 mt-0.5">{usersModalTenant.name} · Asigna o quita usuarios de esta cuenta</p>
                </div>
                <button onClick={() => setUsersModalTenant(null)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {membersLoading ? (
                <div className="flex-1 flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
                  {/* Current members */}
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase mb-2">Usuarios asignados ({tenantMembers.length})</p>
                    {tenantMembers.length === 0 ? (
                      <p className="text-xs text-gray-400 py-3">Sin usuarios asignados</p>
                    ) : (
                      <div className="space-y-1.5">
                        {tenantMembers.map((m) => (
                          <div key={m.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
                            <div>
                              <p className="text-sm font-medium text-gray-800">{m.user.name}</p>
                              <p className="text-[11px] text-gray-400">{m.user.email} · {m.role === "admin" ? "Administrador" : "Agente"}</p>
                            </div>
                            <button
                              onClick={() => handleRemoveUser(m.userId)}
                              className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                            >
                              Quitar
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Add user */}
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase mb-2">Agregar usuario</p>
                    {(() => {
                      const availableUsers = allUsers.filter((u) => !tenantMembers.some((m) => m.userId === u.id));
                      if (availableUsers.length === 0) return <p className="text-xs text-gray-400 py-2">Todos los usuarios ya están asignados</p>;
                      return (
                        <div className="space-y-1.5">
                          {availableUsers.map((u) => (
                            <div key={u.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-dashed border-gray-200 hover:border-brand-300 hover:bg-brand-50/30 transition-colors">
                              <div>
                                <p className="text-sm font-medium text-gray-700">{u.name}</p>
                                <p className="text-[11px] text-gray-400">{u.email}</p>
                              </div>
                              <button
                                onClick={() => handleAssignUser(u.id, "agent")}
                                className="text-xs text-brand-600 hover:text-brand-800 px-2 py-1 rounded hover:bg-brand-50 transition-colors font-medium"
                              >
                                + Asignar
                              </button>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recharge Modal */}
      <AnimatePresence>
        {rechargeModalTenant && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4"
            onClick={() => setRechargeModalTenant(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl shadow-2xl border border-white/30 p-6"
              style={{ background: 'rgba(255, 255, 255, 0.92)', backdropFilter: 'blur(20px)' }}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Cargar créditos</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{rechargeModalTenant.name}</p>
                </div>
                <button onClick={() => setRechargeModalTenant(null)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Balance actual */}
              {rechargeBalance !== null && (
                <div className="p-3 rounded-lg bg-brand-50 border border-brand-100 mb-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-brand-800">Balance actual</p>
                    <p className="text-lg font-bold text-brand-700">{rechargeBalance.toLocaleString()}</p>
                  </div>
                </div>
              )}

              {/* Amount input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Créditos a cargar</label>
                <input
                  type="number"
                  min={1}
                  value={rechargeValue || ''}
                  placeholder="0"
                  onChange={(e) => setRechargeValue(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setRechargeModalTenant(null)}
                  className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleRecharge}
                  disabled={rechargeLoading || rechargeValue < 1}
                  className="relative px-6 py-2.5 rounded-lg text-white font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden bg-brand-800 hover:bg-brand-700 shadow-lg border border-white/10"
                >
                  <span className="absolute inset-0 rounded-lg bg-gradient-to-br from-white/20 via-white/5 to-transparent pointer-events-none" />
                  <span className="relative">{rechargeLoading ? 'Cargando...' : 'Cargar créditos'}</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
