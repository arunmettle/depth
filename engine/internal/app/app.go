package app

import (
	"log/slog"
	"net/http"

	"sentinelflow/engine/internal/bybit"
	"sentinelflow/engine/internal/config"
)

type App struct {
	config      config.Config
	logger      *slog.Logger
	tradeStream *bybit.PublicTradeStream
}

func New(cfg config.Config, logger *slog.Logger, tradeStream *bybit.PublicTradeStream) *App {
	return &App{
		config:      cfg,
		logger:      logger,
		tradeStream: tradeStream,
	}
}

func (a *App) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/", a.handleRoot)
	mux.HandleFunc("/healthz", a.handleHealth)
	mux.HandleFunc("/readyz", a.handleReady)
	mux.HandleFunc("/internal/validate/alert", a.handleValidationAlert)

	return mux
}
