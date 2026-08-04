import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MessageSquare, Send, Wifi, WifiOff, MessageCircle, Phone, Camera, Mail, Settings2, Inbox, CheckCheck, BellOff, Archive, Trash2, UserCircle, Reply, Copy, X, Smile, Paperclip, Mic, StickyNote, Image, FileText, Filter, ArrowUpDown } from "lucide-react";
import { WhatsAppIcon, MessengerIcon, InstagramIcon, FormIcon } from "@/components/ChannelIcons";
import { TemplateSelector, TemplateConfigModal } from "@/components/TemplateModal";
import { useAuth } from "@/context/AuthContext";
import { useSocket } from "@/hooks/useSocket";
import { ChatEmpty } from "./ChatEmpty";
import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

interface Inbox {
  id: string;
  name: string;
  channel: string;
  status: string;
  channelName: string | null;
}

interface Conversation {
  id: string;
  inboxId: string;
  contactId: string;
  contactName: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  labelIds?: string[];
  inbox?: {
    id: string;
    name: string;
    channel: string;
  } | null;
  record?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
  } | null;
}

interface Message {
  id: string;
  conversationId: string;
  direction: string;
  messageType: string;
  content: string | null;
  mediaUrl?: string | null;
  mediaMimeType?: string | null;
  status: string;
  createdAt: string;
  externalId?: string | null;
  replyToExternalId?: string | null;
  sender?: {
    id: string;
    name: string;
    avatarPath: string | null;
  } | null;
}

