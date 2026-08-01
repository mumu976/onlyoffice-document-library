FROM node:25-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY public ./public
COPY docs ./docs
COPY templates ./templates

RUN mkdir -p /app/storage && chown node:node /app/storage

USER node

EXPOSE 3000

CMD ["node", "src/server.js"]
