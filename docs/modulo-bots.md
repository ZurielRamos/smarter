# Módulo de Bots Conversacionales

## Resumen Ejecutivo

El módulo de Bots permite a cualquier empresa crear asistentes virtuales inteligentes que responden automáticamente en sus canales de comunicación (WhatsApp, Messenger, Instagram). Los bots recopilan datos de los clientes, ejecutan acciones en sistemas externos, y escalan a agentes humanos cuando es necesario — todo sin intervención manual.

**Problema que resuelve:** Las empresas pierden clientes por tiempos de respuesta lentos, respuestas inconsistentes, y la incapacidad de atender fuera de horario. El equipo de soporte se satura con preguntas repetitivas mientras los leads se enfrían.

**Solución:** Un bot configurado en minutos que responde 24/7 con la personalidad de la marca, recopila información del cliente, consulta bases de datos externas, y sabe cuándo transferir a un humano.

---

## Para Stakeholders No Técnicos

### ¿Qué puede hacer un bot?

| Capacidad | Ejemplo |
|-----------|---------|
| Responder preguntas | "¿Cuál es el horario de atención?" → responde automáticamente |
| Recopilar datos | Obtiene nombre, email, teléfono del cliente durante la conversación |
| Consultar sistemas externos | Busca precios, disponibilidad, estado de pedidos en tu API |
| Calificar leads | Detecta interés y cambia el estado del contacto en el CRM |
| Transferir a humano | Cuando el cliente lo pide o el bot no puede resolver |
| Respetar horarios | Solo responde en horario de atención, fuera de horario envía mensaje automático |

### ¿Cómo se configura?

La configuración está dividida en pestañas simples:

1. **Personalidad** — Quién es el bot: nombre, rol, cómo habla, en qué idiomas
2. **Conocimiento** — Qué sabe: catálogos, FAQs, políticas, documentos
3. **Datos** — Qué información recopila del cliente
4. **Herramientas** — Qué acciones puede ejecutar (consultar APIs, buscar productos)
5. **Comportamiento** — Horarios, límites, cuándo transferir a humano
6. **Avanzado** — Ajustes técnicos de velocidad y creatividad

### ¿Cuánto cuesta?

El costo se mide en créditos por mensaje, basado en el consumo real de IA:
- Mensajes simples ("Hola") → costo mínimo
- Mensajes complejos (búsqueda de productos, múltiples herramientas) → costo proporcional
- El bot NO responde si no hay créditos disponibles

### Métricas disponibles

- Total de conversaciones atendidas
- Tasa de resolución (% resuelto sin humano)
- Mensajes por día/semana
- Créditos consumidos por bot
- Logs de ejecución de herramientas

---

## Documentación Técnica

### Arquitectura

```
┌─────────────────────────────────────────────────────┐
│                   Frontend (React)                    │
│  BotConfig (tabs) │ BotDetail │ BotChatModal (test) │
└─────────────────────┬───────────────────────────────┘
                      │ REST API
┌─────────────────────▼───────────────────────────────┐
│                 Backend (NestJS)                      │
│  BotsController → BotsService → OpenRouter API      │
│                                                      │
│  Entities:                                           │
│    Bot, BotTool, BotToolLog, BotKnowledge           │
│                                                      │
│  Integrations:                                       │
│    ChatsService (WhatsApp/Messenger/Instagram)      │
│    BillingService (créditos)                         │
│    Activity (timeline del contacto)                  │
└─────────────────────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│              OpenRouter API (LLM)                     │
│  Function Calling + Tool Execution Loop              │
│  Modelos: GPT-4o, Claude, Gemini, Llama, etc.      │
└─────────────────────────────────────────────────────┘
```

### Entidades de Base de Datos

