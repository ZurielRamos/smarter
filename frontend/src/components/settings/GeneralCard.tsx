import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Pencil, X, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageCropper } from "@/components/ImageCropper";
import { useAuth } from "@/context/AuthContext";
import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

interface TenantData {
  id: string;
  name: string;
  slug: string;
  iconPath: string | null;
  isActive: boolean;
}

type EditField = "name" | "icon" | null;

export function GeneralCard() {
  const { slug } = useParams();
  const { user } = useAuth();
  const currentTenant = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const tenantId = currentTenant?.tenantId;

  const [tenant, setTenant] = useState<TenantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editField, setEditField] = useState<EditField>(null);
  const [editValue, setEditValue] = useState("");
  const [derivedSlug, setDerivedSlug] = useState("");
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [checkingSlug, setCheckingSlug] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [cropperSrc, setCropperSrc] = useState<string | null>(null);
  const [cropperFileName, setCropperFileName] = useState("");

  useEffect(() => {
    if (tenantId) loadTenant();
  }, [tenantId]);

  async function loadTenant() {
    setLoading(true);
    try {
      const { data } = await api.get<TenantData>(`/tenants/${tenantId}`);
      setTenant(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  function openEdit(field: EditField) {
    if (!tenant) return;
    setEditField(field);
    setSlugAvailable(null);
    setDerivedSlug("");
    if (field === "name") setEditValue(tenant.name);
    else {
      setEditValue("");
      setFilePreview(null);
      setSelectedFile(null);
    }
  }

  function closeEdit() {
    setEditField(null);
    setEditValue("");
    setDerivedSlug("");
    setSlugAvailable(null);
    setCheckingSlug(false);
    setFilePreview(null);
    setSelectedFile(null);
  }

  function generateSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  async function handleNameChange(value: string) {
    setEditValue(value);
    const newSlug = generateSlug(value);
    setDerivedSlug(newSlug);

    if (!newSlug || newSlug === tenant?.slug) {
      setSlugAvailable(newSlug === tenant?.slug ? true : null);
      return;
    }

    setCheckingSlug(true);
    try {
      const { data } = await api.get<{ available: boolean }>(`/tenants/check-slug/${newSlug}`);
      setSlugAvailable(data.available);
    } catch {
      setSlugAvailable(null);
    } finally {
      setCheckingSlug(false);
    }
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
    if (!tenant) return;
    setSaving(true);
    try {
      if (editField === "icon") {
        if (!selectedFile) return;
        const formData = new FormData();
        formData.append("icon", selectedFile);
        await api.put(`/tenants/${tenant.id}`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      } else if (editField === "name") {
        const newSlug = derivedSlug || generateSlug(editValue);
        await api.put(`/tenants/${tenant.id}`, { name: editValue, slug: newSlug });
      }
      await loadTenant();
      closeEdit();
      if (editField === "name" && derivedSlug && derivedSlug !== tenant.slug) {
        window.location.href = `/${derivedSlug}/settings`;
      }
    } catch {
      // error
    } finally {
      setSaving(false);
    }
  }

  if (loading || !tenant) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  const iconUrl = tenant.iconPath ? `/${tenant.iconPath}` : null;

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">General</h2>
        <p className="text-sm text-gray-500 mb-5">
          Información e identidad de la cuenta
        </p>

        {/* Branding row - icon + name */}
        <div className="flex items-center gap-5">
          {/* Icon */}
          <button
            onClick={() => openEdit("icon")}
            className="group relative h-14 w-14 rounded-xl border-2 border-dashed border-gray-200 hover:border-brand-400 flex items-center justify-center overflow-hidden transition-all bg-brand-800 shrink-0"
          >
            {iconUrl ? (
              <img src={iconUrl} alt="Ícono" className="h-full w-full object-cover" />
            ) : (
              <Upload className="h-5 w-5 text-white/50 group-hover:text-white/80" />
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Pencil className="h-4 w-4 text-white" />
            </div>
          </button>

          {/* Name */}
          <div className="flex-1 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Nombre</p>
              <p className="text-sm text-gray-500">{tenant.name}</p>
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
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {editField === "name" && "Editar nombre"}
                    {editField === "icon" && "Cambiar ícono"}
                  </h3>
                  <button onClick={closeEdit} className="text-gray-400 hover:text-gray-600">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5">
                  {editField === "name" && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Nombre de la cuenta
                      </label>
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => handleNameChange(e.target.value)}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                      />
                      {derivedSlug && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-xs text-gray-400">URL:</span>
                          <span className="text-xs font-mono text-gray-600">/{derivedSlug}</span>
                          {checkingSlug && (
                            <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
                          )}
                          {!checkingSlug && slugAvailable === true && (
                            <span className="text-xs text-green-600 font-medium">✓ Disponible</span>
                          )}
                          {!checkingSlug && slugAvailable === false && (
                            <span className="text-xs text-red-600 font-medium">✗ No disponible</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {editField === "icon" && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-3">
                        Sube un ícono cuadrado (recomendado 128×128px)
                      </label>
                      <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center">
                        {filePreview ? (
                          <img
                            src={filePreview}
                            alt="Preview"
                            className="mx-auto h-20 object-contain mb-3"
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
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3">
                  <Button onClick={closeEdit} variant="outline" size="sm">
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={saving || (editField === "name" && (!editValue.trim() || slugAvailable === false || checkingSlug)) || (editField === "icon" && !selectedFile)}
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
            title="Recortar ícono"
            onCropComplete={handleCropComplete}
            onCancel={handleCropCancel}
          />
        )}
      </AnimatePresence>
    </>
  );
}

