package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestReplaceTOMLSection(t *testing.T) {
	input := "model = \"x\"\n\n[mcp_servers.old]\ncommand = 'old'\nenabled = true\n\n[features]\nweb_search = \"live\"\n"
	replaced := replaceTOMLSection(input, "mcp_servers.old", "[mcp_servers.old]\ncommand = 'new'\nenabled = true")
	if !strings.Contains(replaced, "command = 'new'") {
		t.Fatalf("expected replacement to contain new command, got:\n%s", replaced)
	}
	if strings.Contains(replaced, "command = 'old'") {
		t.Fatalf("expected old block to be removed, got:\n%s", replaced)
	}
	if !strings.Contains(replaced, "[features]") {
		t.Fatalf("expected unrelated sections to be preserved, got:\n%s", replaced)
	}
}

func TestUpdateClaudeConfig(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "claude_desktop_config.json")
	if _, err := updateClaudeConfig(path, "/tmp/jupyterbridge-mcp"); err != nil {
		t.Fatalf("updateClaudeConfig failed: %v", err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read config: %v", err)
	}
	text := string(raw)
	if !strings.Contains(text, "\"jupyter-bridge\"") || !strings.Contains(text, "/tmp/jupyterbridge-mcp") {
		t.Fatalf("unexpected claude config contents:\n%s", text)
	}
}