#### `bots`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID | Identificador único |
| tenantId | UUID | Cuenta propietaria |
| name | VARCHAR | Nombre del bot |
| status | VARCHAR | draft / active / inactive |
| persona | VARCHAR | Nombre/persona del bot |
| role | VARCHAR | Rol (soporte, ventas, etc.) |
| objective | TEXT | Objetivo principal |
| tone | JSONB | Tonos de comunicación |
| language | VARCHAR | Idiomas separados por coma |
| rules | JSONB | Array de reglas/instrucciones |
| businessContext | TEXT | Contexto del negocio (legacy) |
| dataCollectionEnabled | BOOLEAN | Recopilación activa |
| dataCollectionMode | VARCHAR | Intensidad (1-5) |
| dataCollectionFields | JSONB | Campos a recopilar con prioridad e instrucciones |
| systemPrompt | TEXT | Override manual del prompt |
| model | VARCHAR | Variante de routing (nitro/exacto/floor) |
| temperature | DECIMAL | Creatividad (0-2) |
| maxTokens | INT | Largo máximo de respuesta |
| replyDelay | INT | Segundos de debounce |
| contextMessages | INT | Mensajes de historial |
| maxBotMessages | INT | Límite de mensajes por conversación |
| handoffKeywords | JSONB | Palabras clave de transferencia |
| handoffMessage | TEXT | Mensaje al transferir |
| onResolvedActions | JSONB | Acciones al cumplir objetivo |
| schedule | JSONB | Horarios por día |
| rateLimit | JSONB | Límite de mensajes por contacto |
| totalPromptTokens | INT | Tokens entrada acumulados |
| totalCompletionTokens | INT | Tokens salida acumulados |
| totalRequests | INT | Total de requests |

#### `bot_tools`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID | Identificador |
| botId | UUID | Bot propietario |
| name | VARCHAR | Nombre de la función |
| description | TEXT | Descripción para el modelo |
| parameters | JSONB | JSON Schema de parámetros |
| executionType | VARCHAR | webhook / static |
| webhookUrl | TEXT | URL del endpoint |
| webhookMethod | VARCHAR | GET/POST/PUT/PATCH/DELETE |
| webhookHeaders | JSONB | Headers key-value |
| webhookQueryParams | JSONB | Query params key-value |
| webhookBodyType | VARCHAR | json/form/raw |
| webhookBodyFields | JSONB | Body fields con source y transform |
| webhookRawBody | TEXT | Body raw para JSON anidado |
| webhookAuthType | VARCHAR | none/bearer/basic/api_key |
| webhookAuthValue | TEXT | Valor de autenticación |
| responseMapping | JSONB | Mapeo de campos de respuesta |
| staticResponse | TEXT | Respuesta estática |
| isEnabled | BOOLEAN | Activa/inactiva |

#### `bot_knowledge`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID | Identificador |
| botId | UUID | Bot propietario |
| title | VARCHAR | Título del documento |
| type | VARCHAR | text / file |
| content | TEXT | Contenido completo |
| chunks | JSONB | Contenido dividido en fragmentos |
| tokenCount | INT | Tokens estimados |
| isEnabled | BOOLEAN | Activo/inactivo |

#### `bot_tool_logs`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID | Identificador |
| botId | UUID | Bot |
| toolId | UUID | Herramienta ejecutada |
| toolName | VARCHAR | Nombre de la función |
| args | JSONB | Argumentos enviados |
| response | TEXT | Respuesta recibida |
| success | BOOLEAN | Éxito/error |
| durationMs | INT | Duración en ms |
| isTest | BOOLEAN | Si fue prueba manual |

### Flujo de Ejecución

```
1. Mensaje entrante (WhatsApp/Messenger/Instagram)
   │
2. scheduleBotReply() — debounce configurable
   │
3. Verificaciones previas:
   ├─ Bot activo?
   ├─ Conversación no transferida?
   ├─ Créditos disponibles?
   ├─ Dentro del horario?
   ├─ Rate limit no excedido?
   └─ No es keyword de handoff?
   │
4. Construir request:
   ├─ System prompt (compilado desde configuración)
   ├─ Historial de mensajes (últimos N)
   ├─ Tools disponibles (sistema + custom)
   └─ Parámetros (modelo, temperatura, max_tokens)
   │
5. Enviar a OpenRouter (Function Calling)
   │
6. Procesar respuesta:
   ├─ Si tool_calls → ejecutar tools → volver a paso 5 (máx 3 rondas)
   ├─ save_contact_data → actualizar CRM
   ├─ search_knowledge → buscar en KB
   ├─ handoff_to_human → transferir
   ├─ mark_resolved → acciones post-objetivo
   └─ custom tools → webhook/static
   │
7. Enviar respuesta al usuario
   │
8. Post-procesamiento:
   ├─ Guardar aiUsage + creditsCost en mensaje
   ├─ Debitar créditos
   ├─ Crear notas de sistema (tools, datos, handoff)
   └─ Actualizar timeline del contacto
```

