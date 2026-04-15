package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"jupyter-bridge-notebook-project/internal/bridgeclient"
)

type stringSliceFlag []string

func (s *stringSliceFlag) String() string {
	return strings.Join(*s, ",")
}

func (s *stringSliceFlag) Set(value string) error {
	*s = append(*s, value)
	return nil
}

func looksLikePath(value string) bool {
	return strings.ContainsAny(value, `\/:`)
}

func resolveCodeCLI(explicit string) (string, error) {
	var candidates []string
	for _, value := range []string{
		explicit,
		os.Getenv("VSCODE_CLI"),
		os.Getenv("CODE_CLI"),
		"code-insiders",
		"code",
	} {
		if value != "" {
			candidates = append(candidates, value)
		}
	}

	seen := make(map[string]bool)
	for _, candidate := range candidates {
		if seen[candidate] {
			continue
		}
		seen[candidate] = true
		if looksLikePath(candidate) {
			if _, err := os.Stat(candidate); err == nil {
				absolute, absErr := filepath.Abs(candidate)
				if absErr == nil {
					return absolute, nil
				}
				return candidate, nil
			}
			continue
		}
		resolved, err := exec.LookPath(candidate)
		if err == nil {
			return resolved, nil
		}
	}

	return "", errors.New("unable to find VS Code CLI; set VSCODE_CLI or CODE_CLI, or add code/code-insiders to PATH")
}

func runCodeCLI(codeCLI string, args ...string) ([]byte, error) {
	cmd := exec.Command(codeCLI, args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		message := strings.TrimSpace(string(output))
		if message == "" {
			message = err.Error()
		}
		return output, fmt.Errorf("%s %s failed: %s", codeCLI, strings.Join(args, " "), message)
	}
	return output, nil
}

func checkExtensionInstalled(codeCLI, extensionID string) (bool, []string, error) {
	output, err := runCodeCLI(codeCLI, "--list-extensions", "--show-versions")
	if err != nil {
		return false, nil, err
	}

	var matches []string
	for _, line := range strings.Split(string(output), "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		if trimmed == extensionID || strings.HasPrefix(trimmed, extensionID+"@") {
			matches = append(matches, trimmed)
		}
	}
	return len(matches) > 0, matches, nil
}

func writeJSON(value any, pretty bool) {
	var raw []byte
	var err error
	if pretty {
		raw, err = json.MarshalIndent(value, "", "  ")
	} else {
		raw, err = json.Marshal(value)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Println(string(raw))
}

func main() {
	method := flag.String("method", "GET", "HTTP method")
	path := flag.String("path", "/status", "Bridge path such as /status")
	baseURL := flag.String("base-url", "", "Explicit bridge base URL")
	token := flag.String("token", "", "Bearer token")
	bodyJSON := flag.String("body", "", "JSON body string")
	bodyFile := flag.String("body-file", "", "Path to a JSON body file")
	command := flag.String("command", "", "Bridge execute command id")
	cwdFlag := flag.String("cwd", "", "Directory used for bridge auto-discovery")
	timeout := flag.Duration("timeout", 5*time.Second, "Request timeout")
	pretty := flag.Bool("pretty", true, "Pretty-print JSON output")
	codeCLIFlag := flag.String("code-cli", "", "Explicit VS Code CLI executable")
	extensionID := flag.String("extension-id", "local.vscode-data-bridge", "Extension id used with -check-extension")
	checkExtension := flag.Bool("check-extension", false, "Check whether an extension is installed via the VS Code CLI")
	installExtension := flag.String("install-extension", "", "Install a VSIX file via the VS Code CLI")
	var cmdArgs stringSliceFlag
	flag.Var(&cmdArgs, "arg", "Command arg used with -command; may be repeated")
	flag.Parse()

	if *checkExtension || *installExtension != "" {
		codeCLI, err := resolveCodeCLI(*codeCLIFlag)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}

		if *checkExtension {
			installed, matches, err := checkExtensionInstalled(codeCLI, *extensionID)
			if err != nil {
				fmt.Fprintln(os.Stderr, err)
				os.Exit(1)
			}
			writeJSON(map[string]any{
				"ok":          true,
				"operation":   "check-extension",
				"codeCli":     codeCLI,
				"extensionId": *extensionID,
				"installed":   installed,
				"matches":     matches,
			}, *pretty)
			return
		}

		vsixPath, err := filepath.Abs(*installExtension)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		if _, err := os.Stat(vsixPath); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}

		output, err := runCodeCLI(codeCLI, "--install-extension", vsixPath, "--force")
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}

		writeJSON(map[string]any{
			"ok":        true,
			"operation": "install-extension",
			"codeCli":   codeCLI,
			"vsixPath":  vsixPath,
			"output":    strings.TrimSpace(string(output)),
		}, *pretty)
		return
	}

	rawBody, err := bridgeclient.ReadBody(*bodyJSON, *bodyFile, *command, cmdArgs)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if strings.ToUpper(*method) == "GET" {
		rawBody = nil
	}

	client := bridgeclient.New(bridgeclient.Config{
		PreferredBaseURL: *baseURL,
		Token:            *token,
		CWD:              *cwdFlag,
		Timeout:          *timeout,
	})
	ctx, cancel := context.WithTimeout(context.Background(), *timeout)
	defer cancel()

	response, err := client.Request(ctx, *method, *path, rawBody)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	if len(response.RawBody) == 0 {
		if response.StatusCode >= 300 {
			fmt.Fprintln(os.Stderr, errors.New(httpStatusText(response.StatusCode)))
			os.Exit(1)
		}
		return
	}

	if *pretty && response.JSONBody != nil {
		prettyJSON, _ := json.MarshalIndent(response.JSONBody, "", "  ")
		fmt.Println(string(prettyJSON))
	} else {
		fmt.Println(string(response.RawBody))
	}

	if response.StatusCode >= 300 {
		os.Exit(1)
	}
}

func httpStatusText(code int) string {
	switch code {
	case 400:
		return "400 Bad Request"
	case 401:
		return "401 Unauthorized"
	case 404:
		return "404 Not Found"
	case 405:
		return "405 Method Not Allowed"
	case 500:
		return "500 Internal Server Error"
	default:
		return fmt.Sprintf("HTTP %d", code)
	}
}
