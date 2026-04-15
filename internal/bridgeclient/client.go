package bridgeclient

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

var utf8BOM = []byte{0xEF, 0xBB, 0xBF}

type StatusEnvelope struct {
	OK       bool `json:"ok"`
	Notebook struct {
		HasActiveNotebook bool   `json:"hasActiveNotebook"`
		URI               string `json:"uri"`
	} `json:"notebook"`
	Window struct {
		WorkspaceName     string   `json:"workspaceName"`
		RootPaths         []string `json:"rootPaths"`
		RootURIs          []string `json:"rootUris"`
		ActiveNotebookURI string   `json:"activeNotebookUri"`
		HasActiveNotebook bool     `json:"hasActiveNotebook"`
	} `json:"window"`
	Server struct {
		Host     string `json:"host"`
		Port     int    `json:"port"`
		BasePort int    `json:"basePort"`
		PortSpan int    `json:"portSpan"`
		BaseURL  string `json:"baseUrl"`
	} `json:"server"`
	Status map[string]any `json:"status"`
}

type BridgeCache struct {
	BaseURL       string   `json:"baseUrl"`
	NotebookURI   string   `json:"notebookUri,omitempty"`
	WorkspaceName string   `json:"workspaceName,omitempty"`
	RootPaths     []string `json:"rootPaths,omitempty"`
	CheckedAt     string   `json:"checkedAt"`
}

type candidate struct {
	BaseURL string
	Score   int
	Status  StatusEnvelope
}

type ResolutionResult struct {
	BaseURL   string
	UsedCache bool
	Source    string
	Status    *StatusEnvelope
}

type Config struct {
	PreferredBaseURL string
	Token            string
	CWD              string
	Timeout          time.Duration
}

type Client struct {
	config     Config
	httpClient *http.Client
}

type Response struct {
	BaseURL    string
	StatusCode int
	UsedCache  bool
	RawBody    []byte
	JSONBody   any
}

func New(config Config) *Client {
	timeout := config.Timeout
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	return &Client{
		config: config,
		httpClient: &http.Client{
			Timeout: timeout,
		},
	}
}

func (c *Client) Resolve(ctx context.Context, skipCache bool) (ResolutionResult, error) {
	return resolveBaseURL(ctx, c.httpClient, c.config.PreferredBaseURL, effectiveCWD(c.config.CWD), c.config.Token, skipCache)
}

func (c *Client) Request(ctx context.Context, method, route string, rawBody []byte) (*Response, error) {
	if route == "" {
		return nil, errors.New("route is required")
	}
	if strings.HasPrefix(route, "http://") || strings.HasPrefix(route, "https://") {
		return c.doRequest(ctx, method, route, rawBody, ResolutionResult{BaseURL: route, Source: "absolute"})
	}

	resolution, err := c.Resolve(ctx, false)
	if err != nil {
		return nil, err
	}

	targetURL := strings.TrimRight(resolution.BaseURL, "/") + route
	response, err := c.doRequest(ctx, method, targetURL, rawBody, resolution)
	if err == nil {
		return response, nil
	}
	if !resolution.UsedCache {
		return nil, err
	}

	removeBridgeCache(effectiveCWD(c.config.CWD))
	retriedResolution, resolveErr := c.Resolve(ctx, true)
	if resolveErr != nil {
		return nil, err
	}
	targetURL = strings.TrimRight(retriedResolution.BaseURL, "/") + route
	return c.doRequest(ctx, method, targetURL, rawBody, retriedResolution)
}

func (c *Client) doRequest(ctx context.Context, method, targetURL string, rawBody []byte, resolution ResolutionResult) (*Response, error) {
	req, err := buildRequest(ctx, strings.ToUpper(method), targetURL, c.config.Token, rawBody)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	result := &Response{
		BaseURL:    resolution.BaseURL,
		StatusCode: resp.StatusCode,
		UsedCache:  resolution.UsedCache,
		RawBody:    body,
	}
	if len(body) > 0 {
		var decoded any
		if err := json.Unmarshal(body, &decoded); err == nil {
			result.JSONBody = decoded
		}
	}
	return result, nil
}

