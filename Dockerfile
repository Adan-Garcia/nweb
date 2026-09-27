# syntax=docker/dockerfile:1

# The backend only (`server/`). The browser app is not served from here.

FROM node:22-slim AS build
WORKDIR /app
# --ignore-scripts matches CI: nothing the server needs runs an install script.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
# The server imports nothing from `src/`, only `shared/`.
COPY shared ./shared
COPY server ./server
RUN npm run build:server

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
# The bundle keeps its dependencies external (server/vite.config.ts), so they are installed
# here. package.json declares one dependency list for the app and the server, so the
# frontend packages come along; the bundle simply never imports them.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/dist-server ./dist-server
USER node
EXPOSE 8787
CMD ["node", "dist-server/main.js"]
