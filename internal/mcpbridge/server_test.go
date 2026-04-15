package mcpbridge

import "testing"

func TestNewServer(t *testing.T) {
	server, err := NewServer(Options{})
	if err != nil {
		t.Fatalf("NewServer() error = %v", err)
	}
	if server == nil {
		t.Fatal("NewServer() returned nil")
	}
}
