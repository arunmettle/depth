package alerts

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"

	"sentinelflow/engine/internal/evaluator"
	"sentinelflow/engine/internal/proof"
)

type DeliveryStatus string

const (
	StatusDelivered DeliveryStatus = "delivered"
	StatusEvaluated DeliveryStatus = "evaluated"
	StatusQueued    DeliveryStatus = "queued"
	StatusRetrying  DeliveryStatus = "retrying"
)

type Record struct {
	CreatedAt      time.Time      `json:"createdAt"`
	DeliveryStatus DeliveryStatus `json:"deliveryStatus"`
	ID             string         `json:"id"`
	MarketSymbol   string         `json:"marketSymbol"`
	Message        string         `json:"message"`
	Proof          proof.Artifact `json:"proof"`
	RuleName       string         `json:"ruleName"`
	Side           string         `json:"side"`
	Timeframe      string         `json:"timeframe"`
	UserID         string         `json:"-"`
}

func NewRecord(event evaluator.Event, artifact proof.Artifact) Record {
	return Record{
		CreatedAt:      event.BucketStart.UTC(),
		DeliveryStatus: StatusEvaluated,
		ID:             recordID(event),
		MarketSymbol:   event.Symbol,
		Message:        event.Message,
		Proof:          artifact,
		RuleName:       event.RuleName,
		Side:           event.Side,
		Timeframe:      event.Timeframe,
		UserID:         event.UserID,
	}
}

func recordID(event evaluator.Event) string {
	hash := sha256.Sum256([]byte(fmt.Sprintf(
		"%s|%s|%s|%s",
		event.RuleID,
		event.BucketStart.UTC().Format(time.RFC3339),
		event.Side,
		event.Symbol,
	)))

	return hex.EncodeToString(hash[:12])
}
