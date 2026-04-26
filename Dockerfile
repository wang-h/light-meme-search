FROM oven/bun:1 AS base
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY prisma ./prisma
RUN bunx prisma generate

COPY tsconfig.json ./
COPY src/ ./src/
COPY public/ ./public/

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
