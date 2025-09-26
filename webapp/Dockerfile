# ===== build stage =====
FROM node:18-alpine AS build

WORKDIR /app

# نصب dependency ها (با cache بهتر)
COPY package*.json ./
RUN npm install

# کپی کل سورس
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build پروژه
RUN npm run build


# ===== runtime stage =====
FROM node:18-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

# نیازهای سیستمی برای Prisma + Node
RUN apk add --no-cache openssl bash

# فقط سورس نهایی + node_modules production
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

# حذف devDependencies
RUN npm prune --production

EXPOSE 8000
CMD ["node", "dist/index.js"]
