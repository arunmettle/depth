package config

import (
	"log/slog"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	defaultBybitWebSocketURL      = "wss://stream.bybit.com/v5/public/linear"
	defaultEnvironment            = "development"
	defaultHost                   = "127.0.0.1"
	defaultLogLevel               = "info"
	defaultPort                   = 8080
	defaultPingInterval           = 20 * time.Second
	defaultRuleSyncInterval       = time.Minute
	defaultOutcomeResolveInterval = 5 * time.Minute
)

type Config struct {
	BybitWebSocketURL      string
	Environment            string
	Host                   string
	BybitSymbols           []string
	LogLevel               slog.Level
	OutcomeResolveInterval time.Duration
	PingInterval           time.Duration
	Port                   int
	RuleSyncInterval       time.Duration
	SupabaseSecretKey      string
	SupabaseURL            string
	TelegramBotToken       string
	TelegramBaseURL        string
	ValidationAPIKey       string
}

func Load() Config {
	return Config{
		BybitWebSocketURL:      getEnv("BYBIT_WS_URL", defaultBybitWebSocketURL),
		BybitSymbols:           getEnvCSV("BYBIT_SYMBOLS", []string{"BTCUSDT", "ETHUSDT"}),
		Environment:            getEnv("APP_ENV", defaultEnvironment),
		Host:                   getEnv("HOST", defaultHost),
		LogLevel:               parseLogLevel(getEnv("LOG_LEVEL", defaultLogLevel)),
		OutcomeResolveInterval: getEnvDuration("OUTCOME_RESOLVE_INTERVAL", defaultOutcomeResolveInterval),
		PingInterval:           getEnvDuration("PING_INTERVAL", defaultPingInterval),
		Port:                   getEnvInt("PORT", defaultPort),
		RuleSyncInterval:       getEnvDuration("RULE_SYNC_INTERVAL", defaultRuleSyncInterval),
		SupabaseSecretKey:      getEnvAny([]string{"SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"}, ""),
		SupabaseURL:            getEnvAny([]string{"SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"}, ""),
		TelegramBotToken:       getEnv("TELEGRAM_BOT_TOKEN", ""),
		TelegramBaseURL:        getEnv("TELEGRAM_BASE_URL", "https://api.telegram.org"),
		ValidationAPIKey:       getEnv("VALIDATION_API_KEY", ""),
	}
}

func (c Config) BindAddress() string {
	return c.Host + ":" + strconv.Itoa(c.Port)
}

func (c Config) HasSupabaseRuleSource() bool {
	return c.SupabaseURL != "" && c.SupabaseSecretKey != ""
}

func (c Config) HasTelegramBot() bool {
	return c.TelegramBotToken != ""
}

func (c Config) HasValidationAPIKey() bool {
	return c.ValidationAPIKey != ""
}

func getEnv(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	return value
}

func getEnvAny(keys []string, fallback string) string {
	for _, key := range keys {
		value := os.Getenv(key)
		if value != "" {
			return value
		}
	}

	return fallback
}

func getEnvInt(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}

	return parsed
}

func getEnvCSV(key string, fallback []string) []string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	parts := strings.Split(value, ",")
	items := make([]string, 0, len(parts))

	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			items = append(items, trimmed)
		}
	}

	if len(items) == 0 {
		return fallback
	}

	return items
}

func getEnvDuration(key string, fallback time.Duration) time.Duration {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	parsed, err := time.ParseDuration(value)
	if err != nil {
		return fallback
	}

	return parsed
}

func parseLogLevel(value string) slog.Level {
	switch value {
	case "debug":
		return slog.LevelDebug
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
