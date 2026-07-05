package bybit

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strconv"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"sentinelflow/engine/internal/alerts"
	"sentinelflow/engine/internal/alertstore"
	"sentinelflow/engine/internal/config"
	"sentinelflow/engine/internal/evaluator"
	"sentinelflow/engine/internal/marketstate"
	"sentinelflow/engine/internal/proof"
	"sentinelflow/engine/internal/telegram"
)

type PublicTradeStream struct {
	cfg    config.Config
	logger *slog.Logger

	marketState     *marketstate.State
	evaluator       *evaluator.Evaluator
	rules           []evaluator.Rule
	alertStore      alertRecordStore
	retryDelays     []time.Duration
	sleep           func(context.Context, time.Duration) error
	now             func() time.Time
	telegramClient  alertPhotoSender
	telegramTargets alertTargetLookup
	mu              sync.RWMutex
	status          Status
}

type alertRecordStore interface {
	IsConfigured() bool
	Upsert(context.Context, alerts.Record) error
}

type alertPhotoSender interface {
	IsConfigured() bool
	SendAlertPhoto(context.Context, string, alerts.Record, proof.RasterizedArtifact) error
}

type alertTargetLookup interface {
	IsConfigured() bool
	Lookup(context.Context, string) (*telegram.Target, error)
}

type Status struct {
	Candles           []marketstate.Candle `json:"candles"`
	Connected         bool                 `json:"connected"`
	Delivery          DeliveryState        `json:"delivery"`
	Evaluator         EvaluatorState       `json:"evaluator"`
	LastConnectAt     time.Time            `json:"lastConnectAt,omitempty"`
	LastDisconnectAt  time.Time            `json:"lastDisconnectAt,omitempty"`
	LastError         string               `json:"lastError,omitempty"`
	LastMessageAt     time.Time            `json:"lastMessageAt,omitempty"`
	MessagesReceived  int64                `json:"messagesReceived"`
	TradesNormalized  int64                `json:"tradesNormalized"`
	ReconnectAttempts int64                `json:"reconnectAttempts"`
	SubscribedTopics  []string             `json:"subscribedTopics"`
	Symbols           []SymbolState        `json:"symbols"`
}

type DeliveryState struct {
	DispatchAttempts   int64     `json:"dispatchAttempts"`
	DeliveredAlerts    int64     `json:"deliveredAlerts"`
	LastAlertID        string    `json:"lastAlertId,omitempty"`
	LastDeliveryAt     time.Time `json:"lastDeliveryAt,omitempty"`
	LastDeliveryErr    string    `json:"lastDeliveryErr,omitempty"`
	LastDeliveryStatus string    `json:"lastDeliveryStatus,omitempty"`
	LastPersistAt      time.Time `json:"lastPersistAt,omitempty"`
	LastPersistErr     string    `json:"lastPersistErr,omitempty"`
	PersistedWrites    int64     `json:"persistedWrites"`
	RetryAttempts      int64     `json:"retryAttempts"`
}

type EvaluatorState struct {
	ConfiguredRules int             `json:"configuredRules"`
	LastRuleSyncAt  time.Time       `json:"lastRuleSyncAt,omitempty"`
	LastRuleSyncErr string          `json:"lastRuleSyncErr,omitempty"`
	RecentAlerts    []alerts.Record `json:"recentAlerts"`
	RuleSource      string          `json:"ruleSource"`
}

type SymbolState struct {
	LastPrice        float64   `json:"lastPrice"`
	LastSide         string    `json:"lastSide"`
	LastSize         float64   `json:"lastSize"`
	LastTradeAt      time.Time `json:"lastTradeAt,omitempty"`
	Symbol           string    `json:"symbol"`
	TradesNormalized int64     `json:"tradesNormalized"`
}

type subscribeMessage struct {
	Args []string `json:"args"`
	Op   string   `json:"op"`
}

type pingMessage struct {
	Op string `json:"op"`
}

type publicTradeEnvelope struct {
	Topic string            `json:"topic"`
	Type  string            `json:"type"`
	Data  []json.RawMessage `json:"data"`
}

type publicTrade struct {
	Price     string `json:"p"`
	Side      string `json:"S"`
	Size      string `json:"v"`
	Symbol    string `json:"s"`
	Timestamp int64  `json:"T"`
}

