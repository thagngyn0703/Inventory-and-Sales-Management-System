FROM node:20-alpine

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .

ENV NODE_ENV=production
EXPOSE 8000

CMD ["node", "server.js"]
