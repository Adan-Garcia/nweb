# syntax=docker/dockerfile:1

# The backend, and the built app beside it (served when STATIC_DIR is set, which it is here).
# One container, one port, one origin: what a tunnel needs to expose. docs/deploy.md.

FROM node:22-slim AS build
WORKDIR /app
# --ignore-scripts matches CI: nothing the build needs runs an install script.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
# "same-origin": the app finds its server wherever it is loaded from, so this one image works
# on whatever domain the tunnel gives it. Pass a URL instead to build for a separate server.
ARG VITE_API_URL=same-origin
ENV VITE_API_URL=$VITE_API_URL
# `vite build` rather than `npm run build`: the type-check runs in CI, and needs e2e/ and
# test files this image has no use for.
RUN npx vite build && npm run build:server

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
# The bundle keeps its dependencies external (server/vite.config.ts), so they are installed
# here. package.json declares one dependency list for the app and the server, so the
# frontend packages come along; the bundle simply never imports them.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/dist ./web
ENV STATIC_DIR=/app/web
USER node
EXPOSE 8787
CMD ["node", "dist-server/main.js"]
