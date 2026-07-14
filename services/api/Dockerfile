FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json tsconfig.json tsconfig.build.json ./
RUN npm ci

COPY services ./services
COPY dashboard ./dashboard

RUN npm run build

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "dist/services/api/src/main.js"]
