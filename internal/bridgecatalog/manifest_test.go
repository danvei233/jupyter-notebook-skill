package bridgecatalog

import "testing"

func TestLoadManifestHasCoreRoutes(t *testing.T) {
	manifest, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if manifest.Version == "" {
		t.Fatal("manifest version should not be empty")
	}

	required := map[string]bool{
		"bridge_get_status_brief":             false,
		"bridge_get_output_summary":           false,
		"bridge_post_cell_batch":              false,
		"bridge_post_workflow_update_and_run": false,
		"bridge_post_workflow_insert_and_run": false,
		"bridge_post_kernel_shutdown":         false,
	}

	for _, route := range manifest.Routes {
		if _, ok := required[route.Tool]; ok {
			required[route.Tool] = true
		}
	}

	for tool, seen := range required {
		if !seen {
			t.Fatalf("expected manifest to include tool %q", tool)
		}
	}
}
