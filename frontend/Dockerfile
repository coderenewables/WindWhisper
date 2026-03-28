# ---------- Stage 1: Build ----------
FROM node:20-alpine AS builder

WORKDIR /build
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# ---------- Stage 2: Serve with nginx ----------
FROM nginx:1.25-alpine

LABEL maintainer="GoKaatru Contributors"

# Remove default nginx site
RUN rm /etc/nginx/conf.d/default.conf

COPY --from=builder /build/dist /usr/share/nginx/html
COPY nginx-frontend.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
