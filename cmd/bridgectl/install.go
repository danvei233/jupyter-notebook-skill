package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

const defaultSkillName = "jupyter-bridge-notebook"

type installSource struct {
	InputPath          string
	ProjectRoot        string
	SkillSourceDir     string
	ExtensionSourceDir string
	PrebuiltVSIX       string
}

type installSkillOptions struct {
	InputPath     string
	SkillName     string
	SkillDest     string
	ConfigureMCP  string
	CodeCLI       string
	SkipExtension bool
	SkipConfig    bool
	Pretty        bool
}

type configUpdateResult struct {
	Client  string `json:"client"`
	Path    string `json:"path"`
	Updated bool   `json:"updated"`
	Created bool   `json:"created,omitempty"`
}

func currentPlatformTag() string {
	return runtime.GOOS + "-" + runtime.GOARCH
}

func exeSuffix() string {
	if runtime.GOOS == "windows" {
		return ".exe"
	}
	return ""
}

func fileExists(path string) bool {
	if path == "" {
		return false
	}
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func dirExists(path string) bool {
	if path == "" {
		return false
	}
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

func firstExisting(paths ...string) string {
	for _, path := range paths {
		if fileExists(path) {
			return path
		}
	}
	return ""
}

func detectInstallSource(inputPath, skillName string) (installSource, error) {
	absolute, err := filepath.Abs(inputPath)
	if err != nil {
		return installSource{}, err
	}

	source := installSource{InputPath: absolute}
	if dirExists(filepath.Join(absolute, "codex-skill", skillName)) {
		source.ProjectRoot = absolute
		source.SkillSourceDir = filepath.Join(absolute, "codex-skill", skillName)
		source.ExtensionSourceDir = filepath.Join(absolute, "bridge-extension")
		source.PrebuiltVSIX = firstExisting(
			filepath.Join(source.ExtensionSourceDir, "vscode-data-bridge-0.0.1.vsix"),
			filepath.Join(source.SkillSourceDir, "assets", "vscode-data-bridge", "vscode-data-bridge-0.0.1.vsix"),
		)
		return source, nil
	}

	if fileExists(filepath.Join(absolute, "SKILL.md")) {
		source.SkillSourceDir = absolute
		source.ExtensionSourceDir = filepath.Join(absolute, "assets", "vscode-data-bridge")
		source.PrebuiltVSIX = firstExisting(
			filepath.Join(source.ExtensionSourceDir, "vscode-data-bridge-0.0.1.vsix"),
		)

		current := absolute
		for {
			parent := filepath.Dir(current)
			if parent == current {
				break
			}
			if fileExists(filepath.Join(current, "go.mod")) && dirExists(filepath.Join(current, "bridge-extension")) {
				source.ProjectRoot = current
				if !dirExists(source.ExtensionSourceDir) {
					source.ExtensionSourceDir = filepath.Join(current, "bridge-extension")
				}
				break
			}
			current = parent
		}
		return source, nil
	}

	return installSource{}, fmt.Errorf("unable to detect skill/project layout from %s", absolute)
}

func resolveSkillDestination(skillName, explicit string) (string, error) {
	if explicit != "" {
		return filepath.Abs(explicit)
	}
	codexHome := os.Getenv("CODEX_HOME")
	if codexHome == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		codexHome = filepath.Join(home, ".codex")
	}
	return filepath.Join(codexHome, "skills", skillName), nil
}

func removePath(path string) error {
	if path == "" {
		return nil
	}
	if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return os.RemoveAll(path)
}

func copyFileWithMode(src, dst string, mode os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, mode)
	if err != nil {
		return err
	}
	defer out.Close()
	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Close()
}

func copySkillTree(src, dst string) error {
	rootName := filepath.Base(src)
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		if rel == "." {
			return os.MkdirAll(dst, 0o755)
		}
		if info.IsDir() {
			if rel == rootName {
				return filepath.SkipDir
			}
			return os.MkdirAll(filepath.Join(dst, rel), 0o755)
		}

		lowerName := strings.ToLower(info.Name())
		if (strings.Contains(lowerName, "bridgectl") || strings.Contains(lowerName, "jupyterbridge-mcp")) && strings.HasPrefix(rel, "scripts"+string(os.PathSeparator)) {
			return nil
		}
		if strings.HasSuffix(lowerName, ".vsix") && strings.Contains(filepath.ToSlash(rel), "assets/vscode-data-bridge/") {
			return nil
		}
		return copyFileWithMode(path, filepath.Join(dst, rel), info.Mode())
	})
}

func findBundledBinary(skillDir, binaryName string) string {
	platformDir := filepath.Join(skillDir, "bin", currentPlatformTag(), binaryName)
	if fileExists(platformDir) {
		return platformDir
	}
	scriptDir := filepath.Join(skillDir, "scripts", binaryName)
	if fileExists(scriptDir) {
		return scriptDir
	}
	return ""
}

