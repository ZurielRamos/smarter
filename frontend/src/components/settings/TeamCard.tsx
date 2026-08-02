import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Users, Plus, X, Loader2, Trash2, Mail, UserPlus, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

interface TenantData {
  id: string;
  maxUsers: number;
}

interface MemberUser {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
}

interface UserTenantMember {
  id: string;
  userId: string;
  role: string;
  user: MemberUser;
}

type ModalMode = null | "add" | "edit";
type AddStep = "email" | "existing-role" | "new-user" | "done";

const roles = [
  { value: "admin", label: "Administrador", description: "Acceso total a la cuenta" },
  { value: "agent", label: "Agente", description: "Gestiona conversaciones y contactos" },
];

export function TeamCard() {
  const { slug } = useParams();
  const { user } = useAuth();
  const currentTenant = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const tenantId = currentTenant?.tenantId;

  const [members, setMembers] = useState<UserTenantMember[]>([]);
  const [maxUsers, setMaxUsers] = useState(10);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editingMember, setEditingMember] = useState<UserTenantMember | null>(null);
  const [selectedRole, setSelectedRole] = useState("viewer");
  const [saving, setSaving] = useState(false);

  // Add stepper state
  const [addStep, setAddStep] = useState<AddStep>("email");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [checking, setChecking] = useState(false);
  const [foundUser, setFoundUser] = useState<{ id: string; name: string; email: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    if (tenantId) loadData();
  }, [tenantId]);

  async function loadData() {
    setLoading(true);
    try {
      const [tenantRes, membersRes] = await Promise.all([
        api.get<TenantData>(`/tenants/${tenantId}`),
        api.get<UserTenantMember[]>(`/tenants/${tenantId}/members`),
      ]);
      setMaxUsers(tenantRes.data.maxUsers);
      setMembers(membersRes.data);
    } catch {
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }

  function openAdd() {
    setModalMode("add");
    setAddStep("email");
    setEmail("");
    setEmailError("");
    setFoundUser(null);
    setNewName("");
    setNewPassword("");
    setSelectedRole("viewer");
  }

  function openEdit(member: UserTenantMember) {
    setModalMode("edit");
    setEditingMember(member);
    setSelectedRole(member.role);
  }

  function closeModal() {
    setModalMode(null);
    setEditingMember(null);
    setAddStep("email");
    setEmail("");
    setEmailError("");
    setFoundUser(null);
    setNewName("");
    setNewPassword("");
    setSelectedRole("viewer");
  }

  async function handleCheckEmail() {
    if (!email.trim()) return;
    setChecking(true);
    setEmailError("");
    try {
      const { data } = await api.get<{ exists: boolean; user?: { id: string; name: string; email: string } }>(`/users/find-by-email/${encodeURIComponent(email)}`);
      if (data.exists && data.user) {
        // Check if already a member
        const alreadyMember = members.some((m) => m.userId === data.user!.id);
        if (alreadyMember) {
          setEmailError("Este usuario ya es miembro del equipo.");
          setFoundUser(null);
        } else {
          setFoundUser(data.user);
          setAddStep("existing-role");
        }
      } else {
        setFoundUser(null);
        setAddStep("new-user");
      }
    } catch {
      setFoundUser(null);
      setAddStep("new-user");
    } finally {
      setChecking(false);
    }
  }

  async function handleAddExisting() {
    if (!foundUser || !tenantId) return;
    setSaving(true);
    try {
      await api.post(`/users/${foundUser.id}/tenants`, {
        tenantId,
        role: selectedRole,
      });
      setAddStep("done");
      await loadData();
    } catch {
      // error
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateAndAdd() {
    if (!tenantId || !newName.trim() || !newPassword.trim()) return;
    setSaving(true);
    try {
      const { data } = await api.post<{ id: string }>("/users", {
        name: newName,
        email,
        password: newPassword,
        tenantRoles: [{ tenantId, role: selectedRole }],
      });
      setFoundUser({ id: data.id, name: newName, email });
      setAddStep("done");
      await loadData();
    } catch {
      // error
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateRole() {
    if (!editingMember || !tenantId) return;
    setSaving(true);
    try {
      await api.post(`/users/${editingMember.userId}/tenants`, {
        tenantId,
        role: selectedRole,
      });
      await loadData();
      closeModal();
    } catch {
      // error
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!editingMember || !tenantId) return;
    setSaving(true);
    try {
      await api.delete(`/users/${editingMember.userId}/tenants/${tenantId}`);
      await loadData();
      closeModal();
    } catch {
      // error
    } finally {
      setSaving(false);
    }
  }

  const currentCount = members.length;
  const canAdd = currentCount < maxUsers;

  function getInitials(name: string) {
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-gray-900">Equipo</h2>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-600 font-medium">{currentCount}</span>
              <span className="text-sm text-gray-400">/ {maxUsers}</span>
            </div>
            {canAdd && (
              <Button
                onClick={openAdd}
                size="sm"
                className="gap-1 bg-accent-500 hover:bg-accent-600 text-white h-8 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                Agregar
              </Button>
            )}
          </div>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Gestiona los miembros y permisos del equipo en esta cuenta.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            {/* Progress bar */}
            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all bg-accent-500"
                  style={{ width: `${Math.min((currentCount / maxUsers) * 100, 100)}%` }}
                />
              </div>
              <span className="text-xs text-gray-400 shrink-0">
                {maxUsers - currentCount} disponibles
              </span>
            </div>

            {/* Members list */}
            <div className="space-y-1">
              {members.map((member) => (
                <button
                  key={member.id}
                  onClick={() => openEdit(member)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="h-9 w-9 rounded-full bg-brand-100 flex items-center justify-center text-xs font-bold text-brand-700 shrink-0">
                    {getInitials(member.user.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {member.user.name}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {member.user.email}
                    </p>
                  </div>
                  <span className={cn(
                    "text-xs font-medium px-2 py-0.5 rounded-full",
                    member.role === "admin" ? "bg-brand-100 text-brand-700" :
                    "bg-gray-100 text-gray-600"
                  )}>
                    {member.role === "admin" ? "Administrador" : "Agente"}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Edit Modal */}
      <AnimatePresence>
        {modalMode === "edit" && editingMember && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-50"
              onClick={closeModal}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Editar miembro</h3>
                    <p className="text-sm text-gray-500 mt-0.5">{editingMember.user.name}</p>
                  </div>
                  <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="px-6 py-5">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Rol</label>
                  <div className="space-y-2">
                    {roles.map((role) => (
                      <button
                        key={role.value}
                        type="button"
                        onClick={() => setSelectedRole(role.value)}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-3 rounded-lg border-2 text-left transition-all",
                          selectedRole === role.value
                            ? "border-brand-500 bg-brand-50"
                            : "border-gray-200 hover:border-gray-300"
                        )}
                      >
                        <div className={cn(
                          "h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0",
                          selectedRole === role.value ? "border-brand-500" : "border-gray-300"
                        )}>
                          {selectedRole === role.value && <div className="h-2 w-2 rounded-full bg-brand-500" />}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{role.label}</p>
                          <p className="text-xs text-gray-400">{role.description}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
                  <button
                    onClick={handleRemove}
                    disabled={saving}
                    className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Quitar del equipo
                  </button>
                  <div className="flex items-center gap-3">
                    <Button onClick={closeModal} variant="outline" size="sm">Cancelar</Button>
                    <Button
                      onClick={handleUpdateRole}
                      disabled={saving}
                      size="sm"
                      className="bg-brand-800 hover:bg-brand-700 text-white"
                    >
                      {saving ? "Guardando..." : "Guardar"}
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Add Modal (Stepper) */}
      <AnimatePresence>
        {modalMode === "add" && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-50"
              onClick={closeModal}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Agregar miembro</h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {addStep === "email" && "Ingresa el correo electrónico del usuario"}
                      {addStep === "existing-role" && "Usuario encontrado — asígnale un rol"}
                      {addStep === "new-user" && "Usuario nuevo — completa los datos"}
                      {addStep === "done" && "Miembro agregado exitosamente"}
                    </p>
                  </div>
                  <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5">
                  {/* Step 1: Email */}
                  {addStep === "email" && (
                    <div className="space-y-4">
                      <div className="h-12 w-12 rounded-full bg-brand-50 flex items-center justify-center mx-auto mb-2">
                        <Mail className="h-6 w-6 text-brand-600" />
                      </div>
                      <p className="text-center text-sm text-gray-500">
                        Si el usuario ya existe en la plataforma, se agregará directamente al equipo.
                        Si no, podrás crear una cuenta nueva.
                      </p>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          Correo electrónico
                        </label>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
                          onKeyDown={(e) => e.key === "Enter" && handleCheckEmail()}
                          placeholder="nombre@empresa.com"
                          className={cn(
                            "w-full px-4 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none",
                            emailError ? "border-red-300" : "border-gray-300"
                          )}
                        />
                        {emailError && (
                          <p className="text-xs text-red-600 mt-1.5">{emailError}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Step 2a: Existing user — pick role */}
                  {addStep === "existing-role" && foundUser && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-green-800">Usuario encontrado</p>
                          <p className="text-xs text-green-600">{foundUser.name} · {foundUser.email}</p>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Asignar rol en este equipo
                        </label>
                        <div className="space-y-2">
                          {roles.map((role) => (
                            <button
                              key={role.value}
                              type="button"
                              onClick={() => setSelectedRole(role.value)}
                              className={cn(
                                "w-full flex items-center gap-3 px-4 py-3 rounded-lg border-2 text-left transition-all",
                                selectedRole === role.value
                                  ? "border-brand-500 bg-brand-50"
                                  : "border-gray-200 hover:border-gray-300"
                              )}
                            >
                              <div className={cn(
                                "h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0",
                                selectedRole === role.value ? "border-brand-500" : "border-gray-300"
                              )}>
                                {selectedRole === role.value && <div className="h-2 w-2 rounded-full bg-brand-500" />}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900">{role.label}</p>
                                <p className="text-xs text-gray-400">{role.description}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 2b: New user — create account */}
                  {addStep === "new-user" && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <UserPlus className="h-5 w-5 text-blue-600 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-blue-800">Usuario nuevo</p>
                          <p className="text-xs text-blue-600">Se creará una cuenta con el email: {email}</p>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Nombre completo</label>
                        <input
                          type="text"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          placeholder="Juan Pérez"
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Contraseña temporal</label>
                        <input
                          type="text"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Mín. 6 caracteres"
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                        />
                        <p className="text-xs text-gray-400 mt-1">El usuario deberá cambiarla al primer ingreso.</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Rol</label>
                        <div className="space-y-2">
                          {roles.map((role) => (
                            <button
                              key={role.value}
                              type="button"
                              onClick={() => setSelectedRole(role.value)}
                              className={cn(
                                "w-full flex items-center gap-3 px-4 py-3 rounded-lg border-2 text-left transition-all",
                                selectedRole === role.value
                                  ? "border-brand-500 bg-brand-50"
                                  : "border-gray-200 hover:border-gray-300"
                              )}
                            >
                              <div className={cn(
                                "h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0",
                                selectedRole === role.value ? "border-brand-500" : "border-gray-300"
                              )}>
                                {selectedRole === role.value && <div className="h-2 w-2 rounded-full bg-brand-500" />}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900">{role.label}</p>
                                <p className="text-xs text-gray-400">{role.description}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Done */}
                  {addStep === "done" && (
                    <div className="text-center py-4">
                      <div className="h-14 w-14 rounded-full bg-accent-50 flex items-center justify-center mx-auto mb-3">
                        <CheckCircle className="h-7 w-7 text-accent-500" />
                      </div>
                      <h4 className="text-lg font-semibold text-gray-900">Miembro agregado</h4>
                      <p className="text-sm text-gray-500 mt-1">
                        {foundUser?.name} ahora forma parte del equipo como <strong className="capitalize">{selectedRole}</strong>.
                      </p>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3">
                  {addStep === "email" && (
                    <>
                      <Button onClick={closeModal} variant="outline" size="sm">Cancelar</Button>
                      <Button
                        onClick={handleCheckEmail}
                        disabled={checking || !email.trim() || !email.includes("@")}
                        size="sm"
                        className="bg-brand-800 hover:bg-brand-700 text-white gap-1.5"
                      >
                        {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        {checking ? "Verificando..." : "Continuar"}
                      </Button>
                    </>
                  )}

                  {addStep === "existing-role" && (
                    <>
                      <Button onClick={() => setAddStep("email")} variant="outline" size="sm">Atrás</Button>
                      <Button
                        onClick={handleAddExisting}
                        disabled={saving}
                        size="sm"
                        className="bg-brand-800 hover:bg-brand-700 text-white"
                      >
                        {saving ? "Agregando..." : "Agregar al equipo"}
                      </Button>
                    </>
                  )}

                  {addStep === "new-user" && (
                    <>
                      <Button onClick={() => setAddStep("email")} variant="outline" size="sm">Atrás</Button>
                      <Button
                        onClick={handleCreateAndAdd}
                        disabled={saving || !newName.trim() || !newPassword.trim() || newPassword.length < 6}
                        size="sm"
                        className="bg-brand-800 hover:bg-brand-700 text-white"
                      >
                        {saving ? "Creando..." : "Crear y agregar"}
                      </Button>
                    </>
                  )}

                  {addStep === "done" && (
                    <Button onClick={closeModal} size="sm" className="bg-accent-500 hover:bg-accent-600 text-white">
                      Cerrar
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
