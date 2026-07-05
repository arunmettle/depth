package bybit

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"testing"
	"time"

	"sentinelflow/engine/internal/alerts"
	"sentinelflow/engine/internal/config"
	"sentinelflow/engine/internal/evaluator"
	"sentinelflow/engine/internal/proof"
	"sentinelflow/engine/internal/telegram"
)

func TestBuildTopics(t *testing.T) {
	topics := buildTopics([]string{"BTCUSDT", "ETHUSDT"})

	if len(topics) != 2 {
		t.Fatalf("expected 2 topics, got %d", len(topics))
	}

	if topics[0] != "publicTrade.BTCUSDT" {
		t.Fatalf("unexpected first topic: %s", topics[0])
	}

	if topics[1] != "publicTrade.ETHUSDT" {
		t.Fatalf("unexpected second topic: %s", topics[1])
	}
}

func TestReadyDependsOnConnectionAndMessage(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	stream := NewPublicTradeStream(config.Config{
		BybitSymbols: []string{"BTCUSDT"},
	}, logger)

	if stream.Ready() {
		t.Fatal("expected stream to start unready")
	}

	stream.setConnected()
	if stream.Ready() {
		t.Fatal("expected connected stream without messages to remain unready")
	}

	stream.recordMessage()
	if !stream.Ready() {
		t.Fatal("expected connected stream with messages to be ready")
	}

	stream.setDisconnected(nil)
	if stream.Ready() {
		t.Fatal("expected disconnected stream to be unready")
	}
}

func TestStatusReturnsACopyOfSubscribedTopics(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	stream := NewPublicTradeStream(config.Config{
		BybitSymbols: []string{"BTCUSDT"},
	}, logger)

	stream.status.LastMessageAt = time.Now().UTC()

	status := stream.Status()
	status.SubscribedTopics[0] = "mutated"

	freshStatus := stream.Status()
	if freshStatus.SubscribedTopics[0] != "publicTrade.BTCUSDT" {
		t.Fatal("expected status topics to be returned as a copy")
	}
}

func TestProcessEnvelopeNormalizesTradeState(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	stream := NewPublicTradeStream(config.Config{
		BybitSymbols: []string{"BTCUSDT"},
	}, logger)

	payload, err := json.Marshal(publicTrade{
		Price:     "104523.5",
		Side:      "Buy",
		Size:      "0.125",
		Symbol:    "BTCUSDT",
		Timestamp: 1751691700000,
	})
	if err != nil {
		t.Fatalf("marshal trade payload: %v", err)
	}

	stream.processEnvelope(publicTradeEnvelope{
		Topic: "publicTrade.BTCUSDT",
		Data:  []json.RawMessage{payload},
	})

	status := stream.Status()
	if status.TradesNormalized != 1 {
		t.Fatalf("expected 1 normalized trade, got %d", status.TradesNormalized)
	}

	if len(status.Symbols) != 1 {
		t.Fatalf("expected one symbol state, got %d", len(status.Symbols))
	}

	if status.Symbols[0].LastPrice != 104523.5 {
		t.Fatalf("unexpected last price: %f", status.Symbols[0].LastPrice)
	}

	if status.Symbols[0].LastSize != 0.125 {
		t.Fatalf("unexpected last size: %f", status.Symbols[0].LastSize)
	}

	if status.Symbols[0].LastSide != "Buy" {
		t.Fatalf("unexpected last side: %s", status.Symbols[0].LastSide)
	}

	if status.Symbols[0].TradesNormalized != 1 {
		t.Fatalf("expected symbol trade count to be 1, got %d", status.Symbols[0].TradesNormalized)
	}
}

func TestStatusIncludesLaunchEvaluatorRules(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	stream := NewPublicTradeStream(config.Config{
		BybitSymbols: []string{"BTCUSDT", "ETHUSDT"},
	}, logger)

	status := stream.Status()
	if status.Evaluator.ConfiguredRules != 6 {
		t.Fatalf("expected 6 configured launch rules, got %d", status.Evaluator.ConfiguredRules)
	}
}

