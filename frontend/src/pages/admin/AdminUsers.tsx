import { useEffect, useState, useRef } from "react";
import headerBg from "@/assets/header-background.jpg";
import {
  Users,
  Search,
  Plus,
  X,
  ShieldCheck,
  Building2,
  Loader2,
  CheckCircle2,
  XCircle,
  Check,
  ChevronDown,
  Crown,
  Pencil,
  Eye,
  Info,
  Ban,
  Archive,
  UserCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });

interface Tenant {
  id: string;
  name: string;
  slug: string;
}

interface UserTenantRole {
  id: string;
  tenantId: string;
  role: string;
  tenant: Tenant;
}

interface UserItem {
  id: string;
  name: string;
  email: string;
  isSuperAdmin: boolean;
  isActive: boolean;
  tenantRoles: UserTenantRole[];
  createdAt: string;
}



export function AdminUsers() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    isSuperAdmin: false,
    tenantRoles: [] as { tenantId: string; role: string }[],
  });
  const [loading, setLoading] = useState(false);
  const [emailStatus, setEmailStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; user: UserItem } | null>(null);
  const [tenantsModal, setTenantsModal] = useState<UserItem | null>(null);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", password: "", isSuperAdmin: false });

  const fetchUsers = () => {
    api.get<UserItem[]>("/users").then(({ data }) => setUsers(data)).catch(() => {});
  };

  const fetchTenants = () => {
    api.get<Tenant[]>("/tenants").then(({ data }) => setTenants(data)).catch(() => {});
  };

  useEffect(() => {
    fetchUsers();
    fetchTenants();
  }, []);

  // Close context menu on click anywhere
  useEffect(() => {
    const close = () => setContextMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  const checkEmailAvailability = async () => {
    if (!form.email || !form.email.includes("@")) {
      setEmailStatus("idle");
      return;
    }
    setEmailStatus("checking");
    try {
      const { data } = await api.get<{ available: boolean }>(`/users/check-email/${form.email}`);
      setEmailStatus(data.available ? "available" : "taken");
    } catch {
      setEmailStatus("idle");
    }
  };

  const addTenantRole = () => {
    if (tenants.length === 0) return;
    setForm((f) => ({
      ...f,
      tenantRoles: [...f.tenantRoles, { tenantId: tenants[0].id, role: "agent" }],
    }));
  };

  const removeTenantRole = (index: number) => {
    setForm((f) => ({
      ...f,
      tenantRoles: f.tenantRoles.filter((_, i) => i !== index),
    }));
  };

  const updateTenantRole = (index: number, field: "tenantId" | "role", value: string) => {
    setForm((f) => ({
      ...f,
      tenantRoles: f.tenantRoles.map((tr, i) => (i === index ? { ...tr, [field]: value } : tr)),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (emailStatus === "taken") return;
    setLoading(true);
    try {
      await api.post("/users", form);
      setShowForm(false);
      resetForm();
      fetchUsers();
    } catch {
      // handle error
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm({ name: "", email: "", password: "", isSuperAdmin: false, tenantRoles: [] });
    setEmailStatus("idle");
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
          <h1 className="text-2xl font-bold text-white">Usuarios</h1>
          <Button
            onClick={() => setShowForm(true)}
            className="bg-brand-800 hover:bg-brand-700 text-white gap-2"
          >
            <Plus className="h-4 w-4" />
            Nuevo Usuario
          </Button>
        </div>
      </div>

      {/* Light section */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1, ease: 'easeOut' }} className="py-6 flex-1 min-h-0 overflow-auto">
        {/* Search */}
        <div className="mb-6 px-8">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar usuarios..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Users list or empty state */}
        {filteredUsers.length === 0 && !showForm ? (
          <div className="mx-8 bg-white rounded-xl border border-gray-200 p-12">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="h-16 w-16 rounded-full bg-brand-50 flex items-center justify-center mb-4">
                <Users className="h-7 w-7 text-brand-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Sin usuarios registrados
              </h3>
              <p className="text-gray-500 text-sm max-w-sm">
                No hay usuarios registrados aún. Crea el primer usuario para
                comenzar a gestionar la plataforma.
              </p>
              <Button
                onClick={() => setShowForm(true)}
                className="mt-6 bg-brand-800 hover:bg-brand-700 text-white gap-2"
              >
                <Plus className="h-4 w-4" />
                Crear primer usuario
              </Button>
            </div>
          </div>
        ) : (
          <div className="px-8">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Usuario</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Tipo</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Cuentas</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr
                      key={user.id}
                      className={`border-b border-gray-50 cursor-default transition-colors ${
                        contextMenu?.user.id === user.id ? "bg-brand-50" : "hover:bg-gray-50/50"
                      }`}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setContextMenu({ x: e.clientX, y: e.clientY, user });
                      }}
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-brand-100 flex items-center justify-center text-xs font-bold text-brand-700">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{user.name}</p>
                            <p className="text-xs text-gray-400">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        {user.isSuperAdmin ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                            <ShieldCheck className="h-3 w-3" />
                            Super Admin
                          </span>
                        ) : (
                          <span className="text-xs text-gray-500">Usuario</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {user.tenantRoles.length === 0 ? (
                          <span className="text-xs text-gray-400">Sin cuentas</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {user.tenantRoles.map((tr) => (
                              <span
                                key={tr.id}
                                className="inline-flex items-center gap-1 text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full"
                              >
                                <Building2 className="h-3 w-3" />
                                {tr.tenant?.name || "—"} · {tr.role === "admin" ? "Administrador" : "Agente"}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            user.isActive
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {user.isActive ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Context Menu */}
        <AnimatePresence>
          {contextMenu && (
            <motion.div
              initial={{ opacity: 0, scale: 0.75 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.75 }}
              transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
              className="fixed z-[100] bg-white rounded-lg shadow-lg border border-gray-200 py-1 w-48 origin-top-left"
              style={{ top: contextMenu.y, left: contextMenu.x }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-3 py-1.5 border-b border-gray-100 mb-1">
                <p className="text-xs font-medium text-gray-900 truncate">{contextMenu.user.name}</p>
                <p className="text-xs text-gray-400 truncate">{contextMenu.user.email}</p>
              </div>
              <button
                className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                onClick={() => setContextMenu(null)}
              >
                <Info className="h-4 w-4 text-brand-500" />
                Ver detalles
              </button>
              <button
                className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                onClick={() => {
                  setEditingUser(contextMenu.user);
                  setEditForm({
                    name: contextMenu.user.name,
                    email: contextMenu.user.email,
                    password: "",
                    isSuperAdmin: contextMenu.user.isSuperAdmin,
                  });
                  setContextMenu(null);
                }}
              >
                <Pencil className="h-4 w-4 text-blue-500" />
                Editar
              </button>
              <button
                className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                onClick={() => {
                  setTenantsModal(contextMenu.user);
                  setContextMenu(null);
                }}
              >
                <Building2 className="h-4 w-4 text-accent-500" />
                Administrar cuentas
              </button>
              <div className="border-t border-gray-100 my-1" />
              <button
                className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-amber-700 hover:bg-amber-50 transition-colors"
                onClick={() => setContextMenu(null)}
              >
                <Ban className="h-4 w-4" />
                {contextMenu.user.isActive ? "Inhabilitar" : "Habilitar"}
              </button>
              <button
                className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                onClick={() => setContextMenu(null)}
              >
                <Archive className="h-4 w-4" />
                Archivar
              </button>
            </motion.div>
          )}
        </AnimatePresence>

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
                className="rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-white/30 shadow-2xl bg-white/80"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between p-6 border-b border-gray-100">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Nuevo Usuario</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Completa la información para crear un nuevo acceso</p>
                  </div>
                  <button
                    onClick={() => { setShowForm(false); resetForm(); }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                  {/* === SECCIÓN: Información personal === */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                      <div className="h-6 w-6 rounded-full bg-brand-100 flex items-center justify-center">
                        <Users className="h-3.5 w-3.5 text-brand-600" />
                      </div>
                      Información personal
                    </div>

                    <div className="pl-8 space-y-4">
                      {/* Nombre + Email en grid */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Nombre completo
                          </label>
                          <input
                            type="text"
                            required
                            value={form.name}
                            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                            placeholder="Juan Pérez"
                            className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Correo electrónico
                          </label>
                          <div className="relative">
                            <input
                              type="email"
                              required
                              value={form.email}
                              onChange={(e) => {
                                setForm((f) => ({ ...f, email: e.target.value }));
                                setEmailStatus("idle");
                              }}
                              onBlur={checkEmailAvailability}
                              placeholder="juan@empresa.com"
                              className={`w-full px-3 py-2.5 pr-10 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 ${
                                emailStatus === "taken"
                                  ? "border-red-300 focus:ring-red-400"
                                  : emailStatus === "available"
                                  ? "border-green-300 focus:ring-green-400"
                                  : "border-gray-200"
                              }`}
                            />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                              {emailStatus === "checking" && <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />}
                              {emailStatus === "available" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                              {emailStatus === "taken" && <XCircle className="h-4 w-4 text-red-500" />}
                            </div>
                          </div>
                          {emailStatus === "taken" && (
                            <p className="text-xs text-red-500 mt-1">Este correo ya está registrado</p>
                          )}
                        </div>
                      </div>

                      {/* Password + Super Admin en grid */}
                      <div className="grid grid-cols-2 gap-4 items-end">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Contraseña
                          </label>
                          <input
                            type="password"
                            required
                            value={form.password}
                            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                            placeholder="Mínimo 6 caracteres"
                            minLength={6}
                            className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
                          />
                          <p className="text-xs text-gray-400 mt-1">El usuario podrá cambiarla después</p>
                        </div>

                        <div>
                          <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:border-amber-300 hover:bg-amber-50/30 cursor-pointer transition-colors">
                            <input
                              type="checkbox"
                              checked={form.isSuperAdmin}
                              onChange={(e) => setForm((f) => ({ ...f, isSuperAdmin: e.target.checked }))}
                              className="h-4 w-4 mt-0.5 rounded border-gray-300 text-accent-500 focus:ring-accent-500"
                            />
                            <div>
                              <p className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
                                <ShieldCheck className="h-3.5 w-3.5 text-amber-500" />
                                Super Admin
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">Panel de administración</p>
                            </div>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* === SECCIÓN: Cuentas asignadas === */}
                  <div className="space-y-4 border-t border-gray-100 pt-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                        <div className="h-6 w-6 rounded-full bg-accent-100 flex items-center justify-center">
                          <Building2 className="h-3.5 w-3.5 text-accent-600" />
                        </div>
                        Cuentas asignadas
                      </div>
                      <button
                        type="button"
                        onClick={addTenantRole}
                        disabled={tenants.length === 0}
                        className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Plus className="h-3.5 w-3.5" /> Agregar cuenta
                      </button>
                    </div>

                    <div className="pl-8">
                      {form.tenantRoles.length === 0 ? (
                        <div className="text-center py-5 border-2 border-dashed border-gray-200 rounded-lg">
                          <Building2 className="h-7 w-7 text-gray-300 mx-auto mb-2" />
                          <p className="text-sm text-gray-400">Sin cuentas asignadas</p>
                          <p className="text-xs text-gray-300 mt-0.5">
                            Define a qué cuentas tendrá acceso y con qué rol
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {form.tenantRoles.map((tr, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 border border-gray-100"
                            >
                              <TenantAutocomplete
                                tenants={tenants}
                                value={tr.tenantId}
                                onChange={(val) => updateTenantRole(index, "tenantId", val)}
                              />
                              <RoleSelector
                                value={tr.role}
                                onChange={(val) => updateTenantRole(index, "role", val)}
                              />
                              <button
                                type="button"
                                onClick={() => removeTenantRole(index)}
                                className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 shrink-0"
                                title="Quitar acceso"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ))}

                          <div className="flex flex-wrap gap-2 text-xs mt-2">
                            <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">Administrador — control total</span>
                            <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">Agente — gestión de conversaciones</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Submit */}
                  <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => { setShowForm(false); resetForm(); }}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      disabled={loading || emailStatus === "taken" || emailStatus === "checking"}
                      className="bg-brand-800 hover:bg-brand-700 text-white"
                    >
                      {loading ? "Creando..." : "Crear Usuario"}
                    </Button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Manage Tenants Modal */}
        <AnimatePresence>
          {tenantsModal && (
            <TenantsManagementModal
              user={tenantsModal}
              tenants={tenants}
              onClose={() => { setTenantsModal(null); fetchUsers(); }}
            />
          )}
        </AnimatePresence>

        {/* Edit User Modal */}
        <AnimatePresence>
          {editingUser && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/40 z-50"
                onClick={() => setEditingUser(null)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4"
              >
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                  {/* Header */}
                  <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Editar Usuario</h3>
                      <p className="text-sm text-gray-500 mt-0.5">Modifica la información del usuario</p>
                    </div>
                    <button onClick={() => setEditingUser(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="px-6 py-6 space-y-6">
                    {/* Información personal */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                        <div className="h-6 w-6 rounded-full bg-brand-100 flex items-center justify-center">
                          <UserCircle className="h-3.5 w-3.5 text-brand-600" />
                        </div>
                        Información personal
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo</label>
                          <input
                            type="text"
                            value={editForm.name}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Correo electrónico</label>
                          <input
                            type="email"
                            value={editForm.email}
                            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                            className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 items-end">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                          <input
                            type="password"
                            value={editForm.password}
                            onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                            placeholder="Dejar vacío para no cambiar"
                            className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
                          />
                          <p className="text-xs text-gray-400 mt-1">Solo si deseas cambiarla</p>
                        </div>
                        <div>
                          <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:border-amber-300 hover:bg-amber-50/30 cursor-pointer transition-colors">
                            <input
                              type="checkbox"
                              checked={editForm.isSuperAdmin}
                              onChange={(e) => setEditForm({ ...editForm, isSuperAdmin: e.target.checked })}
                              className="h-4 w-4 mt-0.5 rounded border-gray-300 text-accent-500 focus:ring-accent-500"
                            />
                            <div>
                              <p className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
                                <ShieldCheck className="h-3.5 w-3.5 text-amber-500" />
                                Super Admin
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">Panel de administración</p>
                            </div>
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Cuentas asignadas */}
                    <div className="space-y-4 border-t border-gray-100 pt-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                          <div className="h-6 w-6 rounded-full bg-accent-100 flex items-center justify-center">
                            <Building2 className="h-3.5 w-3.5 text-accent-600" />
                          </div>
                          Cuentas asignadas
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const available = tenants.find((t) => !editingUser.tenantRoles.some((tr) => tr.tenantId === t.id));
                            if (!available) return;
                            // We'll update via API directly
                            api.post(`/users/${editingUser.id}/tenants`, { tenantId: available.id, role: "agent" }).then(() => {
                              api.get<UserItem>(`/users/${editingUser.id}`).then(({ data }) => {
                                setEditingUser(data);
                              });
                            }).catch(() => {});
                          }}
                          className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1"
                        >
                          <Plus className="h-3.5 w-3.5" /> Agregar cuenta
                        </button>
                      </div>

                      <div className="pl-8">
                        {editingUser.tenantRoles.length === 0 ? (
                          <div className="text-center py-5 border-2 border-dashed border-gray-200 rounded-lg">
                            <Building2 className="h-7 w-7 text-gray-300 mx-auto mb-2" />
                            <p className="text-sm text-gray-400">Sin cuentas asignadas</p>
                            <p className="text-xs text-gray-300 mt-0.5">Define a qué cuentas tendrá acceso y con qué rol</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {editingUser.tenantRoles.map((tr) => (
                              <div key={tr.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 border border-gray-100">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-800 truncate">{tr.tenant?.name || "—"}</p>
                                </div>
                                <RoleSelector
                                  value={tr.role}
                                  onChange={(val) => {
                                    api.post(`/users/${editingUser.id}/tenants`, { tenantId: tr.tenantId, role: val }).then(() => {
                                      api.get<UserItem>(`/users/${editingUser.id}`).then(({ data }) => {
                                        setEditingUser(data);
                                      });
                                    }).catch(() => {});
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    api.delete(`/users/${editingUser.id}/tenants/${tr.tenantId}`).then(() => {
                                      api.get<UserItem>(`/users/${editingUser.id}`).then(({ data }) => {
                                        setEditingUser(data);
                                      });
                                    }).catch(() => {});
                                  }}
                                  className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 shrink-0"
                                  title="Quitar acceso"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                            <div className="flex flex-wrap gap-2 text-xs mt-2">
                              <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">Administrador — control total</span>
                              <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">Agente — gestión de conversaciones</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 sticky bottom-0">
                    <Button onClick={() => setEditingUser(null)} variant="outline" size="sm">Cancelar</Button>
                    <Button
                      size="sm"
                      className="bg-brand-800 hover:bg-brand-700 text-white"
                      disabled={!editForm.name.trim() || !editForm.email.trim()}
                      onClick={async () => {
                        try {
                          const payload: Record<string, unknown> = {
                            name: editForm.name.trim(),
                            email: editForm.email.trim(),
                            isSuperAdmin: editForm.isSuperAdmin,
                          };
                          if (editForm.password.trim()) payload.password = editForm.password.trim();
                          await api.put(`/users/${editingUser.id}`, payload);
                          setEditingUser(null);
                          fetchUsers();
                        } catch {}
                      }}
                    >
                      Guardar cambios
                    </Button>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// === Inline Components ===

function TenantsManagementModal({
  user,
  tenants,
  onClose,
}: {
  user: UserItem;
  tenants: Tenant[];
  onClose: () => void;
}) {
  const [roles, setRoles] = useState<{ tenantId: string; role: string }[]>(
    user.tenantRoles.map((tr) => ({ tenantId: tr.tenantId, role: tr.role }))
  );
  const [saving, setSaving] = useState(false);

  const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });

  const addRole = () => {
    if (tenants.length === 0) return;
    const availableTenant = tenants.find((t) => !roles.some((r) => r.tenantId === t.id));
    setRoles([...roles, { tenantId: availableTenant?.id || tenants[0].id, role: "agent" }]);
  };

  const removeRole = (index: number) => {
    setRoles(roles.filter((_, i) => i !== index));
  };

  const updateRole = (index: number, field: "tenantId" | "role", value: string) => {
    setRoles(roles.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Remove all existing tenant roles
      for (const tr of user.tenantRoles) {
        await api.delete(`/users/${user.id}/tenants/${tr.tenantId}`);
      }
      // Add new ones
      for (const r of roles) {
        await api.post(`/users/${user.id}/tenants`, { tenantId: r.tenantId, role: r.role });
      }
      onClose();
    } catch {
      // handle error
    } finally {
      setSaving(false);
    }
  };

  const availableTenants = tenants.filter(
    (t) => !roles.some((r) => r.tenantId === t.id)
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="rounded-2xl w-full max-w-md max-h-[80vh] overflow-y-auto border border-white/30 shadow-2xl bg-white/80"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-brand-100 flex items-center justify-center text-sm font-bold text-brand-700">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">Administrar cuentas</h2>
                <p className="text-xs text-gray-400">{user.name} · {user.email}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Cuentas a las que tiene acceso este usuario:
            </p>
            <button
              type="button"
              onClick={addRole}
              disabled={availableTenants.length === 0}
              className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="h-3.5 w-3.5" /> Agregar
            </button>
          </div>

          {roles.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
              <Building2 className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Sin cuentas asignadas</p>
              <p className="text-xs text-gray-300 mt-1">Este usuario no tiene acceso a ninguna cuenta</p>
            </div>
          ) : (
            <div className="space-y-2">
              {roles.map((r, index) => {
                return (
                  <div
                    key={index}
                    className="flex items-center gap-2 p-3 rounded-lg bg-gray-50 border border-gray-100"
                  >
                    <div className="flex-1 min-w-0">
                      <TenantAutocomplete
                        tenants={tenants}
                        value={r.tenantId}
                        onChange={(val) => updateRole(index, "tenantId", val)}
                      />
                    </div>
                    <RoleSelector
                      value={r.role}
                      onChange={(val) => updateRole(index, "role", val)}
                    />
                    <button
                      type="button"
                      onClick={() => removeRole(index)}
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 shrink-0"
                      title="Quitar acceso"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap gap-2 text-xs pt-2">
            <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Crown className="h-3 w-3" /> Administrador
            </span>
            <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Eye className="h-3 w-3" /> Agente
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-100">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="bg-brand-800 hover:bg-brand-700 text-white"
          >
            {saving ? "Guardando..." : "Guardar cambios"}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function TenantAutocomplete({
  tenants,
  value,
  onChange,
}: {
  tenants: Tenant[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selected = tenants.find((t) => t.id === value);
  const filtered = tenants.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative flex-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white hover:border-gray-300 transition-colors"
      >
        <span className={selected ? "text-gray-900" : "text-gray-400"}>
          {selected?.name || "Seleccionar cuenta..."}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 bottom-full left-0 mb-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cuenta..."
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:border-brand-400"
              autoFocus
            />
          </div>
          <div className="max-h-[160px] overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-gray-400">Sin resultados</p>
            ) : (
              filtered.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { onChange(t.id); setOpen(false); setSearch(""); }}
                  className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm rounded-md text-left transition-colors ${
                    t.id === value ? "bg-brand-50 text-brand-700" : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <Check className={`h-3.5 w-3.5 shrink-0 ${t.id === value ? "opacity-100" : "opacity-0"}`} />
                  <span>{t.name}</span>
                  <span className="text-xs text-gray-400 ml-auto">/{t.slug}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RoleSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (role: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const roles = [
    { value: "admin", label: "Administrador", color: "text-amber-700 bg-amber-50", icon: Crown },
    { value: "agent", label: "Agente", color: "text-blue-700 bg-blue-50", icon: Eye },
  ];

  const selected = roles.find((r) => r.value === value) || roles[1];

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 hover:border-gray-300 transition-colors ${selected.color}`}
      >
        <selected.icon className="h-3.5 w-3.5" />
        {selected.label}
      </button>

      {open && (
        <div className="absolute z-50 bottom-full right-0 mb-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden p-1">
          {roles.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => { onChange(r.value); setOpen(false); }}
              className={`flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md text-left transition-colors ${
                r.value === value ? r.color : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <r.icon className="h-3.5 w-3.5 shrink-0" />
              {r.label}
              <Check className={`h-3.5 w-3.5 shrink-0 ml-auto ${r.value === value ? "opacity-100" : "opacity-0"}`} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
