package mcpbridge

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"jupyter-bridge-notebook-project/internal/bridgecatalog"
	"jupyter-bridge-notebook-project/internal/bridgeclient"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type Options struct {
	CWD              string
	Token            string
	PreferredBaseURL string
	Timeout          time.Duration
}

type Server struct {
	options Options

	mu              sync.RWMutex
	overrideBaseURL string
}

type activeServerOutput struct {
	Mode            string                `json:"mode"`
	OverrideBaseURL string                `json:"overrideBaseUrl,omitempty"`
	Resolved        *bridgeclientResponse `json:"resolved,omitempty"`
}

type bridgeclientResponse struct {
	BaseURL   string                       `json:"baseUrl"`
	Source    string                       `json:"source"`
	UsedCache bool                         `json:"usedCache,omitempty"`
	Status    *bridgeclient.StatusEnvelope `json:"status,omitempty"`
}

type serverOverrideInput struct {
	BaseURL  string `json:"baseUrl,omitempty" jsonschema:"explicit bridge server base URL such as http://127.0.0.1:8765"`
	ServerID string `json:"serverId,omitempty" jsonschema:"server identifier from bridge_list_servers; defaults to baseUrl"`
}

func NewServer(options Options) (*mcp.Server, error) {
	manifest, err := bridgecatalog.Load()
	if err != nil {
		return nil, err
	}

	state := &Server{
		options: Options{
			CWD:              effectiveCWD(options.CWD),
			Token:            options.Token,
			PreferredBaseURL: options.PreferredBaseURL,
			Timeout:          defaultTimeout(options.Timeout),
		},
	}

	server := mcp.NewServer(&mcp.Implementation{
		Name:    "jupyter-bridge-mcp",
		Version: "0.1.0",
	}, nil)

	state.registerServerTools(server)

	registered := make(map[string]bool)
	for _, route := range manifest.Routes {
		if registered[route.Tool] {
			continue
		}
		registered[route.Tool] = true
		switch route.InputKind {
		case "none":
			state.registerNoArgRoute(server, route)
		case "query":
			state.registerQueryRoute(server, route)
		case "body":
			state.registerBodyRoute(server, route)
		}
	}

	return server, nil
}

func RunStdio(ctx context.Context, options Options) error {
	server, err := NewServer(options)
	if err != nil {
		return err
	}
	return server.Run(ctx, &mcp.StdioTransport{})
}

func (s *Server) registerServerTools(server *mcp.Server) {
	mcp.AddTool(server, &mcp.Tool{
		Name:        "bridge_list_servers",
		Description: "List bridge servers when multiple VS Code windows or bridge instances may be available. Use this to inspect candidate servers, active notebooks, and workspaces before pinning a specific target. Do not call it during every routine notebook action when the automatically matched server is already correct.",
	}, func(ctx context.Context, req *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, map[string]any, error) {
		output, isError := s.listServers(ctx)
		return mcpResult(output, isError), output, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "bridge_get_active_server",
		Description: "Return the bridge server currently selected for this MCP session. Use this when you need to confirm whether the session is still in automatic mode or is pinned to a specific override. This is mainly useful for server routing clarity, not as a required preflight before every notebook action.",
	}, func(ctx context.Context, req *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, activeServerOutput, error) {
		output, isError := s.getActiveServer(ctx)
		return mcpResult(output, isError), output, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "bridge_set_active_server",
		Description: "Pin the MCP session to a specific bridge server when automatic matching is ambiguous or wrong. Pass either a baseUrl or a serverId returned by bridge_list_servers. Keep the override only as long as needed, then clear it to restore automatic best-match selection.",
	}, func(ctx context.Context, req *mcp.CallToolRequest, input serverOverrideInput) (*mcp.CallToolResult, activeServerOutput, error) {
		baseURL := strings.TrimSpace(input.BaseURL)
		if baseURL == "" {
			baseURL = strings.TrimSpace(input.ServerID)
		}
		if baseURL == "" {
			output := activeServerOutput{
				Mode: "override",
			}
			return mcpResult(map[string]any{
				"ok":    false,
				"error": "baseUrl or serverId is required",
			}, true), output, nil
		}
		s.mu.Lock()
		s.overrideBaseURL = baseURL
		s.mu.Unlock()
		output, isError := s.getActiveServer(ctx)
		return mcpResult(output, isError), output, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "bridge_clear_active_server",
		Description: "Clear any explicit server override and return this MCP session to automatic bridge selection. Use this after a temporary pin once the ambiguity is gone. There is no need to call it if the session was never overridden.",
	}, func(ctx context.Context, req *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, activeServerOutput, error) {
		s.mu.Lock()
		s.overrideBaseURL = ""
		s.mu.Unlock()
		output, isError := s.getActiveServer(ctx)
		return mcpResult(output, isError), output, nil
	})
}