export function Conversaciones() {
  const { slug, conversationId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const tenantRole = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const tenantId = tenantRole?.tenantId || "";
  const { joinConversation, leaveConversation, on } = useSocket(tenantId || undefined);

  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const activeConversation = conversations.find((c) => c.id === conversationId) || null;
  const setActiveConversation = (conv: Conversation | null) => {
    if (conv) {
      navigate(`/${slug}/comunicaciones/conversaciones/${conv.id}`);
    } else {
      navigate(`/${slug}/comunicaciones/conversaciones`);
    }
  };
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [inputMode, setInputMode] = useState<"reply" | "note">("reply");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [channelDropdownOpen, setChannelDropdownOpen] = useState(false);
  const [selectedInboxFilter, setSelectedInboxFilter] = useState<Set<string>>(new Set());
  const [conversationsTotal, setConversationsTotal] = useState(0);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [hasMoreConversations, setHasMoreConversations] = useState(true);
  const conversationListRef = useRef<HTMLDivElement>(null);
  const [labels, setLabels] = useState<Array<{ id: string; slug: string; label: string; description: string | null; color: string; showInSidebar: boolean }>>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; conversation: Conversation } | null>(null);
  const [msgContextMenu, setMsgContextMenu] = useState<{ x: number; y: number; message: Message } | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Conversation | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioPreview, setAudioPreview] = useState<{ blob: Blob; url: string } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const msgContextMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const channelDropdownRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tenantId) return;
    loadInboxes();
    loadConversations();
    loadLabels();
  }, [tenantId]);

  // Reload conversations when filter changes
  useEffect(() => {
    if (!tenantId) return;
    loadConversations();
  }, [selectedInboxFilter]);

  useEffect(() => {
    if (!activeConversation) return;
    isInitialLoad.current = true;
    loadMessages(activeConversation.id);
    api.post(`/chats/conversations/${activeConversation.id}/read`).catch(() => {});
    // Clear unread badge locally
    setConversations((prev) => prev.map((c) => c.id === activeConversation.id ? { ...c, unreadCount: 0 } : c));
    // Join WebSocket room for this conversation
    joinConversation(activeConversation.id);
    return () => { leaveConversation(activeConversation.id); };
  }, [activeConversation?.id]);

  const isInitialLoad = useRef(true);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottom = useRef(true);

  useEffect(() => {
    if (!messages.length) return;
    if (isInitialLoad.current) {
      // Jump instantly to bottom without animation
      requestAnimationFrame(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
      });
      isInitialLoad.current = false;
    } else if (!loadingMore && isNearBottom.current) {
      // For new messages, smooth scroll only if user is near bottom
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    if (!tenantId) return;
    // Listen for real-time updates via WebSocket
    const offConv = on("conversation_updated", (conv: any) => {
      // Update the specific conversation in the list without full reload
      setConversations((prev) => {
        const exists = prev.find((c) => c.id === conv.id);
        if (exists) {
          return prev.map((c) => {
            if (c.id !== conv.id) return c;
            // If this is the active conversation, keep unreadCount at 0
            const unreadCount = c.id === activeConversation?.id ? 0 : conv.unreadCount ?? c.unreadCount;
            return { ...c, ...conv, unreadCount };
          }).sort((a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime());
        }
        // New conversation - add to list
        return [conv, ...prev];
      });
    });
    const offMsg = on("new_message", (data: { conversationId: string; message: any }) => {
      if (activeConversation?.id === data.conversationId) {
        setMessages((prev) => {
          // Skip if already exists by real ID
          if (prev.find((m) => m.id === data.message.id)) return prev;
          // If outbound, replace the optimistic temp message
          if (data.message.direction === "outbound") {
            const tempIdx = prev.findIndex(
              (m) => m.id.startsWith("temp-") && m.content === data.message.content && m.direction === "outbound"
            );
            if (tempIdx !== -1) {
              const updated = [...prev];
              updated[tempIdx] = data.message;
              return updated;
            }
          }
          return [...prev, data.message];
        });
      }
    });
    const offStatus = on("message_status", (data: { messageId: string; status: string }) => {
      setMessages((prev) => prev.map((m) =>
        m.id === data.messageId ? { ...m, status: data.status } : m
      ));
    });
    return () => { offConv?.(); offMsg?.(); offStatus?.(); };
  }, [tenantId, activeConversation?.id, on]);

  useEffect(() => {
    if (!contextMenu) return;
    function handleClick(e: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) setContextMenu(null);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [contextMenu]);

  useEffect(() => {
    if (!msgContextMenu) return;
    function handleClick(e: MouseEvent) {
      if (msgContextMenuRef.current && !msgContextMenuRef.current.contains(e.target as Node)) setMsgContextMenu(null);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [msgContextMenu]);

  useEffect(() => {
    if (!channelDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (channelDropdownRef.current && !channelDropdownRef.current.contains(e.target as Node)) setChannelDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [channelDropdownOpen]);

  const handleContextMenu = useCallback((e: React.MouseEvent, conv: Conversation) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, conversation: conv });
  }, []);

  const handleMsgContextMenu = useCallback((e: React.MouseEvent, msg: Message) => {
    e.preventDefault();
    setMsgContextMenu({ x: e.clientX, y: e.clientY, message: msg });
  }, []);

  const handleMarkAsRead = () => {
    if (!contextMenu) return;
    api.post(`/chats/conversations/${contextMenu.conversation.id}/read`).then(() => {
      loadConversations();
    }).catch(() => {});
    setContextMenu(null);
  };

  const handleMuteConversation = () => {
    // TODO: implement mute
    setContextMenu(null);
  };

  const handleArchiveConversation = () => {
    // TODO: implement archive
    setContextMenu(null);
  };

  const handleDeleteConversation = () => {
    if (!contextMenu) return;
    setDeleteConfirm(contextMenu.conversation);
    setContextMenu(null);
  };

  const confirmDelete = () => {
    if (!deleteConfirm) return;
    api.delete(`/chats/conversations/${deleteConfirm.id}`).then(() => {
      if (activeConversation?.id === deleteConfirm.id) navigate(`/${slug}/comunicaciones/conversaciones`);
      loadConversations();
    }).catch(() => {});
    setDeleteConfirm(null);
  };

  const handleViewContact = () => {
    // TODO: implement view contact
    setContextMenu(null);
  };

  const loadInboxes = () => {
    api.get<Inbox[]>("/chats/inboxes", { params: { tenantId } }).then(({ data }) => setInboxes(data)).catch(() => {});
  };

  const loadConversations = (reset = true) => {
    if (reset) {
      setLoadingConversations(true);
      setConversations([]);
    }
    const params: Record<string, string> = { limit: '15', offset: reset ? '0' : String(conversations.length) };
    if (selectedInboxFilter.size > 0) {
      params.inboxIds = Array.from(selectedInboxFilter).join(',');
    } else {
      params.tenantId = tenantId;
    }
    api.get<{ data: Conversation[]; total: number }>("/chats/conversations", { params })
      .then(({ data: res }) => {
        if (reset) {
          setConversations(res.data);
        } else {
          setConversations((prev) => [...prev, ...res.data]);
        }
        setConversationsTotal(res.total);
        setHasMoreConversations(reset ? res.data.length < res.total : conversations.length + res.data.length < res.total);
      })
      .catch(() => {})
      .finally(() => setLoadingConversations(false));
  };

  const loadLabels = () => {
    api.get("/chats/labels", { params: { tenantId } }).then(({ data }) => setLabels(data)).catch(() => {});
  };

  const loadMessages = (conversationId: string) => {
    setLoadingMessages(true);
    setHasMoreMessages(true);
    api.get<Message[]>(`/chats/conversations/${conversationId}/messages`, { params: { limit: 10 } })
      .then(({ data }) => {
        setMessages(data);
        if (data.length < 10) setHasMoreMessages(false);
      })
      .catch(() => {})
      .finally(() => setLoadingMessages(false));
  };

  const loadOlderMessages = useCallback(() => {
    if (!activeConversation || loadingMore || !hasMoreMessages || messages.length === 0) return;
    setLoadingMore(true);
    const oldestMsg = messages[0];

    api.get<Message[]>(`/chats/conversations/${activeConversation.id}/messages`, { params: { limit: 10, before: oldestMsg.id } })
      .then(({ data }) => {
        if (data.length < 10) setHasMoreMessages(false);
        if (data.length === 0) { setHasMoreMessages(false); return; }
        const container = messagesContainerRef.current;
        const prevHeight = container?.scrollHeight || 0;
        setMessages((prev) => [...data, ...prev]);
        // After React renders new messages, restore scroll position
        setTimeout(() => {
          if (container) {
            const newHeight = container.scrollHeight;
            container.scrollTop = newHeight - prevHeight;
          }
        }, 50);
      })
      .catch(() => {})
      .finally(() => { setTimeout(() => setLoadingMore(false), 100); });
  }, [activeConversation, loadingMore, hasMoreMessages, messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || !activeConversation) return;
    const content = newMessage.trim();
    const tempId = `temp-${Date.now()}`;

    // Optimistic: add message immediately
    const optimisticMsg: Message = {
      id: tempId,
      conversationId: activeConversation.id,
      direction: "outbound",
      messageType: inputMode === "note" ? "note" : "text",
      content,
      status: "sending",
      createdAt: new Date().toISOString(),
      externalId: null,
      replyToExternalId: replyTo?.externalId || null,
      sender: user ? { id: user.id, name: user.name, avatarPath: null } : null,
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setNewMessage("");
    const savedReplyTo = replyTo;
    setReplyTo(null);
    setSending(true);
    // Force scroll to bottom when user sends a message
    isNearBottom.current = true;
    requestAnimationFrame(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); });

    try {
      if (inputMode === "note") {
        await api.post(`/chats/conversations/${activeConversation.id}/note`, {
          content,
          senderId: user?.id,
        });
      } else {
        await api.post(`/chats/conversations/${activeConversation.id}/send`, {
          content,
          senderId: user?.id,
          replyToExternalId: savedReplyTo?.externalId || undefined,
        });
      }
      // Replace optimistic message with real data
      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, status: "sent" } : m));
    } catch {
      // Mark as failed
      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, status: "failed" } : m));
    } finally { setSending(false); }
  };

  const [pendingFile, setPendingFile] = useState<{ file: File; preview: string | null } | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeConversation) return;

    if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
      const preview = URL.createObjectURL(file);
      setPendingFile({ file, preview });
    } else {
      // Documents also get a pending state with preview
      setPendingFile({ file, preview: null });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (docInputRef.current) docInputRef.current.value = "";
  };

  const sendFile = async (file: File, caption?: string) => {
    if (!activeConversation) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("conversationId", activeConversation.id);
    formData.append("senderId", user?.id || "");
    if (caption) formData.append("caption", caption);
    try {
      await api.post("/chats/conversations/upload", formData, { headers: { "Content-Type": "multipart/form-data" } });
    } catch {}
  };

  const handleSendWithFile = async () => {
    if (!activeConversation) return;
    if (pendingFile) {
      const tempId = `temp-${Date.now()}`;
      const isImage = pendingFile.file.type.startsWith("image/");
      const isVideo = pendingFile.file.type.startsWith("video/");

      // Optimistic: show file message immediately
      const optimisticMsg: Message = {
        id: tempId,
        conversationId: activeConversation.id,
        direction: "outbound",
        messageType: isImage ? "image" : isVideo ? "video" : "document",
        content: newMessage.trim() || null,
        mediaUrl: pendingFile.preview || undefined,
        mediaMimeType: pendingFile.file.type,
        status: "sending",
        createdAt: new Date().toISOString(),
        sender: user ? { id: user.id, name: user.name, avatarPath: null } : null,
      };
      setMessages((prev) => [...prev, optimisticMsg]);

      const fileToSend = pendingFile.file;
      const caption = newMessage.trim() || undefined;
      if (pendingFile.preview) URL.revokeObjectURL(pendingFile.preview);
      setPendingFile(null);
      setNewMessage("");

      try {
        await sendFile(fileToSend, caption);
        setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, status: "sent" } : m));
      } catch {
        setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, status: "failed" } : m));
      }
    } else {
      handleSend();
    }
  };

  const cancelPendingFile = () => {
    if (pendingFile?.preview) URL.revokeObjectURL(pendingFile.preview);
    setPendingFile(null);
  };

  const insertEmoji = (emoji: string) => {
    setNewMessage((prev) => prev + emoji);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
  };

  const QUICK_EMOJIS = ["😀", "😂", "❤️", "👍", "🙏", "🎉", "🔥", "👋", "✅", "💯", "😊", "🤝", "⭐", "💪", "🙌", "😍", "🤔", "👏", "💚", "🚀"];

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Use ogg/opus which WhatsApp supports, fallback to webm/opus
      const mimeType = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : 'audio/webm;codecs=opus';
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingIntervalRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch {
      // Permission denied or not supported
    }
  };

  const stopRecording = () => {
    if (!mediaRecorderRef.current) return;
    mediaRecorderRef.current.onstop = () => {
      const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      setAudioPreview({ blob, url });
      mediaRecorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
    mediaRecorderRef.current.stop();
    setIsRecording(false);
    if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    audioChunksRef.current = [];
    setIsRecording(false);
    if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    if (audioPreview) {
      URL.revokeObjectURL(audioPreview.url);
      setAudioPreview(null);
    }
  };

  const sendAudio = async () => {
    if (!audioPreview || !activeConversation) return;
    const mimeType = audioPreview.blob.type;
    const ext = mimeType.includes('ogg') ? 'ogg' : 'webm';
    const file = new File([audioPreview.blob], `audio-${Date.now()}.${ext}`, { type: mimeType });
    const previewUrl = audioPreview.url;
    setAudioPreview(null);

    // Optimistic message
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: Message = {
      id: tempId,
      conversationId: activeConversation.id,
      direction: "outbound",
      messageType: "audio",
      content: null,
      mediaUrl: previewUrl,
      mediaMimeType: mimeType,
      status: "sending",
      createdAt: new Date().toISOString(),
      sender: user ? { id: user.id, name: user.name, avatarPath: null } : null,
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      await sendFile(file);
      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, status: "sent" } : m));
    } catch {
      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, status: "failed" } : m));
    } finally {
      URL.revokeObjectURL(previewUrl);
    }
  };

  const formatRecordingTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const filteredConversations = conversations;

  const getDisplayName = (conv: Conversation) => {
    if (conv.record) {
      const parts = [conv.record.firstName, conv.record.lastName].filter(Boolean);
      if (parts.length > 0) return parts.join(" ");
    }
    return conv.contactName || conv.contactId;
  };

  return (
    <>
      {/* Conversations sidebar */}
      <div className="w-80 border-r border-gray-200 flex flex-col shrink-0">
          <div className="px-3 py-2.5 border-b border-gray-100">
            <div className="flex items-center justify-between">
            <div className="relative" ref={channelDropdownRef}>
              <button
                onClick={() => setChannelDropdownOpen((v) => !v)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
              >
                {selectedInboxFilter.size > 0 ? (
                  <>
                    <MessageSquare className="h-4 w-4 text-brand-500" />
                    <span>{selectedInboxFilter.size} canal{selectedInboxFilter.size > 1 ? "es" : ""}</span>
                  </>
                ) : (
                  <>
                    <MessageSquare className="h-4 w-4 text-gray-400" />
                    <span>Todos los canales</span>
                  </>
                )}
                <svg className={`h-3.5 w-3.5 text-gray-400 transition-transform ${channelDropdownOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </button>
              {channelDropdownOpen && (
                <div className="absolute top-full left-0 mt-1.5 w-64 bg-white rounded-xl shadow-xl border border-gray-200/80 py-1.5 z-50">
                  <p className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Canales</p>
                  <button
                    onClick={() => { setSelectedInboxFilter(new Set()); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${selectedInboxFilter.size === 0 ? "bg-brand-50 text-brand-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}
                  >
                    <div className="h-7 w-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                      <MessageSquare className="h-3.5 w-3.5 text-gray-500" />
                    </div>
                    <span className="flex-1 text-left">Todos los canales</span>
                    {selectedInboxFilter.size === 0 && <span className="text-brand-500">✓</span>}
                  </button>
                  {inboxes.map((inbox) => {
                    const isSelected = selectedInboxFilter.has(inbox.id);
                    return (
                    <button
                      key={inbox.id}
                      onClick={() => {
                        setSelectedInboxFilter((prev) => {
                          const next = new Set(prev);
                          if (next.has(inbox.id)) next.delete(inbox.id);
                          else next.add(inbox.id);
                          return next;
                        });
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${isSelected ? "bg-brand-50 text-brand-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}
                    >
                      <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${inbox.channel === "whatsapp" ? "bg-green-50" : inbox.channel === "messenger" ? "bg-blue-50" : inbox.channel === "form" ? "bg-purple-50" : inbox.channel === "sms" ? "bg-sky-50" : inbox.channel === "llamada" ? "bg-purple-50" : inbox.channel === "email" ? "bg-orange-50" : "bg-pink-50"}`}>
                        {inbox.channel === "whatsapp" && <WhatsAppIcon className="h-3.5 w-3.5 text-green-600" />}
                        {inbox.channel === "messenger" && <MessengerIcon className="h-3.5 w-3.5 text-blue-600" />}
                        {inbox.channel === "instagram" && <InstagramIcon className="h-3.5 w-3.5 text-pink-600" />}
                        {inbox.channel === "sms" && <MessageSquare className="h-3.5 w-3.5 text-sky-600" />}
                        {inbox.channel === "llamada" && <Phone className="h-3.5 w-3.5 text-purple-600" />}
                        {inbox.channel === "email" && <Mail className="h-3.5 w-3.5 text-orange-600" />}
                        {inbox.channel === "form" && <FormIcon className="h-3.5 w-3.5 text-purple-600" />}
                      </div>
                      <span className="flex-1 text-left">{inbox.name}</span>
                      {inbox.status === "connected" ? <span className="h-2 w-2 rounded-full bg-green-400" /> : <span className="h-2 w-2 rounded-full bg-gray-300" />}
                      <button
                        onClick={(e) => { e.stopPropagation(); setChannelDropdownOpen(false); navigate(`/${slug}/inboxes/${inbox.id}/settings`); }}
                        className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                      </button>
                      {isSelected && <span className="text-brand-500">✓</span>}
                    </button>
                    );
                  })}
                  <div className="border-t border-gray-100 mt-1.5 pt-1.5">
                    <button
                      onClick={() => { setChannelDropdownOpen(false); navigate(`/${slug}/inboxes/new`); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-brand-600 hover:bg-brand-50 transition-colors font-medium"
                    >
                      <div className="h-7 w-7 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                        <span className="text-brand-500 text-lg leading-none">+</span>
                      </div>
                      Nuevo canal
                    </button>
                  </div>
                </div>
              )}
            </div>
              <div className="flex items-center gap-1">
                <button className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" title="Filtrar">
                  <Filter className="h-4 w-4" />
                </button>
                <button className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" title="Ordenar">
                  <ArrowUpDown className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div
            className="flex-1 overflow-y-auto"
            ref={conversationListRef}
            onScroll={() => {
              const el = conversationListRef.current;
              if (!el || loadingConversations || !hasMoreConversations) return;
              if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
                loadConversations(false);
              }
            }}
          >
            {filteredConversations.length === 0 && !loadingConversations ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-6">
                <MessageSquare className="h-8 w-8 text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">Sin conversaciones</p>
                <p className="text-[11px] text-gray-400 mt-1">Los mensajes entrantes aparecerán aquí</p>
              </div>
            ) : (
              filteredConversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setActiveConversation(conv)}
                  onContextMenu={(e) => handleContextMenu(e, conv)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-50 transition-colors ${activeConversation?.id === conv.id ? "bg-brand-50" : "hover:bg-gray-50"}`}
                >
                  <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-bold text-gray-600 shrink-0">
                    {getDisplayName(conv).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* Channel name */}
                    {conv.inbox && (
                      <p className="text-[10px] text-gray-400 flex items-center gap-1 mb-0.5">
                        {conv.inbox.channel === "whatsapp" && <WhatsAppIcon className="h-2.5 w-2.5 text-green-500" />}
                        {conv.inbox.channel === "messenger" && <MessengerIcon className="h-2.5 w-2.5 text-blue-500" />}
                        {conv.inbox.channel === "instagram" && <InstagramIcon className="h-2.5 w-2.5 text-pink-500" />}
                        {conv.inbox.channel === "form" && <FormIcon className="h-2.5 w-2.5 text-purple-500" />}
                        {conv.inbox.name}
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900 truncate">{getDisplayName(conv)}</p>
                      <span className="text-[10px] text-gray-400 shrink-0 ml-2">
                        {conv.lastMessageAt ? (() => {
                          const d = new Date(conv.lastMessageAt!);
                          const today = new Date();
                          if (d.toDateString() === today.toDateString()) {
                            return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                          }
                          return d.toLocaleDateString([], { day: "numeric", month: "short" });
                        })() : ""}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-xs text-gray-500 truncate flex items-center gap-1">
                        {conv.lastMessage === "[image]" || conv.lastMessage === "[Image]" ? (
                          <><Camera className="h-3 w-3 inline shrink-0" /> Foto</>
                        ) : conv.lastMessage === "[video]" || conv.lastMessage === "[Video]" ? (
                          <><Camera className="h-3 w-3 inline shrink-0" /> Video</>
                        ) : conv.lastMessage === "[audio]" || conv.lastMessage === "[Audio]" ? (
                          <><Phone className="h-3 w-3 inline shrink-0" /> Audio</>
                        ) : conv.lastMessage === "[document]" || conv.lastMessage === "[Document]" ? (
                          <><MessageSquare className="h-3 w-3 inline shrink-0" /> Documento</>
                        ) : conv.lastMessage === "[sticker]" || conv.lastMessage === "[Sticker]" ? (
                          <>🎭 Sticker</>
                        ) : (
                          <>{conv.lastMessage || "..."}</>
                        )}
                      </p>
                      {conv.unreadCount > 0 && (
                        <span className="h-5 min-w-5 px-1 rounded-full bg-brand-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                    {conv.labelIds && conv.labelIds.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {conv.labelIds.map((lid) => {
                          const lbl = labels.find((l) => l.id === lid);
                          if (!lbl) return null;
                          return (
                            <span key={lid} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium" style={{ backgroundColor: `${lbl.color}20`, color: lbl.color }}>
                              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: lbl.color }} />
                              {lbl.label}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </button>
              ))
            )}
            {loadingConversations && (
              <div className="flex items-center justify-center py-3">
                <div className="h-4 w-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

        </div>

        {/* Chat panel */}
        <div className="flex-1 flex flex-col bg-gray-50 min-w-0 overflow-hidden">
          {activeConversation ? (
            <>
              <div className="h-14 px-6 flex items-center border-b border-gray-200 bg-white shrink-0">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
                    {getDisplayName(activeConversation).charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{getDisplayName(activeConversation)}</p>
                    <p className="text-[10px] text-gray-400">{activeConversation.contactId}</p>
                  </div>
                </div>
              </div>

              <div
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-4 space-y-2"
                onScroll={(e) => {
                  const el = e.currentTarget;
                  // Track if user is near bottom
                  isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
                  // Load older messages when scrolled to top
                  if (el.scrollTop < 50 && hasMoreMessages && !loadingMore) loadOlderMessages();
                }}
              >
                {loadingMessages ? (
                  <div className="flex-1 flex items-center justify-center h-full">
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-6 w-6 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
                    </div>
                  </div>
                ) : (
                <>
                {loadingMore && (
                  <div className="flex justify-center py-2">
                    <div className="h-4 w-4 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
                  </div>
                )}
                {messages.map((msg) => {
                  const replyMsg = msg.replyToExternalId
                    ? messages.find((m) => m.externalId === msg.replyToExternalId)
                    : null;

                  return (
                  msg.messageType === "system" ? (
                  <div key={msg.id} id={`msg-${msg.id}`} className="flex justify-center">
                    <span
                      className="relative group/sys px-3 py-1 rounded-full bg-gray-200/70 text-[11px] text-gray-500 font-medium cursor-default"
                    >
                      {msg.content}
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded-md bg-gray-900 text-white text-[10px] whitespace-nowrap opacity-0 group-hover/sys:opacity-100 pointer-events-none transition-opacity duration-150">
                        {new Date(msg.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                      </span>
                    </span>
                  </div>
                  ) :
                  <div key={msg.id} id={`msg-${msg.id}`} className={`flex items-end gap-2 ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`} onContextMenu={(e) => handleMsgContextMenu(e, msg)}>
                    {msg.direction === "outbound" && msg.sender && (
                      <div className="relative group h-6 w-6 shrink-0 order-1">
                        <div className="h-6 w-6 rounded-full bg-brand-200 flex items-center justify-center text-[10px] font-bold text-brand-700">
                          {msg.sender.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="absolute bottom-full right-0 mb-1.5 px-2 py-1 rounded-md bg-gray-900 text-white text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150">
                          Enviado por: {msg.sender.name}
                        </div>
                      </div>
                    )}
                    <div className={`${msg.messageType === "template" ? "max-w-[320px]" : msg.direction === "outbound" ? "max-w-[min(70%,400px)]" : "max-w-[min(40%,300px)]"} px-4 py-2.5 rounded-2xl text-sm break-words ${msg.messageType === "template" ? "bg-green-50 border border-green-200 text-gray-800 rounded-br-md" : msg.messageType === "note" ? "bg-yellow-100 border border-yellow-200 text-yellow-900 rounded-br-md" : msg.direction === "outbound" ? "bg-brand-600 text-white rounded-br-md" : "bg-white border border-gray-200 text-gray-800 rounded-bl-md"}`}>
                      {msg.messageType === "template" && (
                        <TemplateBubble msg={msg} />
                      )}
                      {msg.messageType === "note" && (
                        <p className="text-[10px] font-medium text-yellow-600 mb-1 flex items-center gap-1"><StickyNote className="h-3 w-3" /> Nota privada</p>
                      )}
                      {replyMsg && (
                        <div
                          onClick={() => {
                            const el = document.getElementById(`msg-${replyMsg.id}`);
                            if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.add("ring-2", "ring-brand-300"); setTimeout(() => el.classList.remove("ring-2", "ring-brand-300"), 2000); }
                          }}
                          className={`mb-2 px-3 py-1.5 rounded-lg border-l-2 cursor-pointer transition-colors ${msg.direction === "outbound" ? "bg-white/10 border-white/40 hover:bg-white/15" : "bg-gray-100 border-gray-400 hover:bg-gray-150"}`}
                        >
                          <p className={`text-[10px] font-medium ${msg.direction === "outbound" ? "text-white/70" : "text-gray-500"}`}>
                            {replyMsg.direction === "outbound" ? "Tú" : getDisplayName(activeConversation!)}
                          </p>
                          <div className="flex items-center gap-2">
                            <p className={`text-[11px] truncate flex-1 ${msg.direction === "outbound" ? "text-white/60" : "text-gray-500"}`}>
                              {replyMsg.content || (replyMsg.mediaUrl ? "" : `[${replyMsg.messageType}]`)}
                            </p>
                            {replyMsg.mediaUrl && (replyMsg.messageType === "image" || replyMsg.mediaMimeType?.startsWith("image/")) && (
                              <img src={replyMsg.mediaUrl} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
                            )}
                          </div>
                        </div>
                      )}
                      {msg.mediaUrl && (msg.messageType === "image" || msg.mediaMimeType?.startsWith("image/")) ? (
                        <ChatImage src={msg.mediaUrl} alt={msg.content || "Imagen"} />
                      ) : msg.mediaUrl && (msg.messageType === "video" || msg.mediaMimeType?.startsWith("video/")) ? (
                        <video
                          src={msg.mediaUrl}
                          controls
                          className="rounded-lg max-w-full max-h-60 mb-1"
                        />
                      ) : msg.mediaUrl && (msg.messageType === "audio" || msg.mediaMimeType?.startsWith("audio/")) ? (
                        <audio src={msg.mediaUrl} controls className="max-w-full mb-1" />
                      ) : msg.mediaUrl && (msg.messageType === "document") ? (
                        <a
                          href={msg.mediaUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-1 ${msg.direction === "outbound" ? "bg-white/10 hover:bg-white/20" : "bg-gray-100 hover:bg-gray-200"} transition-colors`}
                        >
                          <span className="text-lg">📄</span>
                          <span className={`text-xs underline ${msg.direction === "outbound" ? "text-white/80" : "text-brand-600"}`}>
                            Abrir documento
                          </span>
                        </a>
                      ) : msg.mediaUrl && msg.messageType === "sticker" ? (
                        <img
                          src={msg.mediaUrl}
                          alt="Sticker"
                          className="max-w-[150px] max-h-[150px] mb-1"
                        />
                      ) : null}
                      {msg.content && msg.messageType !== "template" && <p className="whitespace-pre-wrap">{msg.content}</p>}
                      {!msg.content && !msg.mediaUrl && msg.messageType !== "template" && <p className="whitespace-pre-wrap text-gray-400 italic">[{msg.messageType}]</p>}
                      <p className={`text-[10px] mt-1 flex items-center gap-1 ${msg.messageType === "template" ? "text-green-500" : msg.messageType === "note" ? "text-yellow-500" : msg.direction === "outbound" ? "text-white/60" : "text-gray-400"}`}>
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {msg.direction === "outbound" && msg.messageType !== "note" && (
                          <span className="inline-flex">
                            {msg.status === "sending" && <span className="animate-pulse">⏳</span>}
                            {msg.status === "sent" && <span>✓</span>}
                            {(msg.status === "delivered" || msg.status === "read") && (
                              <svg className={`h-3.5 w-3.5 ${msg.status === "read" ? "text-blue-300" : "currentColor"}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M1.5 8.5l3 3 7-7" />
                                <path d="M5.5 8.5l3 3 7-7" />
                              </svg>
                            )}
                            {msg.status === "failed" && <span className="text-red-300">⚠</span>}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  );
                })}
                <div ref={messagesEndRef} />
                </>
                )}
              </div>

              <div className="border-t border-gray-200 bg-white shrink-0">
                {/* Tabs */}
                <div className="flex items-center px-5 pt-2">
                  <button
                    onClick={() => setInputMode("reply")}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${inputMode === "reply" ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
                  >
                    Responder
                  </button>
                  <button
                    onClick={() => setInputMode("note")}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${inputMode === "note" ? "bg-yellow-100 text-yellow-800" : "text-gray-500 hover:text-gray-700"}`}
                  >
                    <span className="flex items-center gap-1"><StickyNote className="h-3 w-3" /> Nota privada</span>
                  </button>
                </div>

                {/* Reply preview */}
                {replyTo && inputMode === "reply" && (
                  <div className="flex items-center gap-2 mx-5 mt-2 px-3 py-2 rounded-lg bg-gray-100 border-l-3 border-brand-500">
                    <Reply className="h-4 w-4 text-brand-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-medium text-brand-600">
                        Respondiendo a {replyTo.direction === "outbound" ? "ti" : getDisplayName(activeConversation!)}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{replyTo.content || (replyTo.mediaUrl ? "📷 Foto" : `[${replyTo.messageType}]`)}</p>
                    </div>
                    <button onClick={() => setReplyTo(null)} className="p-1 rounded hover:bg-gray-200 text-gray-400 transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {/* File preview */}
                {pendingFile && (
                  <div className="px-5 pt-2">
                    {pendingFile.preview ? (
                      <div className="relative inline-block">
                        {pendingFile.file.type.startsWith("image/") ? (
                          <img src={pendingFile.preview} alt="Preview" className="h-24 rounded-lg object-cover border border-gray-200" />
                        ) : (
                          <video src={pendingFile.preview} className="h-24 rounded-lg border border-gray-200" />
                        )}
                        <button
                          onClick={cancelPendingFile}
                          className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs hover:bg-red-600 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 border border-gray-200">
                        <FileText className="h-4 w-4 text-yellow-600 shrink-0" />
                        <span className="text-sm text-gray-700 truncate max-w-[180px]">{pendingFile.file.name}</span>
                        <span className="text-[11px] text-gray-400 shrink-0">{(pendingFile.file.size / 1024).toFixed(0)} KB</span>
                        <button onClick={cancelPendingFile} className="p-0.5 rounded hover:bg-gray-200 text-gray-400 transition-colors">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Textarea */}
                <div className="px-5 py-2">
                  <textarea
                    ref={textareaRef}
                    value={newMessage}
                    onChange={(e) => { setNewMessage(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); pendingFile ? handleSendWithFile() : handleSend(); } }}
                    placeholder={pendingFile ? "Añade un texto (opcional)..." : inputMode === "note" ? "Escribe una nota privada..." : "Shift + enter para nueva línea"}
                    rows={1}
                    className={`w-full resize-none text-sm outline-none placeholder-gray-400 ${inputMode === "note" ? "text-yellow-800" : "text-gray-800"}`}
                    style={{ minHeight: "24px", maxHeight: "120px" }}
                  />
                </div>

                {/* Toolbar */}
                <div className="flex items-center justify-between px-5 pb-3">
                  <div className="flex items-center gap-1">
                    {/* Emoji */}
                    <div className="relative">
                      <button
                        onClick={() => setShowEmojiPicker((v) => !v)}
                        className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                      >
                        <Smile className="h-4.5 w-4.5" />
                      </button>
                      {showEmojiPicker && (
                        <div className="absolute bottom-full left-0 mb-2 p-2 bg-white rounded-xl shadow-lg border border-gray-200 grid grid-cols-10 gap-1 w-64 z-50">
                          {QUICK_EMOJIS.map((emoji) => (
                            <button
                              key={emoji}
                              onClick={() => insertEmoji(emoji)}
                              className="h-8 w-8 flex items-center justify-center rounded hover:bg-gray-100 text-lg transition-colors"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Image/Video */}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                      title="Enviar imagen o video"
                    >
                      <Image className="h-4.5 w-4.5" />
                    </button>
                    <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} accept="image/*,video/*" />
                    {/* Document */}
                    <button
                      onClick={() => docInputRef.current?.click()}
                      className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                      title="Enviar documento"
                    >
                      <FileText className="h-4.5 w-4.5" />
                    </button>
                    <input ref={docInputRef} type="file" className="hidden" onChange={handleFileSelect} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" />
                    {/* Audio note */}
                    {isRecording ? (
                      <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-red-50 border border-red-200">
                        <button
                          onClick={cancelRecording}
                          className="p-1 rounded text-red-500 hover:bg-red-100 transition-colors"
                          title="Cancelar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        <span className="text-xs font-mono text-red-600 w-10">{formatRecordingTime(recordingTime)}</span>
                        <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                        <button
                          onClick={stopRecording}
                          className="p-1.5 rounded-full bg-red-500 hover:bg-red-600 text-white transition-colors"
                          title="Parar grabación"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : audioPreview ? (
                      <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-brand-50 border border-brand-200">
                        <button
                          onClick={cancelRecording}
                          className="p-1 rounded text-gray-500 hover:bg-gray-200 transition-colors"
                          title="Descartar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        <audio src={audioPreview.url} controls className="h-8 max-w-[160px]" />
                        <button
                          onClick={sendAudio}
                          className="p-1.5 rounded-full bg-brand-600 hover:bg-brand-700 text-white transition-colors"
                          title="Enviar audio"
                        >
                          <Send className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={startRecording}
                        className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                        title="Grabar nota de voz"
                      >
                        <Mic className="h-4.5 w-4.5" />
                      </button>
                    )}
                  </div>

                  {/* Send */}
                  <div className="flex items-center gap-2">
                    {/* Template selector (WhatsApp only) */}
                    {activeConversation?.inbox?.channel === "whatsapp" && inputMode === "reply" && (
                      <TemplateSelector
                        inboxId={activeConversation.inboxId}
                        onSelect={(t) => setSelectedTemplate(t)}
                        iconOnly
                      />
                    )}
                    <button
                      onClick={pendingFile ? handleSendWithFile : handleSend}
                      disabled={(!newMessage.trim() && !pendingFile) || sending}
                      className={`flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-40 ${inputMode === "note" ? "bg-yellow-500 hover:bg-yellow-600 text-white" : "bg-brand-600 hover:bg-brand-700 text-white"}`}
                    >
                      <Send className="h-4 w-4" />
                      {sending ? "..." : inputMode === "note" ? "Guardar nota" : "Enviar"}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <ChatEmpty />
          )}
        </div>

      {/* Message context menu */}
      {msgContextMenu && (
        <div
          ref={msgContextMenuRef}
          className="fixed z-[100] w-52 bg-white rounded-lg shadow-lg border border-gray-200 py-1 animate-in fade-in zoom-in-95 duration-100"
          style={{ top: msgContextMenu.y, left: msgContextMenu.x }}
        >
          <button
            onClick={() => { setReplyTo(msgContextMenu.message); setMsgContextMenu(null); textareaRef.current?.focus(); }}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Reply className="h-4 w-4 text-gray-400" />
            Responder
          </button>
          <button
            onClick={() => {
              if (msgContextMenu.message.content) navigator.clipboard.writeText(msgContextMenu.message.content);
              setMsgContextMenu(null);
            }}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Copy className="h-4 w-4 text-gray-400" />
            Copiar texto
          </button>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-[100] w-52 bg-white rounded-lg shadow-lg border border-gray-200 py-1 animate-in fade-in zoom-in-95 duration-100"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            onClick={handleMarkAsRead}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <CheckCheck className="h-4 w-4 text-gray-400" />
            Marcar como leído
          </button>
          <button
            onClick={handleMuteConversation}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <BellOff className="h-4 w-4 text-gray-400" />
            Silenciar
          </button>
          <button
            onClick={handleViewContact}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <UserCircle className="h-4 w-4 text-gray-400" />
            Ver contacto
          </button>
          <button
            onClick={handleArchiveConversation}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Archive className="h-4 w-4 text-gray-400" />
            Archivar
          </button>
          {/* Labels - hover submenu */}
          {labels.length > 0 && (
            <div className="relative group/labels">
              <button className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                <svg className="h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" />
                </svg>
                <span className="flex-1 text-left">Asignar etiqueta</span>
                <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>
              <div className="absolute left-full top-0 ml-1 w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-1 opacity-0 invisible group-hover/labels:opacity-100 group-hover/labels:visible transition-all z-[110] max-h-52 overflow-y-auto">
                {labels.map((lbl) => {
                  const isAssigned = contextMenu?.conversation.labelIds?.includes(lbl.id);
                  return (
                    <button
                      key={lbl.id}
                      onClick={() => {
                        if (!contextMenu) return;
                        const action = isAssigned ? "remove" : "add";
                        const convId = contextMenu.conversation.id;

                        // Optimistic update — instant UI
                        setConversations((prev) =>
                          prev.map((c) => {
                            if (c.id !== convId) return c;
                            const currentLabels = c.labelIds || [];
                            const newLabels = action === "add"
                              ? [...currentLabels, lbl.id]
                              : currentLabels.filter((id) => id !== lbl.id);
                            return { ...c, labelIds: newLabels };
                          })
                        );
                        setContextMenu(null);

                        // Optimistic: add note to chat instantly
                        if (activeConversation?.id === convId) {
                          const noteMsg: Message = {
                            id: `temp-label-${Date.now()}`,
                            conversationId: convId,
                            direction: "outbound",
                            messageType: "note",
                            content: `${user?.name} ${action === "add" ? "agregó" : "quitó"} ${lbl.label}`,
                            status: "delivered",
                            createdAt: new Date().toISOString(),
                            sender: user ? { id: user.id, name: user.name, avatarPath: null } : null,
                          };
                          setMessages((prev) => [...prev, noteMsg]);
                        }

                        // Fire and forget
                        api.post(`/chats/conversations/${convId}/toggle-label`, {
                          labelId: lbl.id,
                          action,
                          userId: user?.id,
                          userName: user?.name,
                        }).catch(() => {
                          // Revert on error
                          setConversations((prev) =>
                            prev.map((c) => {
                              if (c.id !== convId) return c;
                              const currentLabels = c.labelIds || [];
                              const reverted = action === "add"
                                ? currentLabels.filter((id) => id !== lbl.id)
                                : [...currentLabels, lbl.id];
                              return { ...c, labelIds: reverted };
                            })
                          );
                        });
                      }}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: lbl.color }} />
                      <span className="flex-1 text-left truncate">{lbl.label}</span>
                      {isAssigned && <span className="text-brand-500 text-[10px]">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="my-1 border-t border-gray-100" />
          <button
            onClick={handleDeleteConversation}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="h-4 w-4 text-red-400" />
            Eliminar conversación
          </button>
        </div>
      )}

      {/* Template config modal */}
      {selectedTemplate && activeConversation && (
        <TemplateConfigModal
          template={selectedTemplate}
          conversationId={activeConversation.id}
          senderId={user?.id}
          contact={activeConversation.record}
          onClose={() => setSelectedTemplate(null)}
          onSent={() => { if (activeConversation) loadMessages(activeConversation.id); loadConversations(); }}
        />
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex flex-col items-center text-center">
              <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
                <Trash2 className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 mb-1">Eliminar conversación</h3>
              <p className="text-sm text-gray-500 mb-6">
                ¿Estás seguro de eliminar la conversación con <span className="font-medium text-gray-700">{getDisplayName(deleteConfirm)}</span>? Se borrarán todos los mensajes. Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 px-4 py-2.5 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 px-4 py-2.5 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ChatImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="relative rounded-lg overflow-hidden mb-1 cursor-pointer max-w-full" onClick={() => window.open(src, '_blank')}>
      {/* Blur placeholder */}
      {!loaded && (
        <div className="w-48 h-36 bg-gray-200/50 backdrop-blur-sm flex items-center justify-center animate-pulse rounded-lg">
          <Image className="h-6 w-6 text-gray-300" />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className={`rounded-lg max-w-full max-h-60 object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0 absolute inset-0"}`}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}

function TemplateBubble({ msg }: { msg: Message }) {
  // Try to parse template components from mediaUrl
  let templateData: { name?: string; components?: any[] } | null = null;
  try {
    if (msg.mediaUrl && msg.mediaUrl.startsWith("{")) {
      templateData = JSON.parse(msg.mediaUrl);
    }
  } catch {}

  if (!templateData?.components) {
    // Fallback: just show content
    return (
      <>
        <p className="text-[10px] font-medium text-green-600 mb-1 flex items-center gap-1">📋 Plantilla</p>
        <p className="whitespace-pre-wrap">{msg.content}</p>
      </>
    );
  }

  const header = templateData.components.find((c: any) => c.type === "HEADER");
  const body = templateData.components.find((c: any) => c.type === "BODY");
  const footer = templateData.components.find((c: any) => c.type === "FOOTER");
  const buttons = templateData.components.find((c: any) => c.type === "BUTTONS");

  // Extract rendered text from content (header\nbody format)
  const contentLines = (msg.content || "").split("\n");
  const hasHeader = header?.text;
  const renderedHeader = hasHeader ? contentLines[0] : "";
  const renderedBody = hasHeader ? contentLines.slice(1).join("\n") : msg.content || "";

  return (
    <>
      {renderedHeader && (
        <p className="font-bold text-gray-900 text-[13px] mb-1">{renderedHeader}</p>
      )}
      <p className="whitespace-pre-wrap text-[13px] text-gray-700 leading-relaxed">{renderedBody}</p>
      {footer?.text && (
        <p className="text-[11px] text-gray-400 mt-2">{footer.text}</p>
      )}
      {buttons?.buttons && buttons.buttons.length > 0 && (
        <div className="mt-2 pt-2 border-t border-green-200 space-y-1">
          {buttons.buttons.map((btn: any, i: number) => (
            <div key={i} className="text-center text-xs text-blue-500 font-medium py-0.5">{btn.text}</div>
          ))}
        </div>
      )}
    </>
  );
}
