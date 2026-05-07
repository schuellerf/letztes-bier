# syntax=docker/dockerfile:1

FROM node:22-alpine AS web
WORKDIR /src
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM alpine:3.20
RUN apk add --no-cache ca-certificates curl unzip \
	&& PB_VER=0.37.5 \
	&& curl -fsSL "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VER}/pocketbase_${PB_VER}_linux_amd64.zip" -o /tmp/pb.zip \
	&& unzip /tmp/pb.zip -d /pb \
	&& rm /tmp/pb.zip \
	&& chmod +x /pb/pocketbase

WORKDIR /pb
COPY --from=web /src/build ./pb_public
COPY pb_migrations ./pb_migrations
COPY pb_hooks ./pb_hooks

ENV PB_DATA_DIR=/pb/pb_data
VOLUME ["/pb/pb_data"]
EXPOSE 8090

ENTRYPOINT ["/pb/pocketbase"]
CMD ["serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", "--publicDir=/pb/pb_public", "--migrationsDir=/pb/pb_migrations", "--hooksDir=/pb/pb_hooks"]