type ValidationAlertInput struct {
	MarketSymbol string
	Message      string
	RuleName     string
	Side         string
	Timeframe    string
	UserID       string
}

func NewPublicTradeStream(cfg config.Config, logger *slog.Logger) *PublicTradeStream {
	marketState := marketstate.New()
	rules := evaluator.LaunchRules(cfg.BybitSymbols)

	return &PublicTradeStream{
		cfg:             cfg,
		logger:          logger,
		marketState:     marketState,
		evaluator:       evaluator.New(marketState),
		rules:           rules,
		alertStore:      alertstore.NewSupabaseStore(cfg.SupabaseURL, cfg.SupabaseSecretKey),
		retryDelays:     []time.Duration{2 * time.Second, 5 * time.Second},
		sleep:           sleepWithContext,
		now:             time.Now,
		telegramClient:  telegram.NewClient(cfg.TelegramBaseURL, cfg.TelegramBotToken),
		telegramTargets: telegram.NewConnectionSource(cfg.SupabaseURL, cfg.SupabaseSecretKey),
		status: Status{
			SubscribedTopics: buildTopics(cfg.BybitSymbols),
			Symbols:          buildSymbolStates(cfg.BybitSymbols),
			Evaluator: EvaluatorState{
				ConfiguredRules: len(rules),
				RuleSource:      "static-launch-rules",
				RecentAlerts:    make([]alerts.Record, 0, 10),
			},
		},
	}
}

func (s *PublicTradeStream) Run(ctx context.Context) {
	backoff := time.Second

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		err := s.connectAndStream(ctx)
		if err != nil && !errors.Is(err, context.Canceled) {
			s.logger.Warn("bybit stream loop ended", slog.Any("error", err))
			s.setDisconnected(err)
		}

		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}

		if backoff < 15*time.Second {
			backoff *= 2
		}
	}
}

func (s *PublicTradeStream) Status() Status {
	s.mu.RLock()
	defer s.mu.RUnlock()

	copyStatus := s.status
	copyStatus.Candles = s.marketState.Snapshot()
	copyStatus.SubscribedTopics = append([]string(nil), s.status.SubscribedTopics...)
	copyStatus.Symbols = append([]SymbolState(nil), s.status.Symbols...)
	copyStatus.Evaluator.RecentAlerts = append([]alerts.Record(nil), s.status.Evaluator.RecentAlerts...)

	return copyStatus
}

func (s *PublicTradeStream) Ready() bool {
	status := s.Status()
	if !status.Connected || status.LastMessageAt.IsZero() {
		return false
	}

	return s.lastMessageFresh(status.LastMessageAt)
}

func (s *PublicTradeStream) lastMessageFresh(lastMessageAt time.Time) bool {
	if lastMessageAt.IsZero() {
		return false
	}

	readinessWindow := s.cfg.PingInterval * 2
	if readinessWindow <= 0 {
		readinessWindow = 40 * time.Second
	}

	return s.now().UTC().Sub(lastMessageAt) <= readinessWindow
}

func (s *PublicTradeStream) RulesReady(requireSync bool) bool {
	if !requireSync {
		return true
	}

	status := s.Status()
	if status.Evaluator.LastRuleSyncErr != "" {
		return false
	}

	if status.Evaluator.LastRuleSyncAt.IsZero() {
		return false
	}

	return true
}

func (s *PublicTradeStream) connectAndStream(ctx context.Context) error {
	s.incrementReconnectAttempts()

	connection, _, err := websocket.DefaultDialer.DialContext(ctx, s.cfg.BybitWebSocketURL, nil)
	if err != nil {
		return fmt.Errorf("dial bybit websocket: %w", err)
	}
	defer connection.Close()

	s.setConnected()

	if err := connection.WriteJSON(subscribeMessage{
		Args: buildTopics(s.cfg.BybitSymbols),
		Op:   "subscribe",
	}); err != nil {
		return fmt.Errorf("subscribe to topics: %w", err)
	}

	readDone := make(chan error, 1)
	go func() {
		readDone <- s.readLoop(ctx, connection)
	}()

	pingTicker := time.NewTicker(s.cfg.PingInterval)
	defer pingTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case err := <-readDone:
			return err
		case <-pingTicker.C:
			if err := connection.WriteJSON(pingMessage{Op: "ping"}); err != nil {
				return fmt.Errorf("write ping: %w", err)
			}
		}
	}
}