### API Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | /bots?tenantId= | Listar bots |
| GET | /bots/:id | Obtener bot |
| POST | /bots | Crear bot |
| PUT | /bots/:id | Actualizar bot |
| DELETE | /bots/:id | Eliminar bot |
| POST | /bots/:id/chat | Chat de prueba |
| GET | /bots/:id/metrics | Métricas del bot |
| GET | /bots/:id/tools | Listar herramientas |
| POST | /bots/:id/tools | Crear herramienta |
| PUT | /bots/tools/:toolId | Actualizar herramienta |
| DELETE | /bots/tools/:toolId | Eliminar herramienta |
| POST | /bots/tools/:toolId/test | Probar herramienta |
| GET | /bots/:id/tool-logs | Logs de ejecución |
| GET | /bots/:id/knowledge | Listar conocimiento |
| POST | /bots/:id/knowledge | Agregar texto |
| POST | /bots/:id/knowledge/upload | Subir archivo |
| PUT | /bots/knowledge/:id | Actualizar |
| DELETE | /bots/knowledge/:id | Eliminar |
| GET | /bots/models/search?q= | Buscar modelos OpenRouter |

### Tools del Sistema (automáticas)

| Tool | Cuándo se activa | Qué hace |
|------|-----------------|----------|
| save_contact_data | Usuario menciona datos personales | Guarda en el CRM |
| search_knowledge | Bot necesita información específica | Busca en KB por keywords |
| handoff_to_human | Bot no puede resolver / usuario frustrado | Transfiere a agente |
| mark_resolved | Objetivo cumplido | Ejecuta acciones post-objetivo |

### RAG (Retrieval-Augmented Generation)

La base de conocimiento NO se inyecta en cada request. En su lugar:

1. Se registra como tool `search_knowledge` disponible
2. El modelo decide cuándo necesita consultar
3. Backend busca por keywords en los chunks almacenados
4. Solo los chunks relevantes (top 5) se pasan al modelo
5. Resultado: zero overhead en mensajes simples, costo solo cuando se necesita

**Algoritmo de búsqueda:**
- Normalización (lowercase, sin acentos)
- Tokenización (palabras ≥3 chars, sin stopwords)
- Scoring por frecuencia de keywords en cada chunk
- Top 5 por relevancia

### Billing

- Tokens de entrada: `ai_input_tokens` (créditos por millón)
- Tokens de salida: `ai_output_tokens` (créditos por millón)
- Se calcula post-respuesta basado en consumo real
- Se acumula across tool call rounds
- Campo `creditsCost` en cada mensaje para reportes
- Verificación pre-request: si créditos = 0, no responde

### Debounce

- Map en memoria: `conversationId → setTimeout`
- Cada mensaje cancela timer anterior y crea uno nuevo
- Cuando expira → bot responde con todo el contexto acumulado
- Default: 4 segundos (configurable 0-15)
- Resultado: un usuario que envía 5 mensajes rápidos recibe UNA respuesta coherente

### Integración con Canales

El bot se asigna a un inbox (canal) vía `inbox.botId`. Cuando llega un mensaje:
- `handleWhatsAppMessages()` → `scheduleBotReply()`
- `handleMessengerMessage()` → `scheduleBotReply()`
- `handleInstagramMessage()` → `scheduleBotReply()`

El bot se pausa automáticamente cuando un agente humano responde manualmente.

### Control de Conversación

| Campo en `conversations` | Valores | Significado |
|--------------------------|---------|-------------|
| botStatus | active | Bot responde normalmente |
| botStatus | paused | Bot pausado (límite, rate limit, créditos) |
| botStatus | handed_off | Humano tomó control |

**Reactivación:** `POST /chats/conversations/:id/bot-reactivate`

---

## Roadmap Post-Lanzamiento

1. Templates de bots predefinidos (un click para instalar)
2. Clonar bots
3. Dashboard visual con gráficas de métricas
4. Embeddings reales (pgvector) para KB grandes
5. A/B testing de configuraciones
6. Multi-canal simultáneo por bot
7. Webhooks de notificación (eventos del bot)
8. Flujos condicionales entre herramientas
