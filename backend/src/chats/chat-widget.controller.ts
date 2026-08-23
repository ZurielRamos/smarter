import { Controller, Get, Post, Body, Param, Res, Header, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Inbox } from './inbox.entity';
import { ChatsService } from './chats.service';
import { MediaStorageService } from '../media/media-storage.service';

@Controller('chat-widget')
export class ChatWidgetController {
  constructor(
    @InjectRepository(Inbox)
    private readonly inboxRepo: Repository<Inbox>,
    private readonly chatsService: ChatsService,
    private readonly mediaStorageService: MediaStorageService,
  ) {}

  /**
   * Serve the embeddable widget script.
   * Public endpoint — no auth required.
   */
  @Public()
  @Get('script/:inboxId')
  @Header('Content-Type', 'application/javascript')
  @Header('Cache-Control', 'public, max-age=300')
  async getWidgetScript(@Param('inboxId') inboxId: string, @Res() res: Response) {
    const inbox = await this.inboxRepo.findOne({ where: { id: inboxId, channel: 'chat' } });
    if (!inbox) {
      res.status(404).send('// Inbox not found');
      return;
    }

    const config = inbox.metadata?.widgetConfig || {};
    const wsUrl = process.env.APP_URL || 'http://localhost:3000';

    const script = this.generateWidgetScript(inboxId, wsUrl, config);
    res.send(script);
  }

  /**
   * Public endpoint to initiate a chat session from the widget.
   * Creates or resumes a conversation for the visitor.
   */
  @Public()
  @Post('session/:inboxId')
  async createSession(
    @Param('inboxId') inboxId: string,
    @Body() body: {
      visitorId?: string;
      name?: string;
      email?: string;
      attribution?: Record<string, string>;
    },
  ) {
    const inbox = await this.inboxRepo.findOne({
      where: { id: inboxId, channel: 'chat' },
      relations: { tenant: true },
    });
    if (!inbox) {
      return { error: 'Inbox not found' };
    }

    // Find or create conversation for this visitor
    const session = await this.chatsService.getOrCreateChatWidgetSession(
      inbox,
      body.visitorId,
      body.name,
      body.email,
      body.attribution,
    );

    return session;
  }

  /**
   * Public endpoint to send a message from the widget visitor.
   */
  @Public()
  @Post('message/:inboxId')
  async sendMessage(
    @Param('inboxId') inboxId: string,
    @Body() body: { conversationId: string; visitorId: string; content: string },
  ) {
    const inbox = await this.inboxRepo.findOne({
      where: { id: inboxId, channel: 'chat' },
    });
    if (!inbox) {
      return { error: 'Inbox not found' };
    }

    const message = await this.chatsService.createChatWidgetMessage(
      inbox,
      body.conversationId,
      body.visitorId,
      body.content,
    );

    return message;
  }

  /**
   * Upload avatar image for the chat widget.
   * Requires auth (not public).
   */
  @Post('avatar/:inboxId')
  @UseInterceptors(FileInterceptor('avatar'))
  async uploadAvatar(
    @Param('inboxId') inboxId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const inbox = await this.inboxRepo.findOne({ where: { id: inboxId, channel: 'chat' } });
    if (!inbox) {
      return { error: 'Inbox not found' };
    }

    if (!file) {
      return { error: 'No file provided' };
    }

    const stored = await this.mediaStorageService.uploadBuffer(
      file.buffer,
      {
        tenantId: inbox.tenantId,
        channel: 'chat',
        conversationId: 'widget-avatar',
        messageId: inboxId,
        mimeType: file.mimetype,
        filename: file.originalname,
      },
    );

    if (!stored) {
      return { error: 'Upload failed' };
    }

    // Save avatar URL in widget config
    const widgetConfig = inbox.metadata?.widgetConfig || {};
    widgetConfig.avatarUrl = stored.url;
    inbox.metadata = { ...inbox.metadata, widgetConfig };
    await this.inboxRepo.save(inbox);

    return { url: stored.url };
  }