func (s *PublicTradeStream) readLoop(ctx context.Context, connection *websocket.Conn) error {
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		_, payload, err := connection.ReadMessage()
		if err != nil {
			return fmt.Errorf("read websocket message: %w", err)
		}

		s.recordMessage()

		var envelope publicTradeEnvelope
		if err := json.Unmarshal(payload, &envelope); err != nil {
			continue
		}

		if envelope.Topic == "" {
			continue
		}

		s.processEnvelope(envelope)
	}
}

func buildTopics(symbols []string) []string {
	topics := make([]string, 0, len(symbols))

	for _, symbol := range symbols {
		topics = append(topics, "publicTrade."+symbol)
	}

	return topics
}

func buildSymbolStates(symbols []string) []SymbolState {
	items := make([]SymbolState, 0, len(symbols))

	for _, symbol := range symbols {
		items = append(items, SymbolState{Symbol: symbol})
	}

	return items
}

func (s *PublicTradeStream) processEnvelope(envelope publicTradeEnvelope) {
	if envelope.Topic == "" || len(envelope.Data) == 0 {
		return
	}

	for _, item := range envelope.Data {
		trade, ok := normalizeTrade(item)
		if !ok {
			continue
		}

		s.recordTrade(trade)
	}
}

func normalizeTrade(raw json.RawMessage) (publicTrade, bool) {
	var trade publicTrade
	if err := json.Unmarshal(raw, &trade); err != nil {
		return publicTrade{}, false
	}

	if trade.Symbol == "" || trade.Price == "" || trade.Size == "" || trade.Side == "" || trade.Timestamp == 0 {
		return publicTrade{}, false
	}

	return trade, true
}

func (s *PublicTradeStream) incrementReconnectAttempts() {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.status.ReconnectAttempts++
}

func (s *PublicTradeStream) setConnected() {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.status.Connected = true
	s.status.LastConnectAt = s.now().UTC()
	s.status.LastError = ""
}

func (s *PublicTradeStream) setDisconnected(err error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.status.Connected = false
	s.status.LastDisconnectAt = s.now().UTC()
	if err != nil {
		s.status.LastError = err.Error()
	}
}

func (s *PublicTradeStream) recordMessage() {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.status.LastMessageAt = s.now().UTC()
	s.status.MessagesReceived++
}

func (s *PublicTradeStream) recordTrade(trade publicTrade) {
	price, priceErr := strconv.ParseFloat(trade.Price, 64)
	size, sizeErr := strconv.ParseFloat(trade.Size, 64)
	if priceErr != nil || sizeErr != nil {
		return
	}

	tradeTime := time.UnixMilli(trade.Timestamp).UTC()
	normalizedTrade := marketstate.Trade{
		Price:     price,
		Side:      trade.Side,
		Size:      size,
		Symbol:    trade.Symbol,
		Timestamp: tradeTime,
	}

	s.mu.Lock()
	s.status.TradesNormalized++
	s.marketState.UpdateTrade(normalizedTrade)

	for index := range s.status.Symbols {
		if s.status.Symbols[index].Symbol != trade.Symbol {
			continue
		}

		s.status.Symbols[index].LastPrice = price
		s.status.Symbols[index].LastSide = trade.Side
		s.status.Symbols[index].LastSize = size
		s.status.Symbols[index].LastTradeAt = tradeTime
		s.status.Symbols[index].TradesNormalized++
		s.mu.Unlock()
		s.evaluateRulesForSymbol(trade.Symbol)
		return
	}

	s.status.Symbols = append(s.status.Symbols, SymbolState{
		LastPrice:        price,
		LastSide:         trade.Side,
		LastSize:         size,
		LastTradeAt:      tradeTime,
		Symbol:           trade.Symbol,
		TradesNormalized: 1,
	})
	s.mu.Unlock()
	s.evaluateRulesForSymbol(trade.Symbol)
}