func (s *Server) registerNoArgRoute(server *mcp.Server, route bridgecatalog.RouteCapability) {
	mcp.AddTool(server, &mcp.Tool{
		Name:        route.Tool,
		Description: route.Description,
	}, func(ctx context.Context, req *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, map[string]any, error) {
		output, isError := s.callRoute(ctx, route.Method, route.Path, nil, false)
		return mcpResult(output, isError), output, nil
	})
}

func (s *Server) registerQueryRoute(server *mcp.Server, route bridgecatalog.RouteCapability) {
	mcp.AddTool(server, &mcp.Tool{
		Name:        route.Tool,
		Description: route.Description,
	}, func(ctx context.Context, req *mcp.CallToolRequest, input map[string]any) (*mcp.CallToolResult, map[string]any, error) {
		output, isError := s.callRoute(ctx, route.Method, route.Path, input, true)
		return mcpResult(output, isError), output, nil
	})
}

func (s *Server) registerBodyRoute(server *mcp.Server, route bridgecatalog.RouteCapability) {
	mcp.AddTool(server, &mcp.Tool{
		Name:        route.Tool,
		Description: route.Description,
	}, func(ctx context.Context, req *mcp.CallToolRequest, input map[string]any) (*mcp.CallToolResult, map[string]any, error) {
		output, isError := s.callRoute(ctx, route.Method, route.Path, input, false)
		return mcpResult(output, isError), output, nil
	})
}

func (s *Server) callRoute(ctx context.Context, method, path string, input map[string]any, asQuery bool) (map[string]any, bool) {
	client := s.newClient()
	route := path
	var body []byte
	if asQuery {
		route = buildQueryPath(path, input)
	} else if len(input) > 0 {
		raw, err := json.Marshal(cleanMap(input))
		if err != nil {
			return transportErrorOutput(err), true
		}
		body = raw
	}

	response, err := client.Request(ctx, method, route, body)
	if err != nil {
		return transportErrorOutput(err), true
	}
	if bodyMap, ok := response.JSONBody.(map[string]any); ok {
		return bodyMap, hasToolError(response.StatusCode, response.JSONBody)
	}
	return map[string]any{
		"ok":         response.StatusCode < 400,
		"httpStatus": response.StatusCode,
		"body":       response.JSONBody,
	}, hasToolError(response.StatusCode, response.JSONBody)
}

func (s *Server) listServers(ctx context.Context) (map[string]any, bool) {
	output, isError := s.callRoute(ctx, "GET", "/servers", nil, false)
	if isError {
		return map[string]any{
			"ok":    false,
			"error": output,
		}, true
	}

	servers, _ := output["servers"].([]any)
	normalized := make([]map[string]any, 0, len(servers))
	for _, item := range servers {
		serverMap, ok := item.(map[string]any)
		if !ok {
			continue
		}
		entry := make(map[string]any, len(serverMap)+1)
		for key, value := range serverMap {
			entry[key] = value
		}
		if baseURL, ok := entry["baseUrl"].(string); ok && baseURL != "" {
			entry["serverId"] = baseURL
		}
		normalized = append(normalized, entry)
	}

	return map[string]any{
		"ok":          true,
		"serverIdKey": "baseUrl",
		"servers":     normalized,
	}, false
}

