package bridgecatalog

import (
	_ "embed"
	"encoding/json"
)

//go:embed capabilities.json
var capabilitiesJSON []byte

type RouteCapability struct {
	Tool        string `json:"tool"`
	Method      string `json:"method"`
	Path        string `json:"path"`
	Status      string `json:"status"`
	Description string `json:"description"`
	InputKind   string `json:"inputKind"`
}

type MCPToolCapability struct {
	Tool        string `json:"tool"`
	Status      string `json:"status"`
	Description string `json:"description"`
	InputKind   string `json:"inputKind"`
}

type Manifest struct {
	Version  string              `json:"version"`
	Routes   []RouteCapability   `json:"routes"`
	MCPTools []MCPToolCapability `json:"mcpTools"`
}

func Load() (Manifest, error) {
	var manifest Manifest
	err := json.Unmarshal(capabilitiesJSON, &manifest)
	return manifest, err
}
