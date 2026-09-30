# ---- Stage 1: Build Frontend ----
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --legacy-peer-deps
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: Build Backend ----
FROM node:20-alpine AS backend-build
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --legacy-peer-deps
COPY backend/ ./
RUN npm run build

# ---- Stage 3: Production ----
FROM node:20-alpine AS production
WORKDIR /app

# ffmpeg: se usa para comprimir videos de header de plantilla que superan el
# límite de 16MB de WhatsApp antes de enviarlos en campañas.
RUN apk add --no-cache ffmpeg

# Copy backend build and production dependencies
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev --legacy-peer-deps

COPY --from=backend-build /app/backend/dist ./dist

# Copy frontend build to the location expected by main.ts (../frontend/dist relative to backend dist)
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Create uploads and etl-cache directories
RUN mkdir -p uploads etl-cache

EXPOSE 3000

CMD ["node", "dist/main"]
