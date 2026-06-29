# Stage 1: Build Go backend
FROM golang:1.22-alpine AS go-builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/server ./cmd/server

# Stage 2: Build React frontend
FROM node:20-alpine AS web-builder
WORKDIR /app
COPY web/package.json web/ ./
RUN npm install
COPY web/ ./
RUN npm run build

# Stage 3: Runtime
FROM alpine:3.19
RUN apk --no-cache add ca-certificates
WORKDIR /app
COPY --from=go-builder /app/server .
COPY --from=web-builder /app/dist ./web/dist
EXPOSE 8080
CMD ["./server"]
