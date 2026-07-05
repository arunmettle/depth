package rulesource

import (
	"context"

	"sentinelflow/engine/internal/evaluator"
)

type Source interface {
	Load(context.Context) ([]evaluator.Rule, error)
	Name() string
}
