FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 8080

# The production build is a Vercel bundle, so the container runs the dev server.
# Migrations apply only when DATABASE_URL is set.
CMD ["sh", "-c", "node scripts/migrate.mjs && npm run dev"]