func buildLocalBinary(projectRoot, commandName, destination string) error {
	if projectRoot == "" {
		return fmt.Errorf("project root required to build %s", commandName)
	}
	if err := os.MkdirAll(filepath.Dir(destination), 0o755); err != nil {
		return err
	}
	cmd := exec.Command("go", "build", "-o", destination, "./cmd/"+commandName)
	cmd.Dir = projectRoot
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("go build %s failed: %s", commandName, strings.TrimSpace(string(output)))
	}
	return nil
}

func ensureSkillBinary(source installSource, skillInstallDir, binaryBaseName string) (string, error) {
	targetName := binaryBaseName + exeSuffix()
	targetPath := filepath.Join(skillInstallDir, "scripts", targetName)
	if bundled := findBundledBinary(source.SkillSourceDir, targetName); bundled != "" {
		return targetPath, copyFileWithMode(bundled, targetPath, platformBinaryMode())
	}
	tempDir := filepath.Join(os.TempDir(), "jupyter-bridge-notebook-install", currentPlatformTag())
	sourcePath := filepath.Join(tempDir, targetName)
	if err := buildLocalBinary(source.ProjectRoot, binaryBaseName, sourcePath); err != nil {
		return "", err
	}
	return targetPath, copyFileWithMode(sourcePath, targetPath, platformBinaryMode())
}

func platformBinaryMode() os.FileMode {
	if runtime.GOOS == "windows" {
		return 0o644
	}
	return 0o755
}

func ensureVSIX(source installSource, skillInstallDir string) (string, error) {
	if fileExists(source.PrebuiltVSIX) {
		target := filepath.Join(skillInstallDir, "assets", "vscode-data-bridge", filepath.Base(source.PrebuiltVSIX))
		return target, copyFileWithMode(source.PrebuiltVSIX, target, 0o644)
	}
	if source.ExtensionSourceDir == "" {
		return "", errors.New("unable to locate extension source for VSIX packaging")
	}
	packager, err := exec.LookPath("npx")
	if err != nil {
		if runtime.GOOS == "windows" {
			packager, err = exec.LookPath("npx.cmd")
		}
	}
	if err != nil {
		return "", errors.New("npx is required to package the VS Code extension when no VSIX is bundled")
	}
	cmd := exec.Command(packager, "@vscode/vsce", "package")
	cmd.Dir = source.ExtensionSourceDir
	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("vsce package failed: %s", strings.TrimSpace(string(output)))
	}
	vsixPath := firstExisting(filepath.Join(source.ExtensionSourceDir, "vscode-data-bridge-0.0.1.vsix"))
	if vsixPath == "" {
		return "", errors.New("vsce package did not produce vscode-data-bridge-0.0.1.vsix")
	}
	target := filepath.Join(skillInstallDir, "assets", "vscode-data-bridge", filepath.Base(vsixPath))
	return target, copyFileWithMode(vsixPath, target, 0o644)
}

func defaultCodexConfigPath() (string, bool) {
	codexHome := os.Getenv("CODEX_HOME")
	if codexHome != "" {
		return filepath.Join(codexHome, "config.toml"), true
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", false
	}
	path := filepath.Join(home, ".codex", "config.toml")
	if fileExists(path) || dirExists(filepath.Dir(path)) {
		return path, true
	}
	return path, false
}

func knownClaudeConfigPath() string {
	if runtime.GOOS == "windows" {
		if appData := os.Getenv("APPDATA"); appData != "" {
			return filepath.Join(appData, "Claude", "claude_desktop_config.json")
		}
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	if runtime.GOOS == "darwin" {
		return filepath.Join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")
	}
	return filepath.Join(home, ".config", "Claude", "claude_desktop_config.json")
}

func replaceTOMLSection(content, sectionHeader, replacement string) string {
	lines := strings.Split(content, "\n")
	var out []string
	sectionLine := "[" + sectionHeader + "]"
	i := 0
	for i < len(lines) {
		line := lines[i]
		if strings.TrimSpace(line) == sectionLine {
			i++
			for i < len(lines) {
				trimmed := strings.TrimSpace(lines[i])
				if strings.HasPrefix(trimmed, "[") && strings.HasSuffix(trimmed, "]") {
					break
				}
				i++
			}
			continue
		}
		out = append(out, line)
		i++
	}
	content = strings.TrimRight(strings.Join(out, "\n"), "\n")
	if content != "" {
		content += "\n\n"
	}
	content += replacement + "\n"
	return content
}

func updateCodexConfig(configPath, commandPath string) (configUpdateResult, error) {
	result := configUpdateResult{Client: "codex", Path: configPath}
	existing, err := os.ReadFile(configPath)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return result, err
	}
	result.Created = errors.Is(err, os.ErrNotExist)
	block := fmt.Sprintf("[mcp_servers.jupyter-bridge]\ncommand = '%s'\nenabled = true", filepath.ToSlash(commandPath))
	if runtime.GOOS == "windows" {
		block = fmt.Sprintf("[mcp_servers.jupyter-bridge]\ncommand = '%s'\nenabled = true", commandPath)
	}
	next := replaceTOMLSection(string(existing), "mcp_servers.jupyter-bridge", block)
	if err := os.MkdirAll(filepath.Dir(configPath), 0o755); err != nil {
		return result, err
	}
	if err := os.WriteFile(configPath, []byte(next), 0o644); err != nil {
		return result, err
	}
	result.Updated = true
	return result, nil
}

