package app

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"sentinelflow/engine/internal/alerts"
	"sentinelflow/engine/internal/bybit"
	"sentinelflow/engine/internal/marketstate"
)

type statusResponse struct {
	Name        string       `json:"name"`
	Reason      string       `json:"reason,omitempty"`
	Status      string       `json:"status"`
	Timestamp   string       `json:"timestamp"`
	Environment string       `json:"environment"`
	Stream      *streamState `json:"stream,omitempty"`
}

type streamState struct {
	Connected         bool           `json:"connected"`
	Delivery          deliveryState  `json:"delivery"`
	Fresh             bool           `json:"fresh"`
	LastConnectAt     string         `json:"lastConnectAt,omitempty"`
	LastDisconnectAt  string         `json:"lastDisconnectAt,omitempty"`
	LastError         string         `json:"lastError,omitempty"`
	LastMessageAt     string         `json:"lastMessageAt,omitempty"`
	MessagesReceived  int64          `json:"messagesReceived"`
	TradesNormalized  int64          `json:"tradesNormalized"`
	ReconnectAttempts int64          `json:"reconnectAttempts"`
	SubscribedTopics  []string       `json:"subscribedTopics"`
	Candles           []candleState  `json:"candles"`
	Evaluator         evaluatorState `json:"evaluator"`
	Symbols           []symbolState  `json:"symbols"`
}

type deliveryState struct {
	DispatchAttempts   int64  `json:"dispatchAttempts"`
	DeliveredAlerts    int64  `json:"deliveredAlerts"`
	LastAlertID        string `json:"lastAlertId,omitempty"`
	LastDeliveryAt     string `json:"lastDeliveryAt,omitempty"`
	LastDeliveryErr    string `json:"lastDeliveryErr,omitempty"`
	LastDeliveryStatus string `json:"lastDeliveryStatus,omitempty"`
	LastPersistAt      string `json:"lastPersistAt,omitempty"`
	LastPersistErr     string `json:"lastPersistErr,omitempty"`
	PersistedWrites    int64  `json:"persistedWrites"`
	RetryAttempts      int64  `json:"retryAttempts"`
}

type evaluatorState struct {
	ConfiguredRules int           `json:"configuredRules"`
	LastRuleSyncAt  string        `json:"lastRuleSyncAt,omitempty"`
	LastRuleSyncErr string        `json:"lastRuleSyncErr,omitempty"`
	RecentAlerts    []alertRecord `json:"recentAlerts"`
	RuleSource      string        `json:"ruleSource"`
}

type alertRecord struct {
	CreatedAt      string        `json:"createdAt"`
	DeliveryStatus string        `json:"deliveryStatus"`
	ID             string        `json:"id"`
	MarketSymbol   string        `json:"marketSymbol"`
	Message        string        `json:"message"`
	Proof          proofArtifact `json:"proof"`
	RuleName       string        `json:"ruleName"`
	Side           string        `json:"side"`
	Timeframe      string        `json:"timeframe"`
}

type proofArtifact struct {
	Content     string `json:"content"`
	ContentHash string `json:"contentHash"`
	Height      int    `json:"height"`
	MediaType   string `json:"mediaType"`
	Width       int    `json:"width"`
}

type symbolState struct {
	LastPrice        float64 `json:"lastPrice"`
	LastSide         string  `json:"lastSide"`
	LastSize         float64 `json:"lastSize"`
	LastTradeAt      string  `json:"lastTradeAt,omitempty"`
	Symbol           string  `json:"symbol"`
	TradesNormalized int64   `json:"tradesNormalized"`
}

type candleState struct {
	BucketStart string  `json:"bucketStart"`
	BuyVolume   float64 `json:"buyVolume"`
	Close       float64 `json:"close"`
	High        float64 `json:"high"`
	Low         float64 `json:"low"`
	Open        float64 `json:"open"`
	SellVolume  float64 `json:"sellVolume"`
	Symbol      string  `json:"symbol"`
	Timeframe   string  `json:"timeframe"`
	TotalVolume float64 `json:"totalVolume"`
	Trades      int64   `json:"trades"`
}