func (s *PublicTradeStream) evaluateRulesForSymbol(symbol string) {
	for _, rule := range s.rulesSnapshot() {
		if rule.MarketSymbol != symbol {
			continue
		}

		event, ok := s.evaluator.Evaluate(rule)
		if !ok || event == nil {
			continue
		}

		s.recordAndDispatchAlert(alerts.NewRecord(*event, s.renderProof(rule, *event)))
	}
}

func (s *PublicTradeStream) renderProof(rule evaluator.Rule, event evaluator.Event) proof.Artifact {
	window := 1
	if rule.StackedImbalance != nil && rule.StackedImbalance.ConfirmationRows > 0 {
		window = rule.StackedImbalance.ConfirmationRows
	}

	current, ok := s.marketState.CurrentCandle(rule.MarketSymbol, rule.Timeframe)
	if !ok {
		return proof.Artifact{}
	}

	recent := s.marketState.RecentCandles(rule.MarketSymbol, rule.Timeframe, window-1)
	candles := append(recent, current)
	if len(candles) > window {
		candles = candles[len(candles)-window:]
	}

	return proof.NewSVGArtifact(proof.RenderSVG(proof.Snapshot{
		Candles: candles,
		Event:   event,
	}))
}

func (s *PublicTradeStream) recordAndDispatchAlert(record alerts.Record) {
	s.recordAlert(record)

	if !s.shouldProcessAlertLifecycle(record) {
		return
	}

	go s.processAlertLifecycle(record)
}

func (s *PublicTradeStream) shouldProcessAlertLifecycle(record alerts.Record) bool {
	return s.canPersistAlert(record) || s.canDispatchAlert(record)
}

func (s *PublicTradeStream) canPersistAlert(record alerts.Record) bool {
	return record.UserID != "" &&
		s.alertStore != nil &&
		s.alertStore.IsConfigured()
}

func (s *PublicTradeStream) canDispatchAlert(record alerts.Record) bool {
	return record.UserID != "" &&
		s.telegramClient != nil &&
		s.telegramClient.IsConfigured() &&
		s.telegramTargets != nil &&
		s.telegramTargets.IsConfigured()
}

func (s *PublicTradeStream) processAlertLifecycle(record alerts.Record) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := s.persistAlert(ctx, record); err != nil {
		s.logger.Warn("alert persistence failed",
			slog.String("alert_id", record.ID),
			slog.String("user_id", record.UserID),
			slog.Any("error", err),
		)
	}

	if !s.canDispatchAlert(record) {
		return
	}

	s.dispatchAlertWithRetry(record)
}

type dispatchResult int

const (
	dispatchDelivered dispatchResult = iota
	dispatchNoTarget
	dispatchRetryableFailure
	dispatchTerminalFailure
)

func (s *PublicTradeStream) dispatchAlertWithRetry(record alerts.Record) {
	attempts := len(s.retryDelays) + 1

	for attempt := 0; attempt < attempts; attempt++ {
		s.recordDispatchAttempt(record.ID)
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		result := s.dispatchAlert(ctx, record)
		cancel()

		switch result {
		case dispatchDelivered, dispatchNoTarget, dispatchTerminalFailure:
			return
		case dispatchRetryableFailure:
		}

		if attempt >= len(s.retryDelays) {
			return
		}

		s.recordRetryAttempt(record.ID)
		if err := s.sleep(context.Background(), s.retryDelays[attempt]); err != nil {
			return
		}
	}
}

