package rulesource

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSupabaseSourceLoadsStackedImbalanceRules(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/rest/v1/alert_rules" {
			t.Fatalf("unexpected request path: %s", request.URL.Path)
		}

		if request.Header.Get("apikey") != "secret-123" {
			t.Fatalf("missing apikey header")
		}

		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`[
			{
				"id":"rule-1",
				"user_id":"user-1",
				"name":"BTC stacked",
				"market_symbol":"BTCUSDT",
				"timeframe":"1m",
				"rule_type":"stacked_imbalance",
				"status":"active",
				"params":{"confirmationRows":3,"thresholdMultiplier":300}
			},
			{
				"id":"rule-ignored",
				"user_id":"user-1",
				"name":"Broken rule",
				"market_symbol":"BTCUSDT",
				"timeframe":"1m",
				"rule_type":"stacked_imbalance",
				"status":"active",
				"params":{"confirmationRows":0,"thresholdMultiplier":300}
			}
		]`))
	}))
	defer server.Close()

	source := NewSupabaseSource(server.URL, "secret-123", []string{"BTCUSDT"})
	rules, err := source.Load(context.Background())
	if err != nil {
		t.Fatalf("load supabase rules: %v", err)
	}

	if len(rules) != 1 {
		t.Fatalf("expected 1 valid rule, got %d", len(rules))
	}

	if rules[0].ID != "rule-1" || rules[0].Timeframe != "1m" || rules[0].UserID != "user-1" {
		t.Fatalf("unexpected rule loaded: %+v", rules[0])
	}
}

func TestSupabaseSourceReportsNonOKResponses(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		http.Error(writer, "forbidden", http.StatusForbidden)
	}))
	defer server.Close()

	source := NewSupabaseSource(server.URL, "secret-123", []string{"BTCUSDT"})
	if _, err := source.Load(context.Background()); err == nil {
		t.Fatalf("expected non-OK response to return an error")
	}
}

func TestSupabaseSourceLoadsTrappedTradersRules(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`[
			{
				"id":"rule-1",
				"user_id":"user-1",
				"name":"BTC trapped traders",
				"market_symbol":"BTCUSDT",
				"timeframe":"1m",
				"rule_type":"trapped_traders",
				"status":"active",
				"params":{"minAbsorptionVolume":250000,"trapSide":"both"}
			},
			{
				"id":"rule-ignored-volume",
				"user_id":"user-1",
				"name":"Broken rule",
				"market_symbol":"BTCUSDT",
				"timeframe":"1m",
				"rule_type":"trapped_traders",
				"status":"active",
				"params":{"minAbsorptionVolume":0,"trapSide":"both"}
			},
			{
				"id":"rule-ignored-trapside",
				"user_id":"user-1",
				"name":"Broken rule",
				"market_symbol":"BTCUSDT",
				"timeframe":"1m",
				"rule_type":"trapped_traders",
				"status":"active",
				"params":{"minAbsorptionVolume":250000,"trapSide":"sideways"}
			}
		]`))
	}))
	defer server.Close()

	source := NewSupabaseSource(server.URL, "secret-123", []string{"BTCUSDT"})
	rules, err := source.Load(context.Background())
	if err != nil {
		t.Fatalf("load supabase rules: %v", err)
	}

	if len(rules) != 1 {
		t.Fatalf("expected 1 valid rule, got %d", len(rules))
	}

	rule := rules[0]
	if rule.ID != "rule-1" || rule.RuleType != "trapped_traders" {
		t.Fatalf("unexpected rule loaded: %+v", rule)
	}

	if rule.TrappedTraders == nil {
		t.Fatalf("expected trapped traders params to be set")
	}

	if rule.TrappedTraders.MinAbsorptionVolume != 250000 || rule.TrappedTraders.TrapSide != "both" {
		t.Fatalf("unexpected trapped traders params: %+v", rule.TrappedTraders)
	}
}
