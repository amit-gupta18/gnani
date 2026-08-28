FROM node:20-bookworm

RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
COPY packages/queue/package.json ./packages/queue/

RUN npm install --workspace=@gnani/worker --include-workspace-root

COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/db ./packages/db
COPY packages/queue ./packages/queue
COPY apps/worker ./apps/worker

RUN npm run build -w @gnani/shared && \
    npm run build -w @gnani/db && \
    npm run build -w @gnani/queue && \
    npm run build -w @gnani/worker

CMD ["node", "apps/worker/dist/index.js"]