func updateClaudeConfig(configPath, commandPath string) (configUpdateResult, error) {
	result := configUpdateResult{Client: "claude-desktop", Path: configPath}
	root := map[string]any{}
	raw, err := os.ReadFile(configPath)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return result, err
	}
	result.Created = errors.Is(err, os.ErrNotExist)
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &root); err != nil {
			return result, err
		}
	}
	mcpServers, _ := root["mcpServers"].(map[string]any)
	if mcpServers == nil {
		mcpServers = map[string]any{}
	}
	mcpServers["jupyter-bridge"] = map[string]any{
		"command": commandPath,
		"args":    []string{},
	}
	root["mcpServers"] = mcpServers
	encoded, err := json.MarshalIndent(root, "", "  ")
	if err != nil {
		return result, err
	}
	if err := os.MkdirAll(filepath.Dir(configPath), 0o755); err != nil {
		return result, err
	}
	if err := os.WriteFile(configPath, encoded, 0o644); err != nil {
		return result, err
	}
	result.Updated = true
	return result, nil
}

func configureMCPClients(mode, mcpCommandPath string) ([]configUpdateResult, error) {
	mode = strings.ToLower(strings.TrimSpace(mode))
	if mode == "" {
		mode = "auto"
	}
	if mode == "none" {
		return nil, nil
	}
	var targets []string
	switch mode {
	case "codex", "claude-desktop", "claude":
		targets = []string{mode}
	case "all":
		targets = []string{"codex", "claude-desktop"}
	case "auto":
		if codexPath, ok := defaultCodexConfigPath(); ok {
			_ = codexPath
			targets = append(targets, "codex")
		}
		claudePath := knownClaudeConfigPath()
		if fileExists(claudePath) || dirExists(filepath.Dir(claudePath)) {
			targets = append(targets, "claude-desktop")
		}
		if len(targets) == 0 {
			targets = append(targets, "codex")
		}
	default:
		return nil, fmt.Errorf("unsupported configure-mcp mode: %s", mode)
	}

	var results []configUpdateResult
	for _, target := range targets {
		switch target {
		case "codex":
			configPath, _ := defaultCodexConfigPath()
			update, err := updateCodexConfig(configPath, mcpCommandPath)
			if err != nil {
				return results, err
			}
			results = append(results, update)
		case "claude", "claude-desktop":
			configPath := knownClaudeConfigPath()
			update, err := updateClaudeConfig(configPath, mcpCommandPath)
			if err != nil {
				return results, err
			}
			results = append(results, update)
		}
	}
	return results, nil
}

func installSkillBundle(options installSkillOptions) error {
	skillName := options.SkillName
	if skillName == "" {
		skillName = defaultSkillName
	}
	source, err := detectInstallSource(options.InputPath, skillName)
	if err != nil {
		return err
	}
	installDir, err := resolveSkillDestination(skillName, options.SkillDest)
	if err != nil {
		return err
	}

	if err := removePath(installDir); err != nil {
		return err
	}
	if err := copySkillTree(source.SkillSourceDir, installDir); err != nil {
		return err
	}

	bridgectlPath, err := ensureSkillBinary(source, installDir, "bridgectl")
	if err != nil {
		return err
	}
	mcpPath, err := ensureSkillBinary(source, installDir, "jupyterbridge-mcp")
	if err != nil {
		return err
	}

	vsixPath, err := ensureVSIX(source, installDir)
	if err != nil {
		return err
	}

	var extensionInstall map[string]any
	if !options.SkipExtension {
		codeCLI, err := resolveCodeCLI(options.CodeCLI)
		if err != nil {
			return err
		}
		output, err := runCodeCLI(codeCLI, "--install-extension", vsixPath, "--force")
		if err != nil {
			return err
		}
		extensionInstall = map[string]any{
			"codeCli":  codeCLI,
			"vsixPath": vsixPath,
			"output":   strings.TrimSpace(string(output)),
		}
	}

	var configUpdates []configUpdateResult
	if !options.SkipConfig {
		configUpdates, err = configureMCPClients(options.ConfigureMCP, mcpPath)
		if err != nil {
			return err
		}
	}

	writeJSON(map[string]any{
		"ok":         true,
		"operation":  "install-skill",
		"source":     source.InputPath,
		"skillName":  skillName,
		"skillPath":  installDir,
		"platform":   currentPlatformTag(),
		"scripts":    map[string]any{"bridgectl": bridgectlPath, "mcp": mcpPath},
		"extension":  extensionInstall,
		"mcpConfigs": configUpdates,
	}, options.Pretty)
	return nil
}
