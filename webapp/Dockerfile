# ---------- Build stage ----------
FROM node:20-alpine AS build

WORKDIR /app

# فقط package*.json کپی کن برای cache درست
COPY package*.json ./

# نصب تمیز
RUN npm ci

# سورس رو کپی کن
COPY . .

# بیلد Next.js
RUN npm run build

# ---------- Run stage ----------
FROM node:20-alpine AS run

WORKDIR /app
ENV NODE_ENV=production

# فایل‌های لازم برای runtime
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]
