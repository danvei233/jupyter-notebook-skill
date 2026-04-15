package bridgecatalog

import (
	"os"
	"path/filepath"
	"regexp"
	"testing"
)

func TestManifestMatchesExtensionRoutes(t *testing.T) {
	manifest, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	manifestRoutes := make(map[string]bool)
	for _, route := range manifest.Routes {
		manifestRoutes[route.Path] = true
	}

	extensionPath := filepath.Join("..", "..", "bridge-extension", "extension.js")
	raw, err := os.ReadFile(extensionPath)
	if err != nil {
		t.Fatalf("read extension.js: %v", err)
	}

	re := regexp.MustCompile(`case "(/[^"]+)"`)
	matches := re.FindAllStringSubmatch(string(raw), -1)
	if len(matches) == 0 {
		t.Fatal("no route cases found in extension.js")
	}

	extensionRoutes := make(map[string]bool)
	for _, match := range matches {
		extensionRoutes[match[1]] = true
	}

	for path := range manifestRoutes {
		if !extensionRoutes[path] {
			t.Fatalf("manifest route %q not found in extension.js", path)
		}
	}

	for path := range extensionRoutes {
		if !manifestRoutes[path] {
			t.Fatalf("extension route %q missing from manifest", path)
		}
	}
}