type validationAlertRequest struct {
	MarketSymbol string `json:"marketSymbol"`
	Message      string `json:"message"`
	RuleName     string `json:"ruleName"`
	Side         string `json:"side"`
	Timeframe    string `json:"timeframe"`
	UserID       string `json:"userId"`
}

func (a *App) handleRoot(writer http.ResponseWriter, request *http.Request) {
	a.writeJSON(writer, http.StatusOK, map[string]string{
		"name":    "sentinel-flow-engine",
		"status":  "running",
		"message": "Sentinel Flow engine scaffold is live.",
	})
}

func (a *App) handleHealth(writer http.ResponseWriter, request *http.Request) {
	a.writeJSON(writer, http.StatusOK, statusResponse{
		Name:        "sentinel-flow-engine",
		Status:      "healthy",
		Timestamp:   time.Now().UTC().Format(time.RFC3339),
		Environment: a.config.Environment,
		Stream:      a.streamState(),
	})
}

func (a *App) handleReady(writer http.ResponseWriter, request *http.Request) {
	statusCode := http.StatusServiceUnavailable
	status := "warming"
	reason := "waiting-for-market-data"

	ready, readinessReason := a.tradeStream.Readiness(a.config.HasSupabaseRuleSource())
	if ready {
		statusCode = http.StatusOK
		status = "ready"
		reason = ""
	} else if readinessReason != "" {
		reason = readinessReason
	}

	a.writeJSON(writer, statusCode, statusResponse{
		Name:        "sentinel-flow-engine",
		Reason:      reason,
		Status:      status,
		Timestamp:   time.Now().UTC().Format(time.RFC3339),
		Environment: a.config.Environment,
		Stream:      a.streamState(),
	})
}

func (a *App) handleValidationAlert(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		a.writeJSON(writer, http.StatusMethodNotAllowed, map[string]string{
			"error": "method not allowed",
		})
		return
	}

	if !a.config.HasValidationAPIKey() {
		a.writeJSON(writer, http.StatusNotFound, map[string]string{
			"error": "validation endpoint is disabled",
		})
		return
	}

	if strings.TrimSpace(request.Header.Get("x-validation-key")) != a.config.ValidationAPIKey {
		a.writeJSON(writer, http.StatusUnauthorized, map[string]string{
			"error": "validation key is invalid",
		})
		return
	}

	var payload validationAlertRequest
	if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
		a.writeJSON(writer, http.StatusBadRequest, map[string]string{
			"error": "request body must be valid JSON",
		})
		return
	}

	record, err := a.tradeStream.TriggerValidationAlert(bybit.ValidationAlertInput{
		MarketSymbol: payload.MarketSymbol,
		Message:      payload.Message,
		RuleName:     payload.RuleName,
		Side:         payload.Side,
		Timeframe:    payload.Timeframe,
		UserID:       payload.UserID,
	})
	if err != nil {
		a.writeJSON(writer, http.StatusBadRequest, map[string]string{
			"error": err.Error(),
		})
		return
	}

	a.writeJSON(writer, http.StatusAccepted, map[string]any{
		"alertId":        record.ID,
		"deliveryStatus": string(record.DeliveryStatus),
		"message":        "Validation alert accepted.",
	})
}

func (a *App) writeJSON(writer http.ResponseWriter, statusCode int, value any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(statusCode)

	if err := json.NewEncoder(writer).Encode(value); err != nil {
		a.logger.Error("failed to write json response")
	}
}

