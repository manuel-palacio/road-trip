FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Gate the image on the test suite — if vitest fails, docker build fails,
# Cloud Run never gets the new image. Matches the CI requirement from #56.
RUN npm test

RUN npm run build

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