func (s *Server) getActiveServer(ctx context.Context) (activeServerOutput, bool) {
	client := s.newClient()
	resolution, err := client.Resolve(ctx, false)
	if err != nil {
		return activeServerOutput{
			Mode:            s.currentMode(),
			OverrideBaseURL: s.override(),
		}, true
	}

	return activeServerOutput{
		Mode:            s.currentMode(),
		OverrideBaseURL: s.override(),
		Resolved: &bridgeclientResponse{
			BaseURL:   resolution.BaseURL,
			Source:    resolution.Source,
			UsedCache: resolution.UsedCache,
			Status:    resolution.Status,
		},
	}, false
}

func (s *Server) newClient() *bridgeclient.Client {
	return bridgeclient.New(bridgeclient.Config{
		PreferredBaseURL: s.preferredBaseURL(),
		Token:            s.options.Token,
		CWD:              s.options.CWD,
		Timeout:          s.options.Timeout,
	})
}

func (s *Server) preferredBaseURL() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.overrideBaseURL != "" {
		return s.overrideBaseURL
	}
	return s.options.PreferredBaseURL
}

func (s *Server) currentMode() string {
	if s.override() != "" {
		return "override"
	}
	return "auto"
}

func (s *Server) override() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.overrideBaseURL
}

func buildQueryPath(path string, input map[string]any) string {
	if len(input) == 0 {
		return path
	}
	values := url.Values{}
	for key, value := range cleanMap(input) {
		switch typed := value.(type) {
		case []any:
			for _, item := range typed {
				values.Add(key, fmt.Sprint(item))
			}
		case []string:
			for _, item := range typed {
				values.Add(key, item)
			}
		default:
			values.Set(key, fmt.Sprint(value))
		}
	}
	encoded := values.Encode()
	if encoded == "" {
		return path
	}
	return path + "?" + encoded
}

func cleanMap(input map[string]any) map[string]any {
	if len(input) == 0 {
		return map[string]any{}
	}
	cleaned := make(map[string]any, len(input))
	for key, value := range input {
		if value == nil {
			continue
		}
		switch typed := value.(type) {
		case string:
			if strings.TrimSpace(typed) == "" {
				continue
			}
		case []any:
			if len(typed) == 0 {
				continue
			}
		case []string:
			if len(typed) == 0 {
				continue
			}
		case map[string]any:
			if len(typed) == 0 {
				continue
			}
		}
		cleaned[key] = value
	}
	return cleaned
}

func hasToolError(statusCode int, body any) bool {
	if statusCode >= 400 {
		return true
	}
	object, ok := body.(map[string]any)
	if !ok {
		return false
	}
	if okValue, exists := object["ok"].(bool); exists {
		return !okValue
	}
	return false
}

func transportErrorOutput(err error) map[string]any {
	return map[string]any{
		"ok":    false,
		"error": err.Error(),
	}
}

func mcpResult(output any, isError bool) *mcp.CallToolResult {
	raw, err := json.MarshalIndent(output, "", "  ")
	text := "{}"
	if err == nil {
		text = string(raw)
	} else {
		text = err.Error()
		isError = true
	}
	return &mcp.CallToolResult{
		IsError: isError,
		Content: []mcp.Content{
			&mcp.TextContent{Text: text},
		},
	}
}

func defaultTimeout(timeout time.Duration) time.Duration {
	if timeout <= 0 {
		return 5 * time.Second
	}
	return timeout
}

func effectiveCWD(cwd string) string {
	if cwd != "" {
		absolute, err := filepath.Abs(cwd)
		if err == nil {
			return absolute
		}
		return cwd
	}
	current, err := os.Getwd()
	if err != nil {
		return "."
	}
	absolute, err := filepath.Abs(current)
	if err == nil {
		return absolute
	}
	return current
}
