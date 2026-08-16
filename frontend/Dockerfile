# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# BuildKit-кеш npm — повторные сборки переиспользуют скачанные пакеты.
# npm install вместо npm ci: кросс-платформенный lockfile (Windows-host)
# не резолвит Linux-optional deps (@emnapi/core и др.), npm ci падает.
RUN --mount=type=cache,target=/root/.npm \
    npm install --prefer-offline --no-audit --no-fund

# ── Dev stage: Vite HMR (используется compose.dev.yml) ───────────────────────
FROM deps AS dev
COPY . .
EXPOSE 80
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "80"]

# ── Production build ──────────────────────────────────────────────────────────
FROM deps AS build
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