func TestProcessEnvelopeRecordsRecentEvaluatorEvents(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	stream := NewPublicTradeStream(config.Config{
		BybitSymbols: []string{"BTCUSDT"},
	}, logger)

	for minute := 0; minute < 3; minute++ {
		buyPayload, err := json.Marshal(publicTrade{
			Price:     "104523.5",
			Side:      "Buy",
			Size:      "1.0",
			Symbol:    "BTCUSDT",
			Timestamp: time.Date(2026, 7, 5, 6, minute, 10, 0, time.UTC).UnixMilli(),
		})
		if err != nil {
			t.Fatalf("marshal buy trade payload: %v", err)
		}

		sellPayload, err := json.Marshal(publicTrade{
			Price:     "104523.5",
			Side:      "Sell",
			Size:      "0.2",
			Symbol:    "BTCUSDT",
			Timestamp: time.Date(2026, 7, 5, 6, minute, 20, 0, time.UTC).UnixMilli(),
		})
		if err != nil {
			t.Fatalf("marshal sell trade payload: %v", err)
		}

		stream.processEnvelope(publicTradeEnvelope{
			Topic: "publicTrade.BTCUSDT",
			Data:  []json.RawMessage{buyPayload, sellPayload},
		})
	}

	status := stream.Status()
	if len(status.Evaluator.RecentAlerts) == 0 {
		t.Fatalf("expected at least one recent alert record")
	}

	record := status.Evaluator.RecentAlerts[len(status.Evaluator.RecentAlerts)-1]
	if record.ID == "" || record.MarketSymbol != "BTCUSDT" || record.Timeframe != "1m" {
		t.Fatalf("unexpected alert record: %+v", record)
	}

	if record.Proof.Content == "" {
		t.Fatal("expected alert record to include proof content")
	}

	if record.Proof.ContentHash == "" || record.Proof.MediaType != proof.SVGMediaType {
		t.Fatalf("expected alert record to include proof metadata, got %+v", record.Proof)
	}
}

func TestSetRulesUpdatesEvaluatorStatus(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	stream := NewPublicTradeStream(config.Config{
		BybitSymbols: []string{"BTCUSDT"},
	}, logger)

	stream.SetRules("supabase-alert-rules", nil)

	status := stream.Status()
	if status.Evaluator.RuleSource != "supabase-alert-rules" {
		t.Fatalf("unexpected rule source: %s", status.Evaluator.RuleSource)
	}

	if status.Evaluator.ConfiguredRules != 0 {
		t.Fatalf("expected configured rule count to be updated, got %d", status.Evaluator.ConfiguredRules)
	}

	if status.Evaluator.LastRuleSyncAt.IsZero() {
		t.Fatalf("expected last rule sync time to be set")
	}
}

func TestRulesReadyDependsOnSuccessfulRuleSyncWhenRequired(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	stream := NewPublicTradeStream(config.Config{
		BybitSymbols: []string{"BTCUSDT"},
	}, logger)

	if !stream.RulesReady(false) {
		t.Fatal("expected rules to be ready when sync is not required")
	}

	if stream.RulesReady(true) {
		t.Fatal("expected rules to be unready before first successful sync")
	}

	stream.SetRuleSyncError("supabase-alert-rules", io.EOF)
	if stream.RulesReady(true) {
		t.Fatal("expected rules to be unready after sync error")
	}

	stream.SetRules("supabase-alert-rules", []evaluator.Rule{{
		ID:           "rule-1",
		MarketSymbol: "BTCUSDT",
		Name:         "BTC stacked",
		RuleType:     "stacked_imbalance",
		Status:       "active",
		Timeframe:    "1m",
		StackedImbalance: &evaluator.StackedImbalanceParams{
			ConfirmationRows:    3,
			ThresholdMultiplier: 300,
		},
	}})

	if !stream.RulesReady(true) {
		t.Fatal("expected rules to be ready after successful sync")
	}
}

func TestRulesReadyAllowsSuccessfulZeroRuleSync(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	stream := NewPublicTradeStream(config.Config{
		BybitSymbols: []string{"BTCUSDT"},
	}, logger)

	stream.SetRules("supabase-alert-rules", nil)

	if !stream.RulesReady(true) {
		t.Fatal("expected successful zero-rule sync to count as ready")
	}
}

