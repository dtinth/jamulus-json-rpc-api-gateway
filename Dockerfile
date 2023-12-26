FROM node:20.10.0-alpine
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml package.json ./
RUN pnpm install
COPY ./src/ ./src/
CMD node src/server.mjs