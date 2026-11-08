# Build context: the repository root.
FROM node:24-alpine AS build
WORKDIR /app/Backend
COPY Backend/package.json Backend/package-lock.json ./
# No dependency install scripts: every package used here ships prebuilt binaries.
RUN npm ci --ignore-scripts
COPY Backend ./
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app/Backend
COPY --from=build /app/Backend/package.json ./
COPY --from=build /app/Backend/node_modules node_modules
COPY --from=build /app/Backend/dist dist
# The registered apps (clients.production.json): addresses only, secrets come from the environment.
COPY --from=build /app/Backend/config config
USER node
EXPOSE 3300
CMD ["node", "dist/main.js"]