func TestDispatchAlertMarksRecordDeliveredOnSuccessfulTelegramSend(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	stream := NewPublicTradeStream(config.Config{
		BybitSymbols: []string{"BTCUSDT"},
	}, logger)

	store := &stubAlertRecordStore{isConfigured: true}
	targets := &stubAlertTargetLookup{
		target: &telegram.Target{
			ChatID: "12345",
			UserID: "user-1",
		},
	}
	client := &stubAlertPhotoSender{}

	stream.alertStore = store
	stream.retryDelays = nil
	stream.sleep = func(context.Context, time.Duration) error { return nil }
	stream.telegramTargets = targets
	stream.telegramClient = client

	record := alerts.Record{
		CreatedAt:      time.Date(2026, 7, 5, 6, 2, 0, 0, time.UTC),
		DeliveryStatus: alerts.StatusEvaluated,
		ID:             "alert-1",
		MarketSymbol:   "BTCUSDT",
		Message:        "BTCUSDT 1m buy stacked imbalance confirmed.",
		Proof:          proof.NewSVGArtifact(validProofSVG()),
		RuleName:       "BTC 1m stacked imbalance",
		Side:           "buy",
		Timeframe:      "1m",
		UserID:         "user-1",
	}

	stream.recordAlert(record)
	stream.processAlertLifecycle(record)

	status := stream.Status()
	if len(status.Evaluator.RecentAlerts) != 1 {
		t.Fatalf("expected one alert record, got %d", len(status.Evaluator.RecentAlerts))
	}

	if status.Evaluator.RecentAlerts[0].DeliveryStatus != alerts.StatusDelivered {
		t.Fatalf("expected delivered status, got %s", status.Evaluator.RecentAlerts[0].DeliveryStatus)
	}

	if client.sendCalls != 1 {
		t.Fatalf("expected one telegram send call, got %d", client.sendCalls)
	}

	if client.lastChatID != "12345" {
		t.Fatalf("unexpected chat id: %s", client.lastChatID)
	}

	if len(store.records) != 3 {
		t.Fatalf("expected evaluated, queued, and delivered persistence writes, got %d", len(store.records))
	}

	if store.records[0].DeliveryStatus != alerts.StatusEvaluated ||
		store.records[1].DeliveryStatus != alerts.StatusQueued ||
		store.records[2].DeliveryStatus != alerts.StatusDelivered {
		t.Fatalf("unexpected persisted delivery states: %+v", store.records)
	}
}

func TestDispatchAlertLeavesRecordEvaluatedWhenTelegramTargetIsMissing(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	stream := NewPublicTradeStream(config.Config{
		BybitSymbols: []string{"BTCUSDT"},
	}, logger)

	store := &stubAlertRecordStore{isConfigured: true}
	stream.alertStore = store
	stream.retryDelays = nil
	stream.sleep = func(context.Context, time.Duration) error { return nil }
	stream.telegramTargets = &stubAlertTargetLookup{}
	stream.telegramClient = &stubAlertPhotoSender{}

	record := alerts.Record{
		CreatedAt:      time.Date(2026, 7, 5, 6, 2, 0, 0, time.UTC),
		DeliveryStatus: alerts.StatusEvaluated,
		ID:             "alert-2",
		MarketSymbol:   "BTCUSDT",
		Message:        "BTCUSDT 1m buy stacked imbalance confirmed.",
		Proof:          proof.NewSVGArtifact(validProofSVG()),
		RuleName:       "BTC 1m stacked imbalance",
		Side:           "buy",
		Timeframe:      "1m",
		UserID:         "user-2",
	}

	stream.recordAlert(record)
	stream.processAlertLifecycle(record)

	status := stream.Status()
	if status.Evaluator.RecentAlerts[0].DeliveryStatus != alerts.StatusEvaluated {
		t.Fatalf("expected evaluated status when no telegram target exists, got %s", status.Evaluator.RecentAlerts[0].DeliveryStatus)
	}

	if len(store.records) != 1 || store.records[0].DeliveryStatus != alerts.StatusEvaluated {
		t.Fatalf("expected only the evaluated record to be persisted, got %+v", store.records)
	}
}

