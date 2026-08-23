import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Copy, Check, Eye, Code, Palette, MessageCircle, Settings2, Upload, Trash2 } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { ImageCropper } from "@/components/ImageCropper";
import headerBg from "@/assets/header-background.jpg";
import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

interface WidgetConfig {
  primaryColor: string;
  headerTitle: string;
  headerSubtitle: string;
  welcomeMessage: string;
  inputPlaceholder: string;
  position: "left" | "right";
  avatarUrl: string;
}

const DEFAULT_CONFIG: WidgetConfig = {
  primaryColor: "#1e3a5f",
  headerTitle: "Chat con nosotros",
  headerSubtitle: "Chatea con nosotros, te atenderemos en pocos minutos",
  welcomeMessage: "👋 ¡Hola! ¿En qué podemos ayudarte?",
  inputPlaceholder: "Escribe un mensaje...",
  position: "right",
  avatarUrl: "",
};

export function ChatWidgetBuilder() {
  const { slug, inboxId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [config, setConfig] = useState<WidgetConfig>(DEFAULT_CONFIG);
  const [inboxName, setInboxName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"design" | "content" | "code">("design");
  const [cropperSrc, setCropperSrc] = useState<string | null>(null);
  const [cropperFileName, setCropperFileName] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!inboxId) return;
    api.get(`/chats/inboxes/${inboxId}`)
      .then(({ data }) => {
        setInboxName(data.name);
        if (data.metadata?.widgetConfig) {
          setConfig({ ...DEFAULT_CONFIG, ...data.metadata.widgetConfig });
        }
      })
      .catch(() => navigate(`/${slug}/comunicaciones/canales`))
      .finally(() => setLoading(false));
  }, [inboxId]);

  const handleSave = async () => {
    if (!inboxId) return;
    setSaving(true);
    try {
      await api.put(`/chats/inboxes/${inboxId}`, {
        metadata: { widgetConfig: config },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {} finally {
      setSaving(false);
    }
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropperSrc(URL.createObjectURL(file));
    setCropperFileName(file.name);
    e.target.value = "";
  };

  const handleCropComplete = async (croppedFile: File) => {
    setCropperSrc(null);
    setCropperFileName("");
    if (!inboxId) return;

    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("avatar", croppedFile);
      const { data } = await api.post(`/chat-widget/avatar/${inboxId}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (data.url) {
        setConfig((prev) => ({ ...prev, avatarUrl: data.url }));
      }
    } catch {} finally {
      setUploadingAvatar(false);
    }
  };

  const handleCropCancel = () => {
    setCropperSrc(null);
    setCropperFileName("");
  };

  const handleRemoveAvatar = () => {
    setConfig((prev) => ({ ...prev, avatarUrl: "" }));
  };

  const embedCode = `<script src="${window.location.origin}/api/chat-widget/script/${inboxId}" async></script>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-gray-400">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Hero */}
      <div className="px-8 pt-16 pb-4 shrink-0 rounded-b-2xl" style={{ backgroundImage: `url(${headerBg})`, backgroundSize: "cover", backgroundPosition: "center" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(`/${slug}/comunicaciones/canales`)} className="p-1.5 rounded-lg hover:bg-white/10 text-white transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-white">Chat Widget</h1>
              <p className="text-brand-300 mt-0.5 text-sm">{inboxName}</p>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-white/15 hover:bg-white/25 text-white transition-colors disabled:opacity-50"
          >
            {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saving ? "Guardando..." : saved ? "Guardado" : "Guardar"}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Left panel — Settings */}
        <div className="w-[380px] border-r border-gray-200 flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-200 px-4 pt-4">
            <button
              onClick={() => setActiveTab("design")}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${activeTab === "design" ? "border-brand-600 text-brand-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              <Palette className="h-3.5 w-3.5" />
              Diseño
            </button>
            <button
              onClick={() => setActiveTab("content")}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${activeTab === "content" ? "border-brand-600 text-brand-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              <Settings2 className="h-3.5 w-3.5" />
              Contenido
            </button>
            <button
              onClick={() => setActiveTab("code")}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${activeTab === "code" ? "border-brand-600 text-brand-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              <Code className="h-3.5 w-3.5" />
              Instalación
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {activeTab === "design" && (
              <>
                {/* Color */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">Color principal</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={config.primaryColor}
                      onChange={(e) => setConfig({ ...config, primaryColor: e.target.value })}
                      className="h-9 w-9 rounded-lg border border-gray-200 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={config.primaryColor}
                      onChange={(e) => setConfig({ ...config, primaryColor: e.target.value })}
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div className="flex gap-2 mt-2">
                    {["#1e3a5f", "#2563eb", "#7c3aed", "#059669", "#dc2626", "#ea580c", "#0891b2", "#000000"].map((c) => (
                      <button
                        key={c}
                        onClick={() => setConfig({ ...config, primaryColor: c })}
                        className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${config.primaryColor === c ? "border-gray-800 scale-110" : "border-gray-200"}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>

                {/* Position */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">Posición del widget</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setConfig({ ...config, position: "left" })}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${config.position === "left" ? "border-brand-500 bg-brand-50 text-brand-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                    >
                      Izquierda
                    </button>
                    <button
                      onClick={() => setConfig({ ...config, position: "right" })}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${config.position === "right" ? "border-brand-500 bg-brand-50 text-brand-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                    >
                      Derecha
                    </button>
                  </div>
                </div>

                {/* Avatar */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">Avatar / Logo</label>
                  <div className="flex items-center gap-3">
                    {/* Preview */}
                    <div className="relative h-14 w-14 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {config.avatarUrl ? (
                        <img src={config.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                      ) : (
                        <MessageCircle className="h-6 w-6 text-gray-300" />
                      )}
                      {uploadingAvatar && (
                        <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                          <div className="h-4 w-4 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingAvatar}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                      >
                        <Upload className="h-3 w-3" />
                        {config.avatarUrl ? "Cambiar" : "Subir imagen"}
                      </button>
                      {config.avatarUrl && (
                        <button
                          type="button"
                          onClick={handleRemoveAvatar}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="h-3 w-3" />
                          Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarSelect}
                  />
                  <p className="text-[10px] text-gray-400 mt-2">
                    Recomendado: imagen cuadrada de al menos 200×200px.
                  </p>
                </div>
              </>
            )}

            {activeTab === "content" && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Título del encabezado</label>
                  <input
                    type="text"
                    value={config.headerTitle}
                    onChange={(e) => setConfig({ ...config, headerTitle: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Subtítulo del encabezado</label>
                  <input
                    type="text"
                    value={config.headerSubtitle}
                    onChange={(e) => setConfig({ ...config, headerSubtitle: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Mensaje de bienvenida</label>
                  <textarea
                    value={config.welcomeMessage}
                    onChange={(e) => setConfig({ ...config, welcomeMessage: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Placeholder del input</label>
                  <input
                    type="text"
                    value={config.inputPlaceholder}
                    onChange={(e) => setConfig({ ...config, inputPlaceholder: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </>
            )}

            {activeTab === "code" && (
              <>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Código de instalación</h3>
                  <p className="text-xs text-gray-500 mb-4">
                    Copia y pega este script en el HTML de tu sitio web, justo antes de la etiqueta <code className="bg-gray-100 px-1 rounded">&lt;/body&gt;</code>.
                  </p>
                  <div className="relative">
                    <pre className="bg-gray-900 text-green-400 p-4 rounded-xl text-xs overflow-x-auto whitespace-pre-wrap break-all">
                      {embedCode}
                    </pre>
                    <button
                      onClick={handleCopy}
                      className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white text-[10px] rounded-md transition-colors"
                    >
                      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copied ? "Copiado" : "Copiar"}
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <p className="text-xs text-amber-800">
                    <strong>Nota:</strong> El widget se conecta en tiempo real vía WebSocket. Los mensajes de los visitantes aparecerán automáticamente en tu bandeja de comunicaciones.
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <p className="text-xs text-blue-800">
                    <strong>Consejo:</strong> Si tienes un bot asignado a esta bandeja, responderá automáticamente a los visitantes del chat.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right panel — Preview */}
        <div className="flex-1 bg-gray-50 flex items-center justify-center p-8 relative overflow-hidden">
          <div className="text-center mb-4 absolute top-4 left-1/2 -translate-x-1/2">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Eye className="h-3.5 w-3.5" />
              Vista previa
            </div>
          </div>

          {/* Preview mockup */}
          <div className="relative w-full max-w-sm">
            {/* Chat window preview */}
            <div className="w-[360px] mx-auto rounded-2xl overflow-hidden shadow-2xl border border-gray-100 bg-white">
              {/* Header */}
              <div className="px-5 py-4 flex items-center gap-3 relative" style={{ backgroundColor: config.primaryColor }}>
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {config.avatarUrl ? (
                    <img src={config.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <MessageCircle className="h-5 w-5 text-white/90" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-white text-sm font-bold leading-tight">{config.headerTitle}</h3>
                  <p className="text-white/70 text-[11px] mt-0.5 leading-snug">{config.headerSubtitle}</p>
                </div>
                {/* Close button */}
                <div className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/15 flex items-center justify-center">
                  <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </div>
              </div>

              {/* Messages */}
              <div className="p-5 space-y-3 min-h-[260px] bg-gray-50">
                {/* Welcome message */}
                <div className="max-w-[82%]">
                  <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-white border border-gray-200 text-gray-800 text-[13px] leading-relaxed shadow-sm">
                    {config.welcomeMessage}
                  </div>
                </div>
                {/* Sample visitor message */}
                <div className="max-w-[82%] ml-auto">
                  <div
                    className="px-4 py-3 rounded-2xl rounded-br-sm text-white text-[13px] leading-relaxed"
                    style={{ backgroundColor: config.primaryColor }}
                  >
                    Hola, necesito información
                  </div>
                </div>
                {/* Sample agent response */}
                <div className="max-w-[82%]">
                  <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-white border border-gray-200 text-gray-800 text-[13px] leading-relaxed shadow-sm">
                    ¡Con gusto! ¿En qué puedo ayudarte?
                  </div>
                </div>
              </div>

              {/* Input */}
              <div className="px-4 py-3.5 border-t border-gray-100 flex items-center gap-2.5 bg-white">
                <div className="flex-1 px-4 py-2.5 border-[1.5px] border-gray-300 rounded-full text-[13px] text-gray-400">
                  {config.inputPlaceholder}
                </div>
                <div
                  className="h-10 w-10 rounded-full flex items-center justify-center text-white flex-shrink-0"
                  style={{ backgroundColor: config.primaryColor }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </div>
              </div>
            </div>

            {/* Bubble preview */}
            <div
              className={`absolute -bottom-4 ${config.position === "right" ? "right-0" : "left-0"} h-14 w-14 rounded-full flex items-center justify-center text-white shadow-lg`}
              style={{ backgroundColor: config.primaryColor }}
            >
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Image Cropper Modal */}
      <AnimatePresence>
        {cropperSrc && (
          <ImageCropper
            imageSrc={cropperSrc}
            fileName={cropperFileName}
            aspect={1}
            title="Recortar avatar del widget"
            onCropComplete={handleCropComplete}
            onCancel={handleCropCancel}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
