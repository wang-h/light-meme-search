FROM oven/bun:1 AS base
WORKDIR /app

COPY package.json bun.lock* ./
# 若无 bun.lock，去掉 --frozen-lockfile
RUN bun install

COPY prisma ./prisma
RUN bunx prisma generate

COPY tsconfig.json ./
COPY src/ ./src/
COPY scripts ./scripts
COPY client/ ./client/
COPY public/ ./public/
RUN bun run build:client

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