func TestDispatchAlertMarksRecordRetryingWhenTelegramSendFails(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	stream := NewPublicTradeStream(config.Config{
		BybitSymbols: []string{"BTCUSDT"},
	}, logger)

	store := &stubAlertRecordStore{isConfigured: true}
	stream.alertStore = store
	stream.retryDelays = nil
	stream.sleep = func(context.Context, time.Duration) error { return nil }
	stream.telegramTargets = &stubAlertTargetLookup{
		target: &telegram.Target{
			ChatID: "12345",
			UserID: "user-1",
		},
	}
	stream.telegramClient = &stubAlertPhotoSender{
		err: errors.New("telegram down"),
	}

	record := alerts.Record{
		CreatedAt:      time.Date(2026, 7, 5, 6, 2, 0, 0, time.UTC),
		DeliveryStatus: alerts.StatusEvaluated,
		ID:             "alert-3",
		MarketSymbol:   "BTCUSDT",
		Message:        "BTCUSDT 1m buy stacked imbalance confirmed.",
		Proof:          proof.NewSVGArtifact(validProofSVG()),
		RuleName:       "BTC 1m stacked imbalance",
		Side:           "buy",
		Timeframe:      "1m",
		UserID:         "user-3",
	}

	stream.recordAlert(record)
	stream.processAlertLifecycle(record)

	status := stream.Status()
	if status.Evaluator.RecentAlerts[0].DeliveryStatus != alerts.StatusRetrying {
		t.Fatalf("expected retrying status after telegram failure, got %s", status.Evaluator.RecentAlerts[0].DeliveryStatus)
	}

	if status.Delivery.DispatchAttempts != 1 || status.Delivery.RetryAttempts != 0 {
		t.Fatalf("unexpected delivery attempt counters: %+v", status.Delivery)
	}

	if status.Delivery.LastDeliveryErr == "" || status.Delivery.LastDeliveryStatus != string(alerts.StatusRetrying) {
		t.Fatalf("expected retrying delivery observability after failure, got %+v", status.Delivery)
	}

	if len(store.records) != 3 {
		t.Fatalf("expected evaluated, queued, and retrying persistence writes, got %d", len(store.records))
	}

	if store.records[0].DeliveryStatus != alerts.StatusEvaluated ||
		store.records[1].DeliveryStatus != alerts.StatusQueued ||
		store.records[2].DeliveryStatus != alerts.StatusRetrying {
		t.Fatalf("unexpected persisted retry path states: %+v", store.records)
	}
}

