package telegram

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestConnectionSourceLookupReturnsTarget(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/rest/v1/telegram_connections" {
			t.Fatalf("unexpected request path: %s", request.URL.Path)
		}

		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`[{"user_id":"user-1","telegram_chat_id":"12345","telegram_username":"sentinel_user"}]`))
	}))
	defer server.Close()

	source := NewConnectionSource(server.URL, "secret-123")
	target, err := source.Lookup(context.Background(), "user-1")
	if err != nil {
		t.Fatalf("lookup telegram target: %v", err)
	}

	if target == nil || target.ChatID != "12345" || target.UserID != "user-1" {
		t.Fatalf("unexpected target: %+v", target)
	}
}

func TestConnectionSourceLookupReturnsNilWhenNoConnectionExists(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`[]`))
	}))
	defer server.Close()

	source := NewConnectionSource(server.URL, "secret-123")
	target, err := source.Lookup(context.Background(), "user-1")
	if err != nil {
		t.Fatalf("lookup telegram target: %v", err)
	}

	if target != nil {
		t.Fatalf("expected nil target when no connection exists, got %+v", target)
	}
}