func (s *PublicTradeStream) dispatchAlert(ctx context.Context, record alerts.Record) dispatchResult {
	target, err := s.telegramTargets.Lookup(ctx, record.UserID)
	if err != nil {
		s.logger.Warn("telegram target lookup failed",
			slog.String("alert_id", record.ID),
			slog.String("user_id", record.UserID),
			slog.Any("error", err),
		)
		s.recordDeliveryError(record.ID, err)
		s.persistDeliveryStatus(ctx, record.ID, alerts.StatusRetrying)
		return dispatchRetryableFailure
	}

	if target == nil || target.ChatID == "" {
		s.logger.Info("telegram target unavailable for alert delivery",
			slog.String("alert_id", record.ID),
			slog.String("user_id", record.UserID),
		)
		return dispatchNoTarget
	}

	s.persistDeliveryStatus(ctx, record.ID, alerts.StatusQueued)

	artifact, err := s.renderTelegramProof(record)
	if err != nil {
		s.logger.Warn("telegram proof rendering failed",
			slog.String("alert_id", record.ID),
			slog.Any("error", err),
		)
		s.recordDeliveryError(record.ID, err)
		s.persistDeliveryStatus(ctx, record.ID, alerts.StatusRetrying)
		return dispatchTerminalFailure
	}

	if err := s.telegramClient.SendAlertPhoto(ctx, target.ChatID, record, artifact); err != nil {
		s.logger.Warn("telegram alert delivery failed",
			slog.String("alert_id", record.ID),
			slog.String("chat_id", target.ChatID),
			slog.Any("error", err),
		)
		s.recordDeliveryError(record.ID, err)
		s.persistDeliveryStatus(ctx, record.ID, alerts.StatusRetrying)
		return dispatchRetryableFailure
	}

	s.persistDeliveryStatus(ctx, record.ID, alerts.StatusDelivered)
	s.recordDelivered(record.ID)
	return dispatchDelivered
}

func sleepWithContext(ctx context.Context, delay time.Duration) error {
	timer := time.NewTimer(delay)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func (s *PublicTradeStream) renderTelegramProof(record alerts.Record) (proof.RasterizedArtifact, error) {
	if record.Proof.Content == "" {
		return proof.RasterizedArtifact{}, fmt.Errorf("proof content is empty")
	}

	width := record.Proof.Width
	if width <= 0 {
		width = proof.DefaultWidth
	}

	height := record.Proof.Height
	if height <= 0 {
		height = proof.DefaultHeight
	}

	return proof.RasterizeSVG(record.Proof.Content, width, height)
}

func (s *PublicTradeStream) recordAlert(record alerts.Record) {
	s.mu.Lock()
	defer s.mu.Unlock()

	items := append(s.status.Evaluator.RecentAlerts, record)
	if len(items) > 10 {
		items = append([]alerts.Record(nil), items[len(items)-10:]...)
	}

	s.status.Evaluator.RecentAlerts = items
}

func (s *PublicTradeStream) persistAlert(ctx context.Context, record alerts.Record) error {
	if !s.canPersistAlert(record) {
		return nil
	}

	err := s.alertStore.Upsert(ctx, record)
	if err != nil {
		s.recordPersistError(record.ID, err)
		return err
	}

	s.recordPersistSuccess(record.ID)
	return nil
}

func (s *PublicTradeStream) persistDeliveryStatus(ctx context.Context, id string, deliveryStatus alerts.DeliveryStatus) {
	record, ok := s.updateAlertDeliveryStatus(id, deliveryStatus)
	if !ok {
		return
	}

	s.recordDeliveryStatus(id, deliveryStatus)

	if err := s.persistAlert(ctx, record); err != nil {
		s.logger.Warn("alert status persistence failed",
			slog.String("alert_id", id),
			slog.String("delivery_status", string(deliveryStatus)),
			slog.Any("error", err),
		)
	}
}

func (s *PublicTradeStream) updateAlertDeliveryStatus(id string, deliveryStatus alerts.DeliveryStatus) (alerts.Record, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for index := range s.status.Evaluator.RecentAlerts {
		if s.status.Evaluator.RecentAlerts[index].ID != id {
			continue
		}

		s.status.Evaluator.RecentAlerts[index].DeliveryStatus = deliveryStatus
		return s.status.Evaluator.RecentAlerts[index], true
	}

	return alerts.Record{}, false
}

func (s *PublicTradeStream) recordDispatchAttempt(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.status.Delivery.DispatchAttempts++
	s.status.Delivery.LastAlertID = id
}

func (s *PublicTradeStream) recordRetryAttempt(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.status.Delivery.RetryAttempts++
	s.status.Delivery.LastAlertID = id
}

func (s *PublicTradeStream) recordPersistSuccess(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.status.Delivery.LastAlertID = id
	s.status.Delivery.LastPersistAt = s.now().UTC()
	s.status.Delivery.LastPersistErr = ""
	s.status.Delivery.PersistedWrites++
}

func (s *PublicTradeStream) recordPersistError(id string, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.status.Delivery.LastAlertID = id
	if err != nil {
		s.status.Delivery.LastPersistErr = err.Error()
	}
}

func (s *PublicTradeStream) recordDeliveryStatus(id string, deliveryStatus alerts.DeliveryStatus) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.status.Delivery.LastAlertID = id
	s.status.Delivery.LastDeliveryStatus = string(deliveryStatus)
}

