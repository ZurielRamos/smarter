# Smarter — Estructura del Home (Website Promocional)

> **Modelo de negocio:** No hay registro directo. El flujo es agendar una demostración → acompañamiento comercial → onboarding asistido. Smarter es un servicio de acompañamiento completo en ventas y marketing digital.

---

## Header (Navegación — Sticky)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  [Logo: smarter]                                                            │
│                                                                             │
│  Producto ▾   |   Soluciones ▾   |   Precios   |   Recursos ▾              │
│                                                                             │
│                                         [Iniciar sesión]   [Agendar demo →] │
└─────────────────────────────────────────────────────────────────────────────┘
```

| Item | Tipo | Contenido del dropdown |
|------|------|------------------------|
| **Producto** | Mega-menu con iconos | Bandeja Omnicanal · CRM de Contactos · Campañas Masivas · Bots con IA · Atribución & Conversiones · Formularios & Widgets |
| **Soluciones** | Dropdown 2 columnas | **Por industria:** E-commerce · Servicios financieros · Inmobiliarias · Salud · Educación — **Por equipo:** Ventas · Soporte · Marketing |
| **Precios** | Link directo | Scroll a sección de precios |
| **Recursos** | Dropdown | API Reference · Blog · Guías de inicio · Changelog |

**CTAs:**
- "Iniciar sesión" → link outline (clientes existentes, va al app)
- "Agendar demo →" → botón primary (abre formulario de contacto / calendly)

**Mobile:** Hamburger + sheet lateral con items colapsables.

---

## Sección 1 — Hero

**Layout:** Texto a la izquierda (60%), screenshot a la derecha (40%)

**Tag superior:** Plataforma de comunicación y ventas con IA

**Headline:**
> Convierte cada conversación en una oportunidad de negocio

**Subheadline:**
> WhatsApp, Messenger, Instagram, SMS, email y llamadas en una sola plataforma. Con bots inteligentes que venden 24/7 y un equipo que te acompaña en cada paso de tu operación.

**CTAs:**
- Primario: "Agendar demostración →"
- Secundario: "Ver cómo funciona" (scroll suave a sección "Cómo funciona")

**🖼️ Visual sugerido:**
> Screenshot real del **inbox de conversaciones** de Smarter: panel izquierdo con lista de conversaciones (nombres, último mensaje, badges de canal WhatsApp/Messenger), panel central con un chat abierto mostrando mensajes del bot respondiendo, panel derecho con la ficha del contacto (nombre, teléfono, tags, score).
>
> Opcional: aplicar un leve mockup de browser frame o floating UI para dar profundidad.

**Trust bar debajo del hero (iconos + texto):**
- ✓ WhatsApp Business API oficial
- ✓ +50 empresas operando
- ✓ 10M+ mensajes procesados/mes
- ✓ Acompañamiento dedicado

---

## Sección 2 — Logos de Clientes

**Layout:** Barra horizontal con logos en gris, hover revela color.

**Texto arriba:** "Empresas que escalan su operación con Smarter"

**Logos:** SuperGiros, Grupo Financiero del Valle, Redes & Servicios + 3-5 logos adicionales de clientes reales.

---

## Sección 3 — Propuesta de Valor (Problema → Solución)

**Layout:** 3 columnas con icono + título + descripción

**Headline:** Tu operación de ventas merece mejor tecnología

| # | Problema que resuelven | Con Smarter |
|---|------------------------|-------------|
| 1 | "Mi equipo usa WhatsApp Web, correo y 4 apps diferentes sin control" | **Una bandeja para todo.** Todos los canales unificados, con asignación a agentes y métricas. |
| 2 | "Perdemos leads porque nadie responde fuera de horario o fines de semana" | **Bots con IA que venden 24/7.** Responden, cualifican y capturan datos sin intervención humana. |
| 3 | "No sabemos qué campaña generó cada venta, gastamos sin medir" | **Atribución automática.** Conecta Meta, Google y TikTok Ads. Sabe exactamente qué funciona. |

**🖼️ Visual sugerido:**
> Cada columna puede tener un mini-screenshot o ilustración:
> - Col 1: Vista del inbox unificado con badges de canal (WA verde, Messenger azul, IG morado)
> - Col 2: Chat donde el bot está recopilando nombre y email del contacto
> - Col 3: Dashboard de conversiones con gráfico de atribución por plataforma

---

## Sección 4 — Features Principales (6 cards en grid)

**Layout:** Grid 3x2 en desktop, 2x3 en tablet, 1 columna en mobile

**Tag:** Funcionalidades
**Headline:** Todo lo que necesitas para escalar tu operación
**Subheadline:** Una plataforma completa con acompañamiento experto. Sin curvas de aprendizaje.

| # | Icono | Título | Descripción |
|---|-------|--------|-------------|
| 1 | 💬 | **Bandeja Omnicanal** | WhatsApp, Messenger, Instagram, email y SMS en un solo inbox. Asigna a agentes, etiqueta y responde en tiempo real con tu equipo. |
| 2 | 🤖 | **Bots con Inteligencia Artificial** | Asistentes que hablan como tu marca, recopilan datos, consultan tu inventario y escalan a humanos. GPT-4o, Claude o Gemini como motor. |
| 3 | 📢 | **Campañas Multi-Canal** | WhatsApp masivo con templates, SMS, email con builder visual y llamadas con texto a voz. Segmenta, programa y mide. |
| 4 | 👥 | **CRM de Contactos** | Pipeline visual, lead scoring, campos custom, importación masiva, timeline de actividad y segmentación avanzada con +40 campos. |
| 5 | 📊 | **Atribución de Conversiones** | Conecta Meta Ads, Google Ads y TikTok. Envía eventos CAPI automáticamente. Sabe qué ad generó cada lead. |
| 6 | 🔌 | **API & Integraciones** | REST API documentada, webhooks en tiempo real, WooCommerce, formularios públicos y chat widget embebible. |

**🖼️ Visual sugerido:**
> Al hacer hover o click en cada card, mostrar un screenshot contextual del módulo correspondiente en un panel lateral o como modal/tooltip expandido. Alternativa: las cards no tienen imagen, pero debajo del grid hay un screenshot grande rotativo (carousel) que muestra cada módulo.

---

## Sección 5 — Spotlight: Bots con IA

**Layout:** Split screen — texto a la izquierda, screenshot/video a la derecha

**Tag:** Inteligencia Artificial
**Headline:** Un agente virtual que vende mientras tu equipo descansa

**Texto:**
> Configura un bot en minutos que:
> - Responde preguntas frecuentes con tu base de conocimiento
> - Captura nombre, email, teléfono y cualquier dato custom
> - Consulta precios, stock o estado de pedidos en tu sistema
> - Cualifica leads con scoring automático
> - Transfiere a un vendedor humano en el momento exacto
> - Respeta horarios, límites y habla en el idioma del cliente
>
> Sin código. Sin flujos rígidos. Lenguaje natural.

**Dato destacado (badge/callout):**
> "Nuestros clientes resuelven +70% de conversaciones sin intervención humana"

**CTA:** "Conocer más sobre bots →" (va a página de producto de bots)

**🖼️ Visual sugerido:**
> Screenshot de la pantalla de **configuración del bot** mostrando:
> - Panel de personalidad (nombre del bot, tono, idioma)
> - O bien: el **chat de prueba** del bot dentro de Smarter, mostrando una conversación donde el bot recopila datos y ejecuta una herramienta
>
> Ideal si es un video corto (15s) o GIF animado mostrando el flujo: usuario pregunta → bot busca en knowledge base → responde con dato específico.

---

## Sección 6 — Spotlight: Campañas Multi-Canal

**Layout:** Split screen invertido — screenshot a la izquierda, texto a la derecha

**Tag:** Campañas Masivas
**Headline:** El mensaje correcto, a la persona correcta, en el canal correcto

**4 bullets con icono:**
- 📱 **WhatsApp Templates** — Plantillas aprobadas por Meta con variables dinámicas del CRM
- ✉️ **Email Builder** — Editor visual drag & drop, templates profesionales sin escribir HTML
- 📞 **Llamadas con IA** — Texto a voz con voces naturales en español, reintentos y buzón automático
- 🎯 **Segmentación inteligente** — Combina ciudad + score + canal + última actividad para audiencias precisas

**CTA:** "Ver todas las funcionalidades →"

**🖼️ Visual sugerido:**
> Screenshot de la **pantalla de creación de campaña** mostrando:
> - Selector de canal (WhatsApp/SMS/Email/Llamada)
> - Panel de segmentación con condiciones tipo "ciudad = Bogotá AND score > 50"
> - Preview del template de WhatsApp con variables mapeadas
>
> O un collage de 3 mini-screenshots: email builder + creador de campaña + reporte de envíos.

---

## Sección 7 — Cómo Funciona (Nuestro Modelo)

**Layout:** 3 pasos en timeline horizontal (desktop) / vertical (mobile)

**Tag:** Nuestro Proceso
**Headline:** Acompañamiento de principio a fin

**Subheadline:** No solo te damos la herramienta. Diseñamos, implementamos y optimizamos tu operación de comunicación y ventas.

| Paso | Título | Descripción |
|------|--------|-------------|
| 1 | **Diagnóstico y demo** | Analizamos tu operación actual. Te mostramos en vivo cómo Smarter resuelve tus puntos de dolor específicos. |
| 2 | **Implementación asistida** | Conectamos tus canales, importamos tu base de datos, configuramos bots y campañas. Tú no tocas nada técnico. |
| 3 | **Operación y optimización** | Tu equipo opera con acompañamiento permanente. Ajustamos campañas, entrenamos bots y escalamos lo que funciona. |

**CTA:** "Agendar mi demostración →"

**🖼️ Visual sugerido:**
> Línea de tiempo visual con iconos por cada paso:
> - Paso 1: Icono de videollamada / calendario
> - Paso 2: Screenshot del **panel de canales conectados** (3 inboxes: WhatsApp ✓ connected, Messenger ✓ connected, Instagram ✓ connected)
> - Paso 3: Screenshot del **dashboard** con métricas (gráficos de mensajes enviados, tasa de respuesta, leads generados)

---

## Sección 8 — Casos de Uso / Industrias

**Layout:** Tabs horizontales (una por industria) con contenido dinámico debajo

**Tag:** Soluciones por industria
**Headline:** Construido para empresas que necesitan resultados

| Tab/Industria | Caso principal | Features clave | Visual sugerido |
|---------------|---------------|----------------|-----------------|
| **E-commerce** | Recupera carritos abandonados por WhatsApp. Notifica despachos. Atribución de Meta/Google Ads. | Campañas + WooCommerce + Conversiones | 🖼️ Screenshot del módulo de WooCommerce hooks + campaign con template "Tu pedido fue despachado" |
| **Servicios financieros** | Recordatorios de pago automatizados. Cobranza por WhatsApp. Bot de consulta de saldo. | Campañas + Bots + CRM | 🖼️ Screenshot de campaña recurrente de recordatorio con segmento "mora > 30 días" |
| **Inmobiliarias** | Cualifica leads 24/7 con bot. Captura presupuesto y tipo de inmueble. Seguimiento multi-canal. | Bots + CRM + Formularios | 🖼️ Screenshot del bot en el chat recopilando "presupuesto", "zona preferida", "tipo de inmueble" |
| **Salud** | Confirmación y recordatorio de citas por WhatsApp. Atención por bot fuera de horario. | Campañas + Bots | 🖼️ Screenshot de template WhatsApp "Recordatorio: tu cita es mañana a las 3pm. Confirma con SÍ" |
| **Educación** | Campañas de inscripción segmentadas. Bot responde dudas de programa académico. Tracking de interesados. | Campañas + Bots + Conversiones | 🖼️ Screenshot del CRM con pipeline: Lead → Interesado → Inscrito |

---

## Sección 9 — Testimonios

**Layout:** Carousel de 3 tarjetas o grid estático

**Headline:** Empresas que confían en Smarter

| Cliente | Quote | Cargo |
|---------|-------|-------|
| SuperGiros | "Smarter nos permitió centralizar toda la comunicación con nuestros clientes. La eficiencia de nuestro equipo aumentó un 40% en el primer trimestre." | Carlos Mendoza — Director de Operaciones |
| Grupo Financiero del Valle | "La API es robusta y bien documentada. Integramos Smarter con nuestro ERP en menos de una semana." | Andrea López — CTO |
| Redes & Servicios | "El soporte es excepcional. Siempre tienen respuestas rápidas y soluciones a medida para nuestras necesidades." | Roberto Sánchez — Gerente de Tecnología |

**🖼️ Visual sugerido:**
> Tarjetas con: avatar o foto del cliente, nombre, cargo, logo de la empresa, 5 estrellas, quote.
> Fondo: background sutil con gradiente o pattern dots para dar profundidad.

---

## Sección 10 — Precios

**Layout:** 3 columnas (igual que actual)

**Tag:** Precios
**Headline:** Inversión con retorno medible
**Subheadline:** Cada plan incluye acompañamiento. No estás solo.

| Plan | Precio | Ideal para | Incluye |
|------|--------|-----------|---------|
| **Starter** | $99 USD/mes | Equipos de 1-3 personas comenzando con comunicación digital | 5,000 contactos · 1 canal WhatsApp · 3 usuarios · Campañas básicas · Bot con 1,000 créditos IA · Acompañamiento por email |
| **Business** | $299 USD/mes | Empresas con operación activa de ventas y soporte | 50,000 contactos · 3 canales · 10 usuarios · Campañas avanzadas · Bot ilimitado · Conversiones · API · Acompañamiento prioritario |
| **Enterprise** | Personalizado | Grandes operaciones con necesidades específicas | Contactos ilimitados · Canales ilimitados · Usuarios ilimitados · SLA dedicado · Account Manager · Onboarding personalizado · Integraciones custom |

**Nota inferior:** "Todos los planes incluyen: SSL, backups diarios, soporte en español, implementación asistida, y acceso completo a la plataforma."

**CTA en cada tarjeta:** "Agendar demo" (no "Comenzar" ni "Registrarse")

---

## Sección 11 — Integraciones

**Layout:** Grid de logos/iconos con nombre debajo

**Headline:** Se conecta con tu ecosistema
**Subheadline:** Integraciones nativas y API abierta para conectar cualquier sistema.

**Logos:**
- WhatsApp Business API
- Facebook Messenger
- Instagram DM
- Meta Ads (CAPI)
- Google Ads
- TikTok Ads
- WooCommerce
- REST API
- Webhooks
- Zapier (próximamente)

**🖼️ Visual sugerido:**
> Grid de logos en estilo monocromático con hover que revela color. Debajo, un mini-screenshot del panel de **Integraciones** de Smarter mostrando las plataformas conectadas con status "✓ Conectado".

---

## Sección 12 — Diferenciador: Acompañamiento

**Layout:** Full-width con fondo de color (brand-800) y texto blanco

**Headline:** No solo software. Acompañamiento real.

**Texto:**
> A diferencia de otras plataformas donde estás solo con tutoriales y tickets de soporte, con Smarter tienes un equipo dedicado que:
>
> - Diseña tu estrategia de comunicación y ventas
> - Configura e implementa toda la plataforma por ti
> - Entrena y optimiza los bots con datos reales
> - Lanza y ajusta campañas basándose en resultados
> - Te acompaña semana a semana con revisiones y mejoras

**CTA:** "Agenda tu diagnóstico gratuito →" (botón blanco sobre fondo oscuro)

**🖼️ Visual sugerido:**
> No screenshot aquí. Usar una ilustración abstracta de "equipo de personas + dashboard" o un icono grande de handshake/partnership. Alternativa: foto real del equipo de Strategee si existe.

---

## Sección 13 — CTA Final

**Layout:** Centrado, fondo limpio

**Headline:** ¿Listo para escalar tu operación de ventas?
**Subheadline:** Agenda una demostración de 15 minutos. Te mostramos cómo Smarter se adapta a tu negocio.

**CTAs:**
- Primario: "Agendar demostración →" (botón grande)
- Secundario: "Hablar por WhatsApp" (link con icono WA, abre wa.me/...)

**🖼️ Visual sugerido:**
> Mockup flotante del dashboard de Smarter en perspectiva isométrica (3D leve), mostrando gráficas positivas y notificaciones de nuevos leads. Genera sensación de resultado.

---

## Sección 14 — Footer

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [Logo smarter]                                                          │
│  Plataforma de comunicación y ventas con IA                              │
│  Acompañamiento completo para tu operación digital.                      │
│                                                                          │
│  Producto          Soluciones         Recursos         Legal             │
│  ─────────         ──────────         ────────         ─────             │
│  Bandeja           E-commerce         API Docs         Privacidad        │
│  CRM               Financiero         Blog             Términos          │
│  Campañas          Inmobiliarias      Guías            Eliminación       │
│  Bots IA           Salud              Changelog        de datos          │
│  Conversiones      Educación                                             │
│  Formularios                                                             │
│                                                                          │
│  ─────────────────────────────────────────────────────────────────────── │
│  © 2026 Smarter by Strategee · soporte@strategee.us                      │
│  [LinkedIn] [Instagram] [WhatsApp]                                       │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Resumen de Screenshots/Visuals Necesarios

| # | Sección | Screenshot/Visual a producir |
|---|---------|------------------------------|
| 1 | Hero | Inbox de conversaciones completo (lista + chat + ficha contacto) |
| 2 | Problema→Solución | 3 mini-screenshots: inbox canales, bot recopilando datos, dashboard conversiones |
| 3 | Spotlight Bots | Pantalla de config del bot O chat de prueba con bot ejecutando herramientas |
| 4 | Spotlight Campañas | Creador de campaña con segmentación + preview de template |
| 5 | Cómo funciona | Panel de canales conectados + Dashboard con métricas |
| 6 | Industrias (tabs) | 1 screenshot por industria mostrando el uso específico (5 total) |
| 7 | Integraciones | Panel de integraciones con plataformas conectadas |
| 8 | CTA Final | Dashboard en perspectiva 3D/isométrica con gráficas positivas |

**Recomendación:** Producir los screenshots en resolución 2x (retina), con datos ficticios pero realistas. Limpiar cualquier dato sensible. Usar el mismo tenant de demo para mantener consistencia visual en toda la página.

---

## Tono General de Copywriting

- Directo, sin fluff. Hablar de resultados, no de tecnología.
- Orientado al decisor (gerente de operaciones, director comercial, CEO de pyme).
- Castellano latinoamericano neutro (no "vosotros", no regionalismos extremos).
- Los CTAs siempre llevan a agendar contacto, nunca a un registro self-service.
- El diferenciador siempre presente: "no estás solo, te acompañamos".
