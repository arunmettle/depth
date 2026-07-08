package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"sentinelflow/engine/internal/alertstore"
	"sentinelflow/engine/internal/app"
	"sentinelflow/engine/internal/bybit"
	"sentinelflow/engine/internal/config"
	"sentinelflow/engine/internal/evaluator"
	"sentinelflow/engine/internal/klines"
	"sentinelflow/engine/internal/outcome"
	"sentinelflow/engine/internal/rulesource"
)

func main() {
	cfg := config.Load()

	logger := slog.New(
		slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
			Level: cfg.LogLevel,
		}),
	)

	rootCtx, cancel := context.WithCancel(context.Background())
	defer cancel()

	tradeStream := bybit.NewPublicTradeStream(cfg, logger)
	ruleSource := createRuleSource(cfg)
	go syncRules(rootCtx, logger, tradeStream, ruleSource, cfg.RuleSyncInterval)
	go tradeStream.Run(rootCtx)

	if cfg.HasSupabaseRuleSource() {
		outcomeStore := alertstore.NewSupabaseStore(cfg.SupabaseURL, cfg.SupabaseSecretKey)
		outcomeResolver := outcome.NewResolver(klines.NewClient(), outcomeStore, logger)
		go resolveOutcomes(rootCtx, logger, outcomeResolver, cfg.OutcomeResolveInterval)
	} else {
		logger.Info("skipping outcome resolution job: supabase is not configured")
	}

	application := app.New(cfg, logger, tradeStream)

	server := &http.Server{
		Addr:              cfg.BindAddress(),
		Handler:           application.Routes(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	logger.Info("starting sentinel flow engine",
		slog.String("addr", cfg.BindAddress()),
		slog.String("environment", cfg.Environment),
		slog.String("bybit_ws_url", cfg.BybitWebSocketURL),
		slog.String("rule_source", ruleSource.Name()),
	)

	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("engine server stopped unexpectedly", slog.Any("error", err))
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	logger.Info("shutting down sentinel flow engine")

	cancel()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("graceful shutdown failed", slog.Any("error", err))
		os.Exit(1)
	}

	logger.Info("engine shutdown complete")
}

func createRuleSource(cfg config.Config) rulesource.Source {
	if cfg.HasSupabaseRuleSource() {
		return rulesource.NewSupabaseSource(cfg.SupabaseURL, cfg.SupabaseSecretKey, cfg.BybitSymbols)
	}

	return rulesource.NewStaticSource(evaluator.LaunchRules(cfg.BybitSymbols))
}

func syncRules(
	ctx context.Context,
	logger *slog.Logger,
	stream *bybit.PublicTradeStream,
	source rulesource.Source,
	interval time.Duration,
) {
	load := func() {
		rules, err := source.Load(ctx)
		if err != nil {
			logger.Warn("rule sync failed", slog.String("source", source.Name()), slog.Any("error", err))
			stream.SetRuleSyncError(source.Name(), err)
			return
		}

		stream.SetRules(source.Name(), rules)
	}

	load()

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			load()
		}
	}
}

func resolveOutcomes(
	ctx context.Context,
	logger *slog.Logger,
	resolver *outcome.Resolver,
	interval time.Duration,
) {
	resolve := func() {
		if err := resolver.ResolvePending(ctx); err != nil {
			logger.Warn("outcome resolution pass failed", slog.Any("error", err))
		}
	}

	resolve()

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			resolve()
		}
	}
}
