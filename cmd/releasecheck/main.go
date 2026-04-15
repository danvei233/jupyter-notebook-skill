package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

type releaseManifest struct {
	Version       string   `json:"version"`
	RequiredFiles []string `json:"requiredFiles"`
}

func main() {
	root := "."
	if len(os.Args) > 1 && os.Args[1] != "" {
		root = os.Args[1]
	}

	absoluteRoot, err := filepath.Abs(root)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	manifestPath := filepath.Join(absoluteRoot, "release-manifest.json")
	raw, err := os.ReadFile(manifestPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "read manifest: %v\n", err)
		os.Exit(1)
	}

	var manifest releaseManifest
	if err := json.Unmarshal(raw, &manifest); err != nil {
		fmt.Fprintf(os.Stderr, "parse manifest: %v\n", err)
		os.Exit(1)
	}

	missing := make([]string, 0)
	for _, rel := range manifest.RequiredFiles {
		target := filepath.Join(absoluteRoot, filepath.FromSlash(rel))
		info, err := os.Stat(target)
		if err != nil || info.IsDir() {
			missing = append(missing, rel)
		}
	}

	if len(missing) > 0 {
		result := map[string]any{
			"ok":      false,
			"version": manifest.Version,
			"root":    absoluteRoot,
			"missing": missing,
		}
		encoded, _ := json.MarshalIndent(result, "", "  ")
		fmt.Println(string(encoded))
		os.Exit(1)
	}

	result := map[string]any{
		"ok":           true,
		"version":      manifest.Version,
		"root":         absoluteRoot,
		"checkedFiles": len(manifest.RequiredFiles),
	}
	encoded, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(encoded))
}