  private generateWidgetScript(inboxId: string, wsUrl: string, config: any): string {
    const primaryColor = config.primaryColor || '#1e3a5f';
    const headerTitle = config.headerTitle || 'Chat con nosotros';
    const headerSubtitle = config.headerSubtitle || 'Chatea con nosotros, te atenderemos en pocos minutos';
    const welcomeMessage = config.welcomeMessage || '👋 ¡Hola! ¿En qué podemos ayudarte?';
    const inputPlaceholder = config.inputPlaceholder || 'Escribe un mensaje...';
    const position = config.position || 'right';
    const avatarUrl = config.avatarUrl || '';

    return `(function(){
  if(window.__viltrChatWidget) return;
  window.__viltrChatWidget = true;

  var CONFIG = {
    inboxId: "${inboxId}",
    wsUrl: "${wsUrl}",
    primaryColor: "${primaryColor}",
    headerTitle: ${JSON.stringify(headerTitle)},
    headerSubtitle: ${JSON.stringify(headerSubtitle)},
    welcomeMessage: ${JSON.stringify(welcomeMessage)},
    inputPlaceholder: ${JSON.stringify(inputPlaceholder)},
    position: "${position}",
    avatarUrl: ${JSON.stringify(avatarUrl)}
  };

  var VISITOR_KEY = "viltr_chat_visitor_" + CONFIG.inboxId;
  var SESSION_KEY = "viltr_chat_session_" + CONFIG.inboxId;

  function getVisitorId() {
    var id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = "v_" + Math.random().toString(36).substr(2, 12) + Date.now().toString(36);
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  }

  function createStyles() {
    var style = document.createElement("style");
    style.textContent = \`
      #viltr-chat-widget * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      #viltr-chat-bubble {
        position: fixed; bottom: 24px; \${CONFIG.position}: 24px;
        width: 56px; height: 56px; border-radius: 50%;
        background: \${CONFIG.primaryColor}; color: white;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,0.2);
        z-index: 99999; transition: transform 0.2s, box-shadow 0.2s;
        border: none; outline: none;
      }
      #viltr-chat-bubble:hover { transform: scale(1.08); box-shadow: 0 6px 20px rgba(0,0,0,0.25); }
      #viltr-chat-bubble svg { width: 24px; height: 24px; transition: transform 0.2s; }
      #viltr-chat-bubble.active svg.icon-chat { display: none; }
      #viltr-chat-bubble.active svg.icon-close { display: block; }
      #viltr-chat-bubble svg.icon-close { display: none; }

      #viltr-chat-window {
        position: fixed; bottom: 92px; \${CONFIG.position}: 24px;
        width: 370px; max-height: calc(100vh - 130px);
        border-radius: 16px; overflow: hidden;
        box-shadow: 0 12px 40px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.04);
        display: none; flex-direction: column; z-index: 99999;
        background: #fff;
        transform: translateY(8px); opacity: 0;
        transition: transform 0.25s ease, opacity 0.25s ease;
      }
      #viltr-chat-window.open {
        display: flex; transform: translateY(0); opacity: 1;
      }

      .viltr-chat-header {
        padding: 18px 20px; background: \${CONFIG.primaryColor}; color: white;
        display: flex; align-items: center; gap: 12px; position: relative;
      }
      .viltr-chat-header-avatar {
        width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.15);
        display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        overflow: hidden;
      }
      .viltr-chat-header-avatar img { width: 100%; height: 100%; object-fit: cover; }
      .viltr-chat-header-avatar svg { width: 22px; height: 22px; opacity: 0.9; }
      .viltr-chat-header-text { flex: 1; min-width: 0; }
      .viltr-chat-header-text h3 { font-size: 15px; font-weight: 700; color: white; line-height: 1.3; }
      .viltr-chat-header-text p { font-size: 12px; color: rgba(255,255,255,0.75); line-height: 1.4; margin-top: 2px; }
      .viltr-chat-header-close {
        position: absolute; top: 14px; right: 14px;
        width: 28px; height: 28px; border-radius: 50%; border: none;
        background: rgba(255,255,255,0.15); color: white;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; transition: background 0.2s;
      }
      .viltr-chat-header-close:hover { background: rgba(255,255,255,0.25); }
      .viltr-chat-header-close svg { width: 14px; height: 14px; }

      .viltr-chat-messages {
        flex: 1; overflow-y: auto; padding: 20px 16px;
        display: flex; flex-direction: column; gap: 10px;
        min-height: 300px; background: #f9fafb;
      }
      .viltr-msg {
        max-width: 82%; padding: 12px 16px; border-radius: 16px;
        font-size: 14px; line-height: 1.5; word-wrap: break-word;
        animation: viltr-fade-in 0.2s ease;
      }
      @keyframes viltr-fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      .viltr-msg.visitor {
        align-self: flex-end; background: \${CONFIG.primaryColor}; color: white;
        border-bottom-right-radius: 4px;
      }
      .viltr-msg.agent {
        align-self: flex-start; background: #ffffff; color: #1f2937;
        border: 1px solid #e5e7eb; border-bottom-left-radius: 4px;
      }

      .viltr-chat-input {
        display: flex; align-items: center; padding: 14px 16px;
        border-top: 1px solid #f0f0f0; gap: 10px; background: #fff;
      }
      .viltr-chat-input input {
        flex: 1; border: 1.5px solid #d1d5db; border-radius: 24px;
        padding: 12px 18px; font-size: 14px; outline: none;
        transition: border-color 0.2s, box-shadow 0.2s;
        background: #fff; color: #1f2937;
      }
      .viltr-chat-input input::placeholder { color: #9ca3af; }
      .viltr-chat-input input:focus {
        border-color: \${CONFIG.primaryColor};
        box-shadow: 0 0 0 3px \${CONFIG.primaryColor}22;
      }
      .viltr-chat-input button {
        width: 40px; height: 40px; border-radius: 50%;
        background: \${CONFIG.primaryColor}; color: white; border: none;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        transition: transform 0.15s, opacity 0.15s; flex-shrink: 0;
      }
      .viltr-chat-input button:hover { transform: scale(1.05); }
      .viltr-chat-input button:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
      .viltr-chat-input button svg { width: 18px; height: 18px; }

      @media(max-width: 480px) {
        #viltr-chat-window {
          width: calc(100vw - 16px); \${CONFIG.position}: 8px;
          bottom: 88px; max-height: calc(100vh - 110px);
          border-radius: 12px;
        }
      }
    \`;
    document.head.appendChild(style);
  }

  function createWidget() {
    var container = document.createElement("div");
    container.id = "viltr-chat-widget";

    var avatarHtml = CONFIG.avatarUrl
      ? '<img src="' + CONFIG.avatarUrl + '" alt="" />'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

    container.innerHTML = \`
      <button id="viltr-chat-bubble" aria-label="Abrir chat">
        <svg class="icon-chat" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <svg class="icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
      <div id="viltr-chat-window">
        <div class="viltr-chat-header">
          <div class="viltr-chat-header-avatar">\${avatarHtml}</div>
          <div class="viltr-chat-header-text">
            <h3>\${CONFIG.headerTitle}</h3>
            <p>\${CONFIG.headerSubtitle}</p>
          </div>
          <button class="viltr-chat-header-close" id="viltr-close" aria-label="Cerrar chat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="viltr-chat-messages" id="viltr-messages"></div>
        <div class="viltr-chat-input">
          <input type="text" id="viltr-input" placeholder="\${CONFIG.inputPlaceholder}" autocomplete="off" />
          <button id="viltr-send" type="button" aria-label="Enviar mensaje">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      </div>
    \`;
    document.body.appendChild(container);
  }

  function init() {
    createStyles();
    createWidget();

    var bubble = document.getElementById("viltr-chat-bubble");
    var chatWindow = document.getElementById("viltr-chat-window");
    var closeBtn = document.getElementById("viltr-close");
    var messagesEl = document.getElementById("viltr-messages");
    var input = document.getElementById("viltr-input");
    var sendBtn = document.getElementById("viltr-send");
    var visitorId = getVisitorId();
    var conversationId = null;
    var ws = null;
    var isOpen = false;
    var sessionReady = false;

    // Capture URL attribution params eagerly (URL may change if user navigates)
    var attribution = {};
    try {
      var urlParams = {};
      window.location.search.substring(1).split("&").forEach(function(p) {
        var kv = p.split("=");
        if (kv[0]) urlParams[kv[0]] = decodeURIComponent(kv[1] || "");
      });
      var attrKeys = ["fbclid", "gclid", "ttclid", "li_fat_id", "twclid", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
      attrKeys.forEach(function(k) { if (urlParams[k]) attribution[k] = urlParams[k]; });
      attribution.referrer = document.referrer || "";
      attribution.landingPage = window.location.href;
    } catch(e) {}

    function toggleChat() {
      isOpen = !isOpen;
      if (isOpen) {
        chatWindow.classList.add("open");
        bubble.classList.add("active");
        // Show welcome message locally without backend call
        if (!sessionReady && messagesEl.children.length === 0) {
          appendMessage(CONFIG.welcomeMessage, "agent");
        }
        setTimeout(function() { input.focus(); }, 300);
      } else {
        chatWindow.classList.remove("open");
        bubble.classList.remove("active");
      }
    }

    bubble.addEventListener("click", toggleChat);
    closeBtn.addEventListener("click", toggleChat);

    function createSession(firstMessage) {
      fetch(CONFIG.wsUrl + "/api/chat-widget/session/" + CONFIG.inboxId, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId: visitorId, attribution: attribution })
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.conversationId) {
          conversationId = data.conversationId;
          sessionReady = true;
          localStorage.setItem(SESSION_KEY, conversationId);
          connectWs();
          // Send the first message that triggered session creation
          if (firstMessage) {
            doSendMessage(firstMessage);
          }
        }
      })
      .catch(function(e) { console.error("[ViltrChat]", e); });
    }

    function resumeSession() {
      fetch(CONFIG.wsUrl + "/api/chat-widget/session/" + CONFIG.inboxId, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId: visitorId })
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.conversationId) {
          conversationId = data.conversationId;
          sessionReady = true;
          localStorage.setItem(SESSION_KEY, conversationId);
          if (data.messages && data.messages.length) {
            messagesEl.innerHTML = "";
            data.messages.forEach(function(m) { appendMessage(m.content, m.direction === "out" ? "agent" : "visitor"); });
          }
          connectWs();
        }
      })
      .catch(function(e) { console.error("[ViltrChat]", e); });
    }

    function connectWs() {
      if (ws) return;
      var wsProtocol = CONFIG.wsUrl.startsWith("https") ? "wss" : "ws";
      var wsHost = CONFIG.wsUrl.replace(/^https?:\\/\\//, "");
      ws = new WebSocket(wsProtocol + "://" + wsHost + "/ws/chat-widget?inboxId=" + CONFIG.inboxId + "&visitorId=" + visitorId + "&conversationId=" + conversationId);

      ws.onmessage = function(event) {
        try {
          var data = JSON.parse(event.data);
          if (data.type === "message" && data.direction === "out") {
            appendMessage(data.content, "agent");
          }
        } catch(e) {}
      };

      ws.onclose = function() {
        ws = null;
        setTimeout(function() { if (conversationId) connectWs(); }, 3000);
      };
    }

    function sendMessage() {
      var text = input.value.trim();
      if (!text) return;
      input.value = "";
      appendMessage(text, "visitor");

      if (!sessionReady) {
        // First message — create session, then send
        createSession(text);
      } else {
        doSendMessage(text);
      }
    }

    function doSendMessage(text) {
      fetch(CONFIG.wsUrl + "/api/chat-widget/message/" + CONFIG.inboxId, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversationId, visitorId: visitorId, content: text })
      }).catch(function(e) { console.error("[ViltrChat]", e); });
    }

    function appendMessage(text, type) {
      var div = document.createElement("div");
      div.className = "viltr-msg " + type;
      div.textContent = text;
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    sendBtn.addEventListener("click", sendMessage);
    input.addEventListener("keydown", function(e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    // Resume existing session (visitor already chatted before)
    var savedSession = localStorage.getItem(SESSION_KEY);
    if (savedSession) {
      conversationId = savedSession;
      sessionReady = true;
      resumeSession();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();`;
  }
}
