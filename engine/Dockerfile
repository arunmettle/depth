FROM golang:1.26-alpine AS build

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o /out/sentinel-flow-engine ./cmd/server

FROM alpine:3.22

RUN adduser -D -u 10001 appuser

WORKDIR /app

COPY --from=build /out/sentinel-flow-engine /app/sentinel-flow-engine

USER appuser

EXPOSE 8080

CMD ["/app/sentinel-flow-engine"]