func NormalizeJSONPayload(raw []byte) ([]byte, error) {
	normalized := bytes.TrimSpace(stripUTF8BOM(raw))
	if len(normalized) == 0 {
		return []byte("{}"), nil
	}
	var value any
	if err := json.Unmarshal(normalized, &value); err != nil {
		return nil, err
	}
	return json.Marshal(value)
}

func ReadBody(bodyJSON, bodyFile, command string, args []string) ([]byte, error) {
	switch {
	case bodyJSON != "":
		return NormalizeJSONPayload([]byte(bodyJSON))
	case bodyFile != "":
		raw, err := os.ReadFile(bodyFile)
		if err != nil {
			return nil, err
		}
		return NormalizeJSONPayload(raw)
	case command != "":
		payload := map[string]any{
			"command": command,
			"args":    args,
		}
		return json.Marshal(payload)
	default:
		return []byte("{}"), nil
	}
}

func stripUTF8BOM(raw []byte) []byte {
	return bytes.TrimPrefix(raw, utf8BOM)
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

func envOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func envInt(keys []string, fallback int) int {
	for _, key := range keys {
		if value := os.Getenv(key); value != "" {
			if parsed, err := strconv.Atoi(value); err == nil {
				return parsed
			}
		}
	}
	return fallback
}

func fileURIToPath(raw string) string {
	if raw == "" {
		return ""
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "file" {
		return ""
	}
	path, err := url.PathUnescape(parsed.Path)
	if err != nil {
		path = parsed.Path
	}
	if len(path) >= 3 && path[0] == '/' && path[2] == ':' {
		path = path[1:]
	}
	return filepath.Clean(filepath.FromSlash(path))
}

func matchScore(status StatusEnvelope, cwd string) int {
	score := 1
	notebookPath := fileURIToPath(status.Notebook.URI)
	if status.Notebook.HasActiveNotebook {
		score += 10
	}
	if notebookPath != "" {
		if strings.HasPrefix(strings.ToLower(notebookPath), strings.ToLower(cwd)) {
			score += 100
		} else {
			notebookDir := filepath.Dir(notebookPath)
			if strings.HasPrefix(strings.ToLower(cwd), strings.ToLower(notebookDir)) {
				score += 80
			}
		}
	}
	for _, root := range status.Window.RootPaths {
		root = filepath.Clean(root)
		if strings.HasPrefix(strings.ToLower(cwd), strings.ToLower(root)) || strings.HasPrefix(strings.ToLower(root), strings.ToLower(cwd)) {
			score += 50
		}
	}
	return score
}

func fetchStatus(ctx context.Context, client *http.Client, baseURL, token string) (StatusEnvelope, error) {
	var envelope StatusEnvelope
	for _, path := range []string{"/status/brief", "/status"} {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(baseURL, "/")+path, nil)
		if err != nil {
			return envelope, err
		}
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		resp, err := client.Do(req)
		if err != nil {
			return envelope, err
		}
		func() {
			defer resp.Body.Close()
			if resp.StatusCode == http.StatusNotFound && path == "/status/brief" {
				return
			}
			if resp.StatusCode >= 300 {
				err = fmt.Errorf("status probe failed: %s", resp.Status)
				return
			}
			err = json.NewDecoder(resp.Body).Decode(&envelope)
		}()
		if err != nil {
			if resp != nil && resp.StatusCode == http.StatusNotFound && path == "/status/brief" {
				err = nil
				continue
			}
			return envelope, err
		}
		if envelope.OK || path == "/status" {
			return envelope, nil
		}
	}
	return envelope, errors.New("status probe failed")
}

func bridgeCachePath(cwd string) string {
	return filepath.Join(cwd, "tmp", "bridge", "cache.json")
}

func readBridgeCache(cwd string) (*BridgeCache, error) {
	raw, err := os.ReadFile(bridgeCachePath(cwd))
	if err != nil {
		return nil, err
	}
	var cache BridgeCache
	if err := json.Unmarshal(raw, &cache); err != nil {
		return nil, err
	}
	return &cache, nil
}

func removeBridgeCache(cwd string) {
	_ = os.Remove(bridgeCachePath(cwd))
}

func writeBridgeCache(cwd, baseURL string, status StatusEnvelope) {
	cacheDir := filepath.Dir(bridgeCachePath(cwd))
	if err := os.MkdirAll(cacheDir, 0o755); err != nil {
		return
	}
	cache := BridgeCache{
		BaseURL:       baseURL,
		NotebookURI:   status.Notebook.URI,
		WorkspaceName: status.Window.WorkspaceName,
		RootPaths:     status.Window.RootPaths,
		CheckedAt:     time.Now().UTC().Format(time.RFC3339Nano),
	}
	raw, err := json.Marshal(cache)
	if err != nil {
		return
	}
	_ = os.WriteFile(bridgeCachePath(cwd), raw, 0o644)
}

func cacheFresh(cache *BridgeCache, ttl time.Duration) bool {
	if cache == nil || cache.CheckedAt == "" {
		return false
	}
	checkedAt, err := time.Parse(time.RFC3339Nano, cache.CheckedAt)
	if err != nil {
		return false
	}
	return time.Since(checkedAt) <= ttl
}

func resolveBaseURL(ctx context.Context, client *http.Client, preferred, cwd, token string, skipCache bool) (ResolutionResult, error) {
	var result ResolutionResult
	if preferred != "" {
		result.BaseURL = preferred
		result.Source = "preferred"
		if status, err := fetchStatus(ctx, client, preferred, token); err == nil {
			result.Status = &status
		}
		return result, nil
	}
	if value := os.Getenv("DATA_BRIDGE_BASE_URL"); value != "" {
		result.BaseURL = value
		result.Source = "env"
		if status, err := fetchStatus(ctx, client, value, token); err == nil {
			result.Status = &status
		}
		return result, nil
	}
	if value := os.Getenv("VSCODE_DATA_BRIDGE_BASE_URL"); value != "" {
		result.BaseURL = value
		result.Source = "env"
		if status, err := fetchStatus(ctx, client, value, token); err == nil {
			result.Status = &status
		}
		return result, nil
	}

	host := envOrDefault("DATA_BRIDGE_HOST", envOrDefault("VSCODE_DATA_BRIDGE_HOST", "127.0.0.1"))
	basePort := envInt([]string{"DATA_BRIDGE_PORT", "VSCODE_DATA_BRIDGE_PORT"}, 8765)
	portSpan := envInt([]string{"DATA_BRIDGE_PORT_SPAN", "VSCODE_DATA_BRIDGE_PORT_SPAN"}, 20)

	if !skipCache {
		cache, err := readBridgeCache(cwd)
		if err == nil && cacheFresh(cache, 10*time.Second) {
			status, probeErr := fetchStatus(ctx, client, cache.BaseURL, token)
			if probeErr == nil && matchScore(status, cwd) > 1 {
				writeBridgeCache(cwd, cache.BaseURL, status)
				result.BaseURL = cache.BaseURL
				result.UsedCache = true
				result.Source = "cache"
				result.Status = &status
				return result, nil
			}
			removeBridgeCache(cwd)
		}
	}

	var candidates []candidate
	for offset := 0; offset < portSpan; offset++ {
		baseURL := fmt.Sprintf("http://%s:%d", host, basePort+offset)
		status, err := fetchStatus(ctx, client, baseURL, token)
		if err != nil {
			continue
		}
		candidates = append(candidates, candidate{
			BaseURL: baseURL,
			Score:   matchScore(status, cwd),
			Status:  status,
		})
	}

	if len(candidates) == 0 {
		result.BaseURL = fmt.Sprintf("http://%s:%d", host, basePort)
		result.Source = "fallback"
		return result, nil
	}

	sort.SliceStable(candidates, func(i, j int) bool {
		if candidates[i].Score == candidates[j].Score {
			return candidates[i].BaseURL < candidates[j].BaseURL
		}
		return candidates[i].Score > candidates[j].Score
	})

	writeBridgeCache(cwd, candidates[0].BaseURL, candidates[0].Status)
	result.BaseURL = candidates[0].BaseURL
	result.Source = "probe"
	result.Status = &candidates[0].Status
	return result, nil
}

func buildRequest(ctx context.Context, method, targetURL, token string, rawBody []byte) (*http.Request, error) {
	var body io.Reader
	if len(rawBody) > 0 {
		body = bytes.NewReader(rawBody)
	}
	req, err := http.NewRequestWithContext(ctx, method, targetURL, body)
	if err != nil {
		return nil, err
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if len(rawBody) > 0 {
		req.Header.Set("Content-Type", "application/json")
	}
	return req, nil
}