func (s *PublicTradeStream) recordDeliveryError(id string, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.status.Delivery.LastAlertID = id
	if err != nil {
		s.status.Delivery.LastDeliveryErr = err.Error()
	}
}

func (s *PublicTradeStream) recordDelivered(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.status.Delivery.DeliveredAlerts++
	s.status.Delivery.LastAlertID = id
	s.status.Delivery.LastDeliveryAt = s.now().UTC()
	s.status.Delivery.LastDeliveryErr = ""
	s.status.Delivery.LastDeliveryStatus = string(alerts.StatusDelivered)
}

func (s *PublicTradeStream) rulesSnapshot() []evaluator.Rule {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return append([]evaluator.Rule(nil), s.rules...)
}

func (s *PublicTradeStream) SetRules(source string, rules []evaluator.Rule) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.rules = append([]evaluator.Rule(nil), rules...)
	s.status.Evaluator.ConfiguredRules = len(rules)
	s.status.Evaluator.RuleSource = source
	s.status.Evaluator.LastRuleSyncAt = s.now().UTC()
	s.status.Evaluator.LastRuleSyncErr = ""
}

func (s *PublicTradeStream) SetRuleSyncError(source string, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.status.Evaluator.RuleSource = source
	s.status.Evaluator.LastRuleSyncAt = time.Time{}
	if err != nil {
		s.status.Evaluator.LastRuleSyncErr = err.Error()
	}
}

func (s *PublicTradeStream) TriggerValidationAlert(input ValidationAlertInput) (alerts.Record, error) {
	if input.UserID == "" {
		return alerts.Record{}, fmt.Errorf("validation alert user id is required")
	}

	if !isAllowedMarketSymbol(input.MarketSymbol) {
		return alerts.Record{}, fmt.Errorf("unsupported validation market symbol %q", input.MarketSymbol)
	}

	if !isAllowedTimeframe(input.Timeframe) {
		return alerts.Record{}, fmt.Errorf("unsupported validation timeframe %q", input.Timeframe)
	}

	if input.Side != "buy" && input.Side != "sell" {
		return alerts.Record{}, fmt.Errorf("unsupported validation side %q", input.Side)
	}

	ruleName := input.RuleName
	if ruleName == "" {
		ruleName = fmt.Sprintf("%s %s validation alert", input.MarketSymbol, input.Timeframe)
	}

	message := input.Message
	if message == "" {
		message = fmt.Sprintf(
			"%s %s %s validation alert generated through the Sentinel Flow verification endpoint.",
			input.MarketSymbol,
			input.Timeframe,
			input.Side,
		)
	}

	event := evaluator.Event{
		BucketStart: time.Now().UTC(),
		Message:     message,
		RuleID:      fmt.Sprintf("validation:%s:%s:%s", input.UserID, input.MarketSymbol, input.Timeframe),
		RuleName:    ruleName,
		Side:        input.Side,
		Symbol:      input.MarketSymbol,
		Timeframe:   input.Timeframe,
		UserID:      input.UserID,
	}

	artifact := proof.NewSVGArtifact(proof.RenderSVG(proof.Snapshot{Event: event}))
	record := alerts.NewRecord(event, artifact)
	s.recordAndDispatchAlert(record)

	return record, nil
}

func isAllowedMarketSymbol(symbol string) bool {
	switch symbol {
	case "BTCUSDT", "ETHUSDT":
		return true
	default:
		return false
	}
}

func isAllowedTimeframe(timeframe string) bool {
	switch timeframe {
	case "1m", "5m", "15m":
		return true
	default:
		return false
	}
}

func (s *PublicTradeStream) SetNowForTests(now func() time.Time) {
	s.now = now
}

func (s *PublicTradeStream) MarkConnectedForTests() {
	s.setConnected()
}

func (s *PublicTradeStream) RecordMessageForTests() {
	s.recordMessage()
}
