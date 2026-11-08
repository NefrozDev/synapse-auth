# Build context: the repository root (the Caddyfile lives in deploy/).
FROM node:24-alpine AS build
ENV NG_CLI_ANALYTICS=false
WORKDIR /app/Frontend
COPY Frontend/package.json Frontend/package-lock.json ./
# No dependency install scripts: every package used here ships prebuilt binaries.
RUN npm ci --ignore-scripts
COPY Frontend ./
RUN npm run build

# Caddy serves the static app and proxies /api and /oidc to the API container.
FROM caddy:2.10-alpine
# Run unprivileged: Caddy only writes its state under /config and /data, and
# Docker lets any user bind port 80 inside the container.
RUN addgroup -S caddy && adduser -S -G caddy caddy && chown -R caddy:caddy /config /data
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/Frontend/dist/synapse-auth/browser /srv
USER caddy