func TestDispatchAlertRetriesAndEventuallyDelivers(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	stream := NewPublicTradeStream(config.Config{
		BybitSymbols: []string{"BTCUSDT"},
	}, logger)

	store := &stubAlertRecordStore{isConfigured: true}
	sleepCalls := 0
	stream.alertStore = store
	stream.retryDelays = []time.Duration{time.Millisecond, time.Millisecond}
	stream.sleep = func(context.Context, time.Duration) error {
		sleepCalls++
		return nil
	}
	stream.telegramTargets = &stubAlertTargetLookup{
		target: &telegram.Target{
			ChatID: "12345",
			UserID: "user-4",
		},
	}
	stream.telegramClient = &stubAlertPhotoSender{
		errors: []error{errors.New("first failure")},
	}

	record := alerts.Record{
		CreatedAt:      time.Date(2026, 7, 5, 6, 2, 0, 0, time.UTC),
		DeliveryStatus: alerts.StatusEvaluated,
		ID:             "alert-4",
		MarketSymbol:   "BTCUSDT",
		Message:        "BTCUSDT 1m buy stacked imbalance confirmed.",
		Proof:          proof.NewSVGArtifact(validProofSVG()),
		RuleName:       "BTC 1m stacked imbalance",
		Side:           "buy",
		Timeframe:      "1m",
		UserID:         "user-4",
	}

	stream.recordAlert(record)
	stream.processAlertLifecycle(record)

	status := stream.Status()
	if status.Evaluator.RecentAlerts[0].DeliveryStatus != alerts.StatusDelivered {
		t.Fatalf("expected eventual delivered status after retry, got %s", status.Evaluator.RecentAlerts[0].DeliveryStatus)
	}

	if status.Delivery.DispatchAttempts != 2 || status.Delivery.RetryAttempts != 1 {
		t.Fatalf("unexpected retry counters: %+v", status.Delivery)
	}

	if status.Delivery.DeliveredAlerts != 1 || status.Delivery.PersistedWrites != 5 {
		t.Fatalf("unexpected delivered or persisted counters: %+v", status.Delivery)
	}

	if status.Delivery.LastAlertID != "alert-4" || status.Delivery.LastDeliveryStatus != string(alerts.StatusDelivered) {
		t.Fatalf("unexpected final delivery observability state: %+v", status.Delivery)
	}

	if status.Delivery.LastDeliveryErr != "" {
		t.Fatalf("expected delivery error to clear after success, got %+v", status.Delivery)
	}

	client := stream.telegramClient.(*stubAlertPhotoSender)
	if client.sendCalls != 2 {
		t.Fatalf("expected two send attempts, got %d", client.sendCalls)
	}

	if sleepCalls != 1 {
		t.Fatalf("expected one retry sleep, got %d", sleepCalls)
	}

	if len(store.records) != 5 {
		t.Fatalf("expected evaluated, queued, retrying, queued, and delivered writes, got %d", len(store.records))
	}

	if store.records[0].DeliveryStatus != alerts.StatusEvaluated ||
		store.records[1].DeliveryStatus != alerts.StatusQueued ||
		store.records[2].DeliveryStatus != alerts.StatusRetrying ||
		store.records[3].DeliveryStatus != alerts.StatusQueued ||
		store.records[4].DeliveryStatus != alerts.StatusDelivered {
		t.Fatalf("unexpected retry-success persistence path: %+v", store.records)
	}
}

func TestTriggerValidationAlertCreatesEvaluatedRecord(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	stream := NewPublicTradeStream(config.Config{
		BybitSymbols: []string{"BTCUSDT"},
	}, logger)

	record, err := stream.TriggerValidationAlert(ValidationAlertInput{
		MarketSymbol: "BTCUSDT",
		Side:         "buy",
		Timeframe:    "1m",
		UserID:       "user-5",
	})
	if err != nil {
		t.Fatalf("trigger validation alert: %v", err)
	}

	if record.ID == "" || record.DeliveryStatus != alerts.StatusEvaluated {
		t.Fatalf("unexpected validation record: %+v", record)
	}

	if record.Proof.Content == "" || record.Proof.ContentHash == "" {
		t.Fatalf("expected validation alert to include proof content, got %+v", record.Proof)
	}

	status := stream.Status()
	if len(status.Evaluator.RecentAlerts) != 1 {
		t.Fatalf("expected validation alert to be recorded, got %d records", len(status.Evaluator.RecentAlerts))
	}
}

type stubAlertTargetLookup struct {
	err    error
	target *telegram.Target
}

func (s *stubAlertTargetLookup) IsConfigured() bool {
	return true
}

func (s *stubAlertTargetLookup) Lookup(context.Context, string) (*telegram.Target, error) {
	return s.target, s.err
}

type stubAlertRecordStore struct {
	err          error
	isConfigured bool
	records      []alerts.Record
}

func (s *stubAlertRecordStore) IsConfigured() bool {
	return s.isConfigured
}

func (s *stubAlertRecordStore) Upsert(_ context.Context, record alerts.Record) error {
	s.records = append(s.records, record)
	return s.err
}

type stubAlertPhotoSender struct {
	err        error
	errors     []error
	lastChatID string
	sendCalls  int
}

func (s *stubAlertPhotoSender) IsConfigured() bool {
	return true
}

func (s *stubAlertPhotoSender) SendAlertPhoto(
	ctx context.Context,
	chatID string,
	record alerts.Record,
	artifact proof.RasterizedArtifact,
) error {
	_ = ctx
	_ = record
	_ = artifact
	s.sendCalls++
	s.lastChatID = chatID
	if len(s.errors) > 0 {
		err := s.errors[0]
		s.errors = s.errors[1:]
		return err
	}
	return s.err
}

func validProofSVG() string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="#ffffff"/></svg>`
}
