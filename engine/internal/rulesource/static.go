package rulesource

import (
	"context"

	"sentinelflow/engine/internal/evaluator"
)

type StaticSource struct {
	rules []evaluator.Rule
}

func NewStaticSource(rules []evaluator.Rule) *StaticSource {
	return &StaticSource{rules: append([]evaluator.Rule(nil), rules...)}
}

func (s *StaticSource) Load(context.Context) ([]evaluator.Rule, error) {
	return append([]evaluator.Rule(nil), s.rules...), nil
}

func (s *StaticSource) Name() string {
	return "static-launch-rules"
}