func (a *App) streamState() *streamState {
	status := a.tradeStream.Status()

	state := &streamState{
		Connected: status.Connected,
		Delivery: deliveryState{
			DispatchAttempts:   status.Delivery.DispatchAttempts,
			DeliveredAlerts:    status.Delivery.DeliveredAlerts,
			LastAlertID:        status.Delivery.LastAlertID,
			LastDeliveryErr:    status.Delivery.LastDeliveryErr,
			LastDeliveryStatus: status.Delivery.LastDeliveryStatus,
			LastPersistErr:     status.Delivery.LastPersistErr,
			PersistedWrites:    status.Delivery.PersistedWrites,
			RetryAttempts:      status.Delivery.RetryAttempts,
		},
		Fresh:             a.tradeStream.Ready(),
		LastError:         status.LastError,
		MessagesReceived:  status.MessagesReceived,
		TradesNormalized:  status.TradesNormalized,
		ReconnectAttempts: status.ReconnectAttempts,
		SubscribedTopics:  status.SubscribedTopics,
		Candles:           make([]candleState, 0, len(status.Candles)),
		Evaluator: evaluatorState{
			ConfiguredRules: status.Evaluator.ConfiguredRules,
			LastRuleSyncErr: status.Evaluator.LastRuleSyncErr,
			RecentAlerts:    make([]alertRecord, 0, len(status.Evaluator.RecentAlerts)),
			RuleSource:      status.Evaluator.RuleSource,
		},
		Symbols: make([]symbolState, 0, len(status.Symbols)),
	}

	if !status.LastConnectAt.IsZero() {
		state.LastConnectAt = status.LastConnectAt.Format(time.RFC3339)
	}

	if !status.LastDisconnectAt.IsZero() {
		state.LastDisconnectAt = status.LastDisconnectAt.Format(time.RFC3339)
	}

	if !status.LastMessageAt.IsZero() {
		state.LastMessageAt = status.LastMessageAt.Format(time.RFC3339)
	}

	if !status.Evaluator.LastRuleSyncAt.IsZero() {
		state.Evaluator.LastRuleSyncAt = status.Evaluator.LastRuleSyncAt.Format(time.RFC3339)
	}

	if !status.Delivery.LastDeliveryAt.IsZero() {
		state.Delivery.LastDeliveryAt = status.Delivery.LastDeliveryAt.Format(time.RFC3339)
	}

	if !status.Delivery.LastPersistAt.IsZero() {
		state.Delivery.LastPersistAt = status.Delivery.LastPersistAt.Format(time.RFC3339)
	}

	for _, symbol := range status.Symbols {
		item := symbolState{
			LastPrice:        symbol.LastPrice,
			LastSide:         symbol.LastSide,
			LastSize:         symbol.LastSize,
			Symbol:           symbol.Symbol,
			TradesNormalized: symbol.TradesNormalized,
		}

		if !symbol.LastTradeAt.IsZero() {
			item.LastTradeAt = symbol.LastTradeAt.Format(time.RFC3339)
		}

		state.Symbols = append(state.Symbols, item)
	}

	for _, candle := range status.Candles {
		state.Candles = append(state.Candles, toCandleState(candle))
	}

	for _, alert := range status.Evaluator.RecentAlerts {
		state.Evaluator.RecentAlerts = append(state.Evaluator.RecentAlerts, toAlertRecord(alert))
	}

	return state
}

func toCandleState(candle marketstate.Candle) candleState {
	return candleState{
		BucketStart: candle.BucketStart.Format(time.RFC3339),
		BuyVolume:   candle.BuyVolume,
		Close:       candle.Close,
		High:        candle.High,
		Low:         candle.Low,
		Open:        candle.Open,
		SellVolume:  candle.SellVolume,
		Symbol:      candle.Symbol,
		Timeframe:   candle.Timeframe,
		TotalVolume: candle.TotalVolume,
		Trades:      candle.Trades,
	}
}

func toAlertRecord(record alerts.Record) alertRecord {
	return alertRecord{
		CreatedAt:      record.CreatedAt.Format(time.RFC3339),
		DeliveryStatus: string(record.DeliveryStatus),
		ID:             record.ID,
		MarketSymbol:   record.MarketSymbol,
		Message:        record.Message,
		Proof: proofArtifact{
			Content:     record.Proof.Content,
			ContentHash: record.Proof.ContentHash,
			Height:      record.Proof.Height,
			MediaType:   record.Proof.MediaType,
			Width:       record.Proof.Width,
		},
		RuleName:  record.RuleName,
		Side:      record.Side,
		Timeframe: record.Timeframe,
	}
}
