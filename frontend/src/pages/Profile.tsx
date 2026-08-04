import { useState } from "react";
import { useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { User, Pencil, X, Upload, Loader2, Eye, EyeOff, Lock, Mail, Key, Copy, Check, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageCropper } from "@/components/ImageCropper";
import { useAuth } from "@/context/AuthContext";
import headerBg from "@/assets/header-background.jpg";
import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

type EditField = "name" | "avatar" | "password" | null;

export function Profile() {
  const { slug } = useParams();
  const { user, refreshUser } = useAuth();

  const [editField, setEditField] = useState<EditField>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Name edit
  const [editName, setEditName] = useState("");

  // Avatar edit
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [cropperSrc, setCropperSrc] = useState<string | null>(null);
  const [cropperFileName, setCropperFileName] = useState("");

  // Password edit
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);

  // API Token
  const [tokenVisible, setTokenVisible] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);

  const currentTenant = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);

  const initials = user?.name
    ?.split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() ?? "U";

  function openEdit(field: EditField) {
    setEditField(field);
    setError("");
    setSuccess("");
    if (field === "name") setEditName(user?.name ?? "");
    if (field === "avatar") {
      setFilePreview(null);
      setSelectedFile(null);
    }
    if (field === "password") {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowCurrentPwd(false);
      setShowNewPwd(false);
    }
  }

  function closeEdit() {
    setEditField(null);
    setError("");
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropperSrc(URL.createObjectURL(file));
    setCropperFileName(file.name);
    e.target.value = "";
  }

  function handleCropComplete(croppedFile: File) {
    setSelectedFile(croppedFile);
    setFilePreview(URL.createObjectURL(croppedFile));
    setCropperSrc(null);
    setCropperFileName("");
  }

  function handleCropCancel() {
    setCropperSrc(null);
    setCropperFileName("");
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const formData = new FormData();

      if (editField === "name") {
        formData.append("name", editName.trim());
      } else if (editField === "avatar") {
        if (!selectedFile) return;
        formData.append("avatar", selectedFile);
      } else if (editField === "password") {
        if (newPassword !== confirmPassword) {
          setError("Las contraseñas no coinciden");
          setSaving(false);
          return;
        }
        if (newPassword.length < 6) {
          setError("La contraseña debe tener al menos 6 caracteres");
          setSaving(false);
          return;
        }
        formData.append("currentPassword", currentPassword);
        formData.append("newPassword", newPassword);
      }

      const { data } = await api.patch("/auth/profile", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (data.error) {
        setError(data.error);
        setSaving(false);
        return;
      }

      setSuccess(
        editField === "name" ? "Nombre actualizado" :
        editField === "avatar" ? "Avatar actualizado" :
        "Contraseña actualizada"
      );
      closeEdit();
      // Refresh user data in context without page reload
      await refreshUser();
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  function handleCopyToken() {
    if (user?.apiToken) {
      navigator.clipboard.writeText(user.apiToken);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    }
  }

  async function handleRegenerateToken() {
    setShowRegenerateModal(false);
    setRegenerating(true);
    try {
      await api.post("/auth/regenerate-api-token");
      await refreshUser();
      setTokenVisible(true);
    } catch {
      // silently fail
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div
        className="px-8 pt-16 pb-4 shrink-0 rounded-b-2xl"
        style={{
          backgroundImage: `url(${headerBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="flex items-center gap-3">
          <User className="h-5 w-5 text-brand-300" />
          <div>
            <h1 className="text-xl font-bold text-white">Mi perfil</h1>
            <p className="text-brand-300 mt-0.5 text-sm">
              Gestiona tu información personal y seguridad
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1, ease: "easeOut" }}
        className="flex-1 min-h-0 overflow-auto py-6"
      >
        <div className="max-w-3xl space-y-6">
          {/* Success toast */}
          {success && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg"
            >
              {success}
            </motion.div>
          )}

          {/* Avatar & Name card */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Información personal</h2>
            <p className="text-sm text-gray-500 mb-5">
              Tu foto y nombre visible en la plataforma
            </p>

            <div className="flex items-center gap-5">
              {/* Avatar */}
              <button
                onClick={() => openEdit("avatar")}
                className="group relative h-16 w-16 rounded-full border-2 border-dashed border-gray-200 hover:border-brand-400 flex items-center justify-center overflow-hidden transition-all bg-accent-500 shrink-0"
              >
                {user?.avatarPath ? (
                  <img
                    src={user.avatarPath.startsWith("http") ? user.avatarPath : `/${user.avatarPath}`}
                    alt="Avatar"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-lg font-bold text-white">{initials}</span>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full">
                  <Pencil className="h-4 w-4 text-white" />
                </div>
              </button>

              {/* Name */}
              <div className="flex-1 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Nombre</p>
                  <p className="text-sm text-gray-500">{user?.name}</p>
                </div>
                <button
                  onClick={() => openEdit("name")}
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Email card (read-only) */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Correo electrónico</h2>
            <p className="text-sm text-gray-500 mb-5">
              Tu correo de acceso a la plataforma
            </p>

            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <Mail className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{user?.email}</p>
                <p className="text-xs text-gray-400">No se puede cambiar</p>
              </div>
            </div>
          </div>

          {/* Security card */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Seguridad</h2>
            <p className="text-sm text-gray-500 mb-5">
              Gestiona tu contraseña de acceso
            </p>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
                  <Lock className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Contraseña</p>
                  <p className="text-xs text-gray-400">••••••••</p>
                </div>
              </div>
              <Button
                onClick={() => openEdit("password")}
                variant="outline"
                size="sm"
              >
                Cambiar
              </Button>
            </div>
          </div>

          {/* API Token card */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Token de API</h2>
            <p className="text-sm text-gray-500 mb-5">
              Usa este token para autenticarte en la API. No lo compartas con nadie.
            </p>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                  <Key className="h-4 w-4 text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-400 mb-1">Tu token de acceso</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-gray-100 px-3 py-1.5 rounded-lg text-gray-700 font-mono truncate block flex-1">
                      {tokenVisible ? user?.apiToken : "••••••••••••••••••••••••••••••••"}
                    </code>
                    <button
                      onClick={() => setTokenVisible(!tokenVisible)}
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
                      title={tokenVisible ? "Ocultar" : "Mostrar"}
                    >
                      {tokenVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={handleCopyToken}
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
                      title="Copiar"
                    >
                      {tokenCopied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-400">
                  Regenerar invalidará el token actual
                </p>
                <Button
                  onClick={() => setShowRegenerateModal(true)}
                  variant="outline"
                  size="sm"
                  disabled={regenerating}
                  className="gap-1.5"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`} />
                  {regenerating ? "Regenerando..." : "Regenerar"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Edit Modal */}
      <AnimatePresence>
        {editField && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-50"
              onClick={closeEdit}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div
                className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {editField === "name" && "Editar nombre"}
                    {editField === "avatar" && "Cambiar avatar"}
                    {editField === "password" && "Cambiar contraseña"}
                  </h3>
                  <button onClick={closeEdit} className="text-gray-400 hover:text-gray-600">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5">
                  {error && (
                    <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
                      {error}
                    </div>
                  )}

                  {editField === "name" && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Nombre completo
                      </label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                        placeholder="Tu nombre"
                      />
                    </div>
                  )}

                  {editField === "avatar" && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-3">
                        Sube una foto de perfil (recomendado 256×256px)
                      </label>
                      <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center">
                        {filePreview ? (
                          <img
                            src={filePreview}
                            alt="Preview"
                            className="mx-auto h-24 w-24 rounded-full object-cover mb-3"
                          />
                        ) : (
                          <Upload className="h-8 w-8 text-gray-300 mx-auto mb-3" />
                        )}
                        <label className="inline-block cursor-pointer px-4 py-2 bg-brand-50 text-brand-700 text-sm font-medium rounded-lg hover:bg-brand-100 transition-colors">
                          Seleccionar archivo
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            className="hidden"
                          />
                        </label>
                        {selectedFile && (
                          <p className="text-xs text-gray-400 mt-2">{selectedFile.name}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {editField === "password" && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          Contraseña actual
                        </label>
                        <div className="relative">
                          <input
                            type={showCurrentPwd ? "text" : "password"}
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none pr-10"
                            placeholder="••••••••"
                          />
                          <button
                            type="button"
                            onClick={() => setShowCurrentPwd(!showCurrentPwd)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                            {showCurrentPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          Nueva contraseña
                        </label>
                        <div className="relative">
                          <input
                            type={showNewPwd ? "text" : "password"}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none pr-10"
                            placeholder="Mínimo 6 caracteres"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPwd(!showNewPwd)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                            {showNewPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          Confirmar nueva contraseña
                        </label>
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                          placeholder="Repite la nueva contraseña"
                        />
                        {confirmPassword && newPassword !== confirmPassword && (
                          <p className="text-xs text-red-500 mt-1">Las contraseñas no coinciden</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3">
                  <Button onClick={closeEdit} variant="outline" size="sm">
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={
                      saving ||
                      (editField === "name" && !editName.trim()) ||
                      (editField === "avatar" && !selectedFile) ||
                      (editField === "password" && (!currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword))
                    }
                    size="sm"
                    className="bg-brand-800 hover:bg-brand-700 text-white"
                  >
                    {saving ? "Guardando..." : "Guardar"}
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Image Cropper */}
      <AnimatePresence>
        {cropperSrc && (
          <ImageCropper
            imageSrc={cropperSrc}
            fileName={cropperFileName}
            aspect={1}
            title="Recortar avatar"
            onCropComplete={handleCropComplete}
            onCancel={handleCropCancel}
          />
        )}
      </AnimatePresence>

      {/* Regenerate Token Confirmation Modal */}
      <AnimatePresence>
        {showRegenerateModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-50"
              onClick={() => setShowRegenerateModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div
                className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Icon + Title */}
                <div className="px-6 pt-6 pb-2">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
                      <AlertTriangle className="h-5 w-5 text-amber-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      Regenerar token de API
                    </h3>
                  </div>
                </div>

                {/* Body */}
                <div className="px-6 py-4 space-y-3">
                  <p className="text-sm text-gray-600">
                    Estás a punto de generar un nuevo token de API. Ten en cuenta lo siguiente:
                  </p>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2 text-sm text-gray-600">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />
                      El token actual dejará de funcionar <strong className="text-gray-800">inmediatamente</strong>.
                    </li>
                    <li className="flex items-start gap-2 text-sm text-gray-600">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />
                      Cualquier integración o aplicación que use el token actual perderá acceso.
                    </li>
                    <li className="flex items-start gap-2 text-sm text-gray-600">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                      Deberás actualizar el token en todos los servicios que lo utilicen.
                    </li>
                  </ul>
                  <p className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                    Esta acción no se puede deshacer.
                  </p>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3">
                  <Button
                    onClick={() => setShowRegenerateModal(false)}
                    variant="outline"
                    size="sm"
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleRegenerateToken}
                    size="sm"
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    Sí, regenerar token
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
