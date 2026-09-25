FROM node:22-slim

WORKDIR /srv/app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY index.html styles.css app.js server.js state_to_state_migration_normalized.csv ./
COPY vendor/ ./vendor/

ENV PORT=8901
EXPOSE 8901

CMD ["node", "server.js"]
