"use strict";

const http = require("http");
const vscode = require("vscode");

const QUICK_COMMANDS = [
  "notebook.cell.execute",
  "notebook.cell.executeAndSelectBelow",
  "notebook.cell.executeCellsAbove",
  "notebook.cell.executeCellAndBelow",
  "notebook.execute",
  "notebook.cell.clearOutputs",
  "notebook.clearAllCellsOutputs",
  "jupyter.runPrecedentCells",
  "jupyter.runDependentCells",
  "jupyter.debugcell",
  "jupyter.debugcontinue",
  "jupyter.debugstepover",
  "jupyter.debugstop",
  "jupyter.interruptkernel",
  "jupyter.restartkernel",
  "jupyter.restartkernelandrunallcells",
  "jupyter.restartkernelandrunuptoselectedcell",
  "jupyter.openVariableView",
  "jupyter.showDataViewer",
  "jupyter.viewOutput",
  "jupyter.selectJupyterInterpreter",
  "notebook.selectKernel",
  "workbench.action.notebook.focusTop",
  "workbench.action.notebook.focusBottom"
];

const DEFAULT_ENDPOINTS = [
  "GET /status",
  "GET /status/brief",
  "GET /servers",
  "GET /commands",
  "GET /capabilities",
  "GET /compliance",
  "GET /notebook",
  "GET /notebook/dirty",
  "GET /cells",
  "GET /cell",
  "GET /context",
  "GET /kernel",
  "GET /kernel/state",
  "GET /output",
  "GET /output/summary",
  "GET /execution/state",
  "GET /debug/state",
  "POST /execute",
  "POST /executeCellByIndex",
  "POST /cell/read",
  "POST /cell/batch",
  "POST /cell/insert",
  "POST /cell/append",
  "POST /cell/update",
  "POST /cell/delete",
  "POST /cell/move",
  "POST /cell/duplicate",
  "POST /cell/select",
  "POST /cell/reveal",
  "POST /cell/replaceOutputs",
  "POST /cell/clearOutputs",
  "POST /workflow/updateAndRun",
  "POST /workflow/insertAndRun",
  "POST /run/current",
  "POST /run/cell",
  "POST /run/above",
  "POST /run/below",
  "POST /run/all",
  "POST /run/selectedAndAdvance",
  "POST /run/precedents",
  "POST /run/dependents",
  "POST /debug/cell",
  "POST /debug/continue",
  "POST /debug/stepOver",
  "POST /debug/stop",
  "POST /output/clear",
  "POST /kernel/interrupt",
  "POST /kernel/restart",
  "POST /kernel/restartAndRunAll",
  "POST /kernel/restartAndRunToCell",
  "POST /kernel/shutdown",
  "POST /kernel/select",
  "POST /notebook/save",
  "POST /notebook/revert",
  "POST /notebook/closeEditor",
  "POST /notebook/focus",
  "POST /viewer/variables/open",
  "POST /viewer/data/open",
  "POST /viewer/output/open",
  "POST /interpreter/select"
];

const bridgeState = {
  lastExecution: null,
  lastDebug: null,
  lastKernelAction: null,
  lastNotebookAction: null,
  lastMutation: null,
  lastError: null,
  server: {
    host: null,
    port: null,
    basePort: null,
    portSpan: null,
    startedAt: null
  },
  notebookRuntime: {},
  activeNotebook: {
    uri: null,
    switchedAt: null,
    switchCount: 0,
    visibleEditors: 0,
    selectionSnapshot: [],
    versionToken: null
  },
  sidebar: {
    lastUpdatedAt: null,
    servers: [],
    refreshing: false
  }
};

let bridgeServer;
let output;
let controlCenterProvider;
let followAnimationSequence = 0;

function activate(context) {
  output = vscode.window.createOutputChannel("Data Bridge");
  context.subscriptions.push(output);

  controlCenterProvider = new DataBridgeControlCenterProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.onDidChangeActiveNotebookEditor((editor) => {
      updateActiveNotebookIdentity(editor, "active-editor-changed");
      refreshControlCenterSoon();
    }),
    vscode.window.onDidChangeVisibleNotebookEditors((editors) => {
      bridgeState.activeNotebook.visibleEditors = editors.length;
      refreshControlCenterSoon();
    }),
    vscode.window.onDidChangeNotebookEditorSelection((event) => {
      updateSelectionObservation(event.notebookEditor, "selection-changed");
      refreshControlCenterSoon();
    }),
    vscode.workspace.onDidChangeNotebookDocument((event) => {
      updateNotebookRuntimeFromEvent(event);
      refreshControlCenterSoon();
    }),
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration("dataBridge")) {
        try {
          await handleConfigurationChange(event);
        } catch (error) {
          log(`Configuration update failed: ${error.stack || error.message}`);
        } finally {
          refreshControlCenterSoon();
        }
      }
    }),
    vscode.window.registerWebviewViewProvider("dataBridge.controlCenter", controlCenterProvider)
  );

  updateActiveNotebookIdentity(vscode.window.activeNotebookEditor || null, "activate");
  bridgeState.activeNotebook.visibleEditors = vscode.window.visibleNotebookEditors.length;

  context.subscriptions.push(
    vscode.commands.registerCommand("dataBridge.openControlCenter", async () => openControlCenter()),
    vscode.commands.registerCommand("dataBridge.refreshControlCenter", async () => {
      await refreshControlCenter();
    }),
    vscode.commands.registerCommand("dataBridge.startServer", async () => startServer()),
    vscode.commands.registerCommand("dataBridge.stopServer", async () => stopServer()),
    vscode.commands.registerCommand("dataBridge.showStatus", async () => showStatus()),
    vscode.commands.registerCommand("dataBridge.copyServerConfig", async () => copyServerConfig()),
    vscode.commands.registerCommand("dataBridge.listCommands", async () => listCommands()),
    vscode.commands.registerCommand("dataBridge.runNotebookCommand", async () => runNotebookCommand()),
    vscode.commands.registerCommand("dataBridge.executeCellByIndex", async (index) => executeCellByIndex(index, {}))
  );

  if (getConfig().get("autoStart", true)) {
    startServer().catch((error) => log(`Auto-start failed: ${error.stack || error.message}`));
  }

  refreshControlCenterSoon();
}

function deactivate() {
  return stopServer();
}

function getConfig() {
  return vscode.workspace.getConfiguration("dataBridge");
}

function getServerConfig() {
  const config = getConfig();
  const envHost = process.env.DATA_BRIDGE_HOST || process.env.VSCODE_DATA_BRIDGE_HOST;
  const envPort = process.env.DATA_BRIDGE_PORT || process.env.VSCODE_DATA_BRIDGE_PORT;
  const envPortSpan = process.env.DATA_BRIDGE_PORT_SPAN || process.env.VSCODE_DATA_BRIDGE_PORT_SPAN;
  const envToken = process.env.DATA_BRIDGE_TOKEN || process.env.VSCODE_DATA_BRIDGE_TOKEN;
  return {
    host: envHost || config.get("host", "127.0.0.1"),
    port: toInteger(envPort, config.get("port", 8765)),
    portSpan: toInteger(envPortSpan, config.get("portSpan", 20)),
    token: envToken !== undefined ? envToken : config.get("token", ""),
    allowArbitraryCommands: config.get("allowArbitraryCommands", false),
    allowedPrefixes: config.get("allowedCommandPrefixes", [])
  };
}

function log(message) {
  output.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
}

function nonce() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shortPathLabel(value) {
  if (!value) {
    return "None";
  }
  const normalized = String(value).replace(/^file:\/\/\/?/i, "");
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts.length <= 2 ? normalized : parts.slice(-2).join("/");
}

function maskToken(token) {
  if (!token) {
    return "Not set";
  }
  if (token.length <= 6) {
    return `${token.slice(0, 1)}***`;
  }
  return `${token.slice(0, 3)}***${token.slice(-2)}`;
}

const I18N = {
  en: {
    none: "None",
    notSet: "Not set",
    unavailable: "Unavailable",
    current: "Current",
    other: "Other",
    busy: "busy",
    idle: "idle",
    ready: "ready",
    offline: "offline",
    controlCenterTitle: "Control Center",
    currentFocus: "Current focus",
    notebookUri: "Notebook URI",
    selection: "Selection",
    visibleRange: "Visible range",
    server: "Server",
    kernelBusy: "Kernel busy",
    bridgeCompliance: "Bridge compliance",
    refresh: "Refresh",
    copyConfig: "Copy Config",
    showStatus: "Show Status",
    stopServer: "Stop Server",
    startServer: "Start Server",
    servers: "Servers",
    localBridgeScan: "Local bridge scan across {start}-{end}.",
    role: "Role",
    baseUrl: "Base URL",
    notebook: "Notebook",
    workspace: "Workspace",
    noServers: "No bridge servers found.",
    settings: "Settings",
    autoStart: "Auto start server",
    followTargetCell: "Scroll follow current bridge target",
    allowArbitraryCommands: "Allow arbitrary commands",
    autoRefresh: "Auto refresh when visible",
    host: "Host",
    basePort: "Base port",
    portSpan: "Port span",
    refreshInterval: "Refresh interval (ms)",
    token: "Token",
    openFullSettings: "Open Full Settings",
    reloadView: "Reload View",
    safety: "Safety",
    fallbackAllowed: "Fallback allowed",
    mutationRequired: "Mutation required",
    executionRequired: "Execution required",
    identityStable: "Identity stable",
    yes: "yes",
    no: "no",
    bridgeRequired: "bridge",
    optional: "optional",
    visibleOnlyNote: "Auto refresh only runs while this view is visible."
  },
  zh: {
    none: "无",
    notSet: "未设置",
    unavailable: "不可用",
    current: "当前",
    other: "其他",
    busy: "忙碌",
    idle: "空闲",
    ready: "就绪",
    offline: "离线",
    controlCenterTitle: "控制中心",
    currentFocus: "当前焦点",
    notebookUri: "笔记本 URI",
    selection: "当前选区",
    visibleRange: "可视范围",
    server: "当前服务器",
    kernelBusy: "内核状态",
    bridgeCompliance: "Bridge 合规状态",
    refresh: "刷新",
    copyConfig: "复制配置",
    showStatus: "显示状态",
    stopServer: "停止服务",
    startServer: "启动服务",
    servers: "服务器列表",
    localBridgeScan: "本地 Bridge 扫描范围：{start}-{end}",
    role: "角色",
    baseUrl: "地址",
    notebook: "笔记本",
    workspace: "工作区",
    noServers: "未发现 Bridge 服务器。",
    settings: "配置项",
    autoStart: "自动启动服务",
    followTargetCell: "滚动跟随当前 Bridge 目标",
    allowArbitraryCommands: "允许任意命令",
    autoRefresh: "视图可见时自动刷新",
    host: "主机",
    basePort: "基础端口",
    portSpan: "端口跨度",
    refreshInterval: "刷新间隔（毫秒）",
    token: "令牌",
    openFullSettings: "打开完整设置",
    reloadView: "重载视图",
    safety: "安全",
    fallbackAllowed: "是否允许降级",
    mutationRequired: "修改要求",
    executionRequired: "执行要求",
    identityStable: "身份稳定",
    yes: "是",
    no: "否",
    bridgeRequired: "必须走 bridge",
    optional: "可选",
    visibleOnlyNote: "自动刷新只会在当前视图可见时运行。"
  }
};

function localeBundle() {
  const language = String(vscode.env.language || "en").toLowerCase();
  return language.startsWith("zh") ? I18N.zh : I18N.en;
}

function t(key, replacements = {}) {
  const bundle = localeBundle();
  const template = bundle[key] || I18N.en[key] || key;
  return Object.entries(replacements).reduce((result, [name, value]) => result.replaceAll(`{${name}}`, String(value)), template);
}

function controlCenterIntervalMs() {
  const value = toInteger(getConfig().get("controlCenterRefreshIntervalMs", 3000), 3000);
  return Math.min(Math.max(value, 1000), 30000);
}

function configurationTarget() {
  return vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
}

function shouldFollowTargetCell(forceReveal = false) {
  return forceReveal || getConfig().get("followTargetCell", true);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function currentVisibleAnchor(editor) {
  if (editor && Array.isArray(editor.visibleRanges) && editor.visibleRanges.length > 0) {
    const first = editor.visibleRanges[0];
    const last = editor.visibleRanges[editor.visibleRanges.length - 1];
    return Math.round((first.start + last.end - 1) / 2);
  }
  if (editor && Array.isArray(editor.selections) && editor.selections.length > 0) {
    return editor.selections[0].start;
  }
  return 0;
}

async function revealCellSmoothly(editor, index, options = {}) {
  if (!editor) {
    return;
  }
  const targetRange = new vscode.NotebookRange(index, index + 1);
  const startIndex = currentVisibleAnchor(editor);
  const distance = Math.abs(index - startIndex);
  if (distance <= 2 || options.immediate) {
    editor.revealRange(targetRange);
    return;
  }

  const animationId = ++followAnimationSequence;
  const steps = Math.min(7, Math.max(3, Math.ceil(distance / 6)));
  const frameDelay = Math.min(36, Math.max(18, Math.round((options.durationMs || 180) / steps)));
  let lastIndex = startIndex;

  for (let step = 1; step <= steps; step += 1) {
    if (animationId !== followAnimationSequence) {
      return;
    }
    const progress = easeOutCubic(step / steps);
    const nextIndex = Math.round(startIndex + (index - startIndex) * progress);
    if (nextIndex !== lastIndex || step === steps) {
      editor.revealRange(new vscode.NotebookRange(nextIndex, nextIndex + 1));
      lastIndex = nextIndex;
    }
    if (step < steps) {
      await sleep(frameDelay);
    }
  }
}

async function updateBridgeSetting(key, value) {
  await getConfig().update(key, value, configurationTarget());
}

function currentServerBaseUrl() {
  const host = bridgeState.server.host || getServerConfig().host;
  const port = bridgeState.server.port || getServerConfig().port;
  return `http://${host}:${port}`;
}

function requestJson(baseUrl, pathname, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, `${baseUrl}/`);
    const request = http.request(
      url,
      {
        method: "GET",
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      },
      (response) => {
        let raw = "";
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => {
          if (response.statusCode && response.statusCode >= 400) {
            reject(new Error(`${response.statusCode} ${response.statusMessage || "Request failed"}`));
            return;
          }
          try {
            resolve(raw ? JSON.parse(raw) : {});
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    request.setTimeout(800, () => request.destroy(new Error("timeout")));
    request.on("error", reject);
    request.end();
  });
}

async function discoverLocalServers() {
  const config = getServerConfig();
  const host = bridgeState.server.host || config.host;
  const basePort = config.port;
  const portSpan = Math.max(config.portSpan || 1, 1);
  const token = config.token || "";
  const currentBaseUrl = currentServerBaseUrl();
  const candidates = Array.from({ length: portSpan }, (_, index) => ({
    host,
    port: basePort + index,
    baseUrl: `http://${host}:${basePort + index}`
  }));

  const results = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        const status = await requestJson(candidate.baseUrl, "/status", token);
        return {
          ok: true,
          current: candidate.baseUrl === currentBaseUrl,
          host: candidate.host,
          port: candidate.port,
          baseUrl: candidate.baseUrl,
          window: status.window || null,
          notebook: status.notebook || null,
          compliance: status.compliance || null,
          server: status.server || null
        };
      } catch (error) {
        return {
          ok: false,
          current: candidate.baseUrl === currentBaseUrl,
          host: candidate.host,
          port: candidate.port,
          baseUrl: candidate.baseUrl,
          error: error.message
        };
      }
    })
  );

  bridgeState.sidebar.servers = results;
  bridgeState.sidebar.lastUpdatedAt = new Date().toISOString();
  return results;
}

async function controlCenterState() {
  const config = getServerConfig();
  const editor = activeNotebookEditor();
  const servers = await discoverLocalServers();
  return {
    generatedAt: new Date().toISOString(),
    server: {
      running: Boolean(bridgeServer),
      host: bridgeState.server.host || config.host,
      port: bridgeState.server.port || config.port,
      basePort: config.port,
      portSpan: config.portSpan,
      baseUrl: currentServerBaseUrl(),
      startedAt: bridgeState.server.startedAt || null
    },
    notebook: activeNotebookInfo(editor),
    window: windowIdentity(editor),
    kernel: kernelState(editor),
    execution: executionState(editor),
    compliance: complianceState(editor),
    settings: {
      host: config.host,
      port: config.port,
      portSpan: config.portSpan,
      autoStart: config.autoStart !== false,
      followTargetCell: getConfig().get("followTargetCell", true),
      controlCenterAutoRefresh: getConfig().get("controlCenterAutoRefresh", true),
      controlCenterRefreshIntervalMs: controlCenterIntervalMs(),
      allowArbitraryCommands: config.allowArbitraryCommands,
      allowedCommandPrefixes: config.allowedPrefixes,
      tokenIsSet: Boolean(config.token),
      tokenMasked: maskToken(config.token)
    },
    ui: {
      language: String(vscode.env.language || "en")
    },
    servers
  };
}

let refreshTimer;

function refreshControlCenterSoon(delay = 150) {
  if (!controlCenterProvider) {
    return;
  }
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    controlCenterProvider.refresh().catch((error) => log(`Control center refresh failed: ${error.stack || error.message}`));
  }, delay);
}

class DataBridgeControlCenterProvider {
  constructor(extensionUri) {
    this.extensionUri = extensionUri;
    this.view = null;
    this.refreshInterval = null;
  }

  resolveWebviewView(webviewView) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")]
    };
    webviewView.onDidDispose(() => {
      this.stopAutoRefresh();
      this.view = null;
    });
    webviewView.onDidChangeVisibility(() => {
      this.updateAutoRefresh();
      if (webviewView.visible) {
        this.refresh().catch((error) => log(`Control center visible refresh failed: ${error.stack || error.message}`));
      }
    });
    webviewView.webview.onDidReceiveMessage(async (message) => {
      try {
        await this.handleMessage(message);
      } catch (error) {
        vscode.window.showErrorMessage(`Data Bridge Control Center: ${error.message}`);
        log(`Control Center message failed: ${error.stack || error.message}`);
      }
    });
    this.refresh().catch((error) => log(`Control center initial render failed: ${error.stack || error.message}`));
    this.updateAutoRefresh();
  }

  async handleMessage(message) {
    switch (message.type) {
      case "refresh":
        await this.refresh();
        return;
      case "startServer":
        await startServer();
        return;
      case "stopServer":
        await stopServer();
        return;
      case "copyServerConfig":
        await copyServerConfig();
        return;
      case "showStatus":
        showStatus();
        return;
      case "openSettings":
        await vscode.commands.executeCommand("workbench.action.openSettings", "@ext:local.vscode-data-bridge");
        return;
      case "setBoolean":
        await updateBridgeSetting(message.key, Boolean(message.value));
        return;
      case "setNumber": {
        const numeric = toInteger(message.value);
        if (numeric === null) {
          throw new Error(`Invalid numeric value for ${message.key}`);
        }
        await updateBridgeSetting(message.key, numeric);
        return;
      }
      case "setText":
        await updateBridgeSetting(message.key, textValue(message.value));
        return;
      default:
        throw new Error(`Unknown control center action: ${message.type}`);
    }
  }

  async refresh() {
    if (!this.view) {
      return;
    }
    const state = await controlCenterState();
    this.view.webview.html = this.render(state, this.view.webview);
    this.updateAutoRefresh();
  }

  render(state, webview) {
    const strings = localeBundle();
    const note = state.notebook;
    const selection = note.selection && note.selection[0] ? `${note.selection[0].start}-${note.selection[0].end}` : strings.none;
    const visibleRange = note.visibleRange && note.visibleRange[0] ? `${note.visibleRange[0].start}-${note.visibleRange[0].end}` : strings.none;
    const rows = state.servers
      .map((server) => {
        if (!server.ok) {
          return `<tr><td>${server.current ? strings.current : strings.other}</td><td>${escapeHtml(server.baseUrl)}</td><td>${strings.unavailable}</td><td>${escapeHtml(server.error || "n/a")}</td></tr>`;
        }
        return `<tr><td>${server.current ? strings.current : strings.other}</td><td>${escapeHtml(server.baseUrl)}</td><td>${escapeHtml(shortPathLabel(server.notebook && server.notebook.uri))}</td><td>${escapeHtml(server.window && server.window.workspaceName ? server.window.workspaceName : "n/a")}</td></tr>`;
      })
      .join("");
    const nonceValue = nonce();
    return `<!DOCTYPE html>
<html lang="${escapeHtml(state.ui.language || "en")}">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonceValue}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 10px 12px 24px; }
    h2 { font-size: 14px; margin: 14px 0 8px; }
    .row { display: grid; grid-template-columns: 1fr auto; gap: 8px; margin: 5px 0; align-items: center; }
    .label { color: var(--vscode-descriptionForeground); }
    .value { word-break: break-word; text-align: right; }
    .grid { display: grid; gap: 8px; }
    .card { border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 10px; margin-bottom: 10px; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; padding: 6px 10px; cursor: pointer; }
    button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    input[type="text"], input[type="number"] { width: 100%; box-sizing: border-box; padding: 6px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); border-radius: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    td, th { border-bottom: 1px solid var(--vscode-panel-border); padding: 6px 4px; text-align: left; vertical-align: top; }
    .muted { color: var(--vscode-descriptionForeground); font-size: 12px; }
    .pill { display: inline-block; padding: 2px 6px; border-radius: 999px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); font-size: 11px; }
    .tableWrap { max-height: 170px; overflow: auto; border: 1px solid var(--vscode-panel-border); border-radius: 6px; margin-top: 8px; }
    .tableWrap table thead th { position: sticky; top: 0; background: var(--vscode-editor-background); z-index: 1; }
  </style>
</head>
<body>
  <div class="card">
    <div class="row"><div class="label">${strings.currentFocus}</div><div class="value">${escapeHtml(shortPathLabel(note.uri))}</div></div>
    <div class="row"><div class="label">${strings.notebookUri}</div><div class="value">${escapeHtml(note.uri || strings.none)}</div></div>
    <div class="row"><div class="label">${strings.selection}</div><div class="value">${escapeHtml(selection)}</div></div>
    <div class="row"><div class="label">${strings.visibleRange}</div><div class="value">${escapeHtml(visibleRange)}</div></div>
    <div class="row"><div class="label">${strings.server}</div><div class="value">${escapeHtml(state.server.baseUrl)}</div></div>
    <div class="row"><div class="label">${strings.kernelBusy}</div><div class="value">${state.kernel.busy ? `<span class="pill">${strings.busy}</span>` : `<span class="pill">${strings.idle}</span>`}</div></div>
    <div class="row"><div class="label">${strings.bridgeCompliance}</div><div class="value">${state.compliance.bridgeAvailable ? `<span class="pill">${strings.ready}</span>` : `<span class="pill">${strings.offline}</span>`}</div></div>
    <div class="actions">
      <button data-action="refresh">${strings.refresh}</button>
      <button data-action="copyServerConfig" class="secondary">${strings.copyConfig}</button>
      <button data-action="showStatus" class="secondary">${strings.showStatus}</button>
      <button data-action="${state.server.running ? "stopServer" : "startServer"}" class="secondary">${state.server.running ? strings.stopServer : strings.startServer}</button>
    </div>
  </div>

  <h2>${strings.servers}</h2>
  <div class="card">
    <div class="muted">${escapeHtml(t("localBridgeScan", { start: state.server.basePort, end: state.server.basePort + Math.max(state.server.portSpan - 1, 0) }))}</div>
    <div class="muted">${strings.visibleOnlyNote}</div>
    <div class="tableWrap">
      <table>
        <thead><tr><th>${strings.role}</th><th>${strings.baseUrl}</th><th>${strings.notebook}</th><th>${strings.workspace}</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4">${strings.noServers}</td></tr>`}</tbody>
      </table>
    </div>
  </div>

  <h2>${strings.settings}</h2>
  <div class="card grid">
    <label><input type="checkbox" data-setting="autoStart" ${state.settings.autoStart ? "checked" : ""}/> ${strings.autoStart}</label>
    <label><input type="checkbox" data-setting="followTargetCell" ${state.settings.followTargetCell ? "checked" : ""}/> ${strings.followTargetCell}</label>
    <label><input type="checkbox" data-setting="controlCenterAutoRefresh" ${state.settings.controlCenterAutoRefresh ? "checked" : ""}/> ${strings.autoRefresh}</label>
    <label><input type="checkbox" data-setting="allowArbitraryCommands" ${state.settings.allowArbitraryCommands ? "checked" : ""}/> ${strings.allowArbitraryCommands}</label>
    <div>
      <div class="muted">${strings.host}</div>
      <input type="text" data-text-setting="host" value="${escapeHtml(state.settings.host)}" />
    </div>
    <div>
      <div class="muted">${strings.basePort}</div>
      <input type="number" data-number-setting="port" value="${escapeHtml(String(state.settings.port))}" />
    </div>
    <div>
      <div class="muted">${strings.portSpan}</div>
      <input type="number" data-number-setting="portSpan" value="${escapeHtml(String(state.settings.portSpan))}" />
    </div>
    <div>
      <div class="muted">${strings.refreshInterval}</div>
      <input type="number" data-number-setting="controlCenterRefreshIntervalMs" value="${escapeHtml(String(state.settings.controlCenterRefreshIntervalMs))}" />
    </div>
    <div>
      <div class="muted">${strings.token}</div>
      <input type="text" data-text-setting="token" value="" placeholder="${escapeHtml(state.settings.tokenIsSet ? state.settings.tokenMasked : strings.notSet)}" />
    </div>
    <div class="actions">
      <button data-action="openSettings" class="secondary">${strings.openFullSettings}</button>
      <button data-action="refresh" class="secondary">${strings.reloadView}</button>
    </div>
  </div>

  <h2>${strings.safety}</h2>
  <div class="card">
    <div class="row"><div class="label">${strings.fallbackAllowed}</div><div class="value">${state.compliance.fallbackAllowed ? strings.yes : strings.no}</div></div>
    <div class="row"><div class="label">${strings.mutationRequired}</div><div class="value">${state.compliance.bridgeMutationRequired ? strings.bridgeRequired : strings.optional}</div></div>
    <div class="row"><div class="label">${strings.executionRequired}</div><div class="value">${state.compliance.bridgeExecutionRequired ? strings.bridgeRequired : strings.optional}</div></div>
    <div class="row"><div class="label">${strings.identityStable}</div><div class="value">${state.compliance.activeNotebookIdentityStable ? strings.yes : strings.no}</div></div>
  </div>

  <script nonce="${nonceValue}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', () => vscode.postMessage({ type: button.dataset.action }));
    });
    document.querySelectorAll('[data-setting]').forEach((input) => {
      input.addEventListener('change', () => vscode.postMessage({
        type: 'setBoolean',
        key: input.dataset.setting,
        value: input.checked
      }));
    });
    document.querySelectorAll('[data-number-setting]').forEach((input) => {
      input.addEventListener('change', () => vscode.postMessage({
        type: 'setNumber',
        key: input.dataset.numberSetting,
        value: input.value
      }));
    });
    document.querySelectorAll('[data-text-setting]').forEach((input) => {
      input.addEventListener('change', () => vscode.postMessage({
        type: 'setText',
        key: input.dataset.textSetting,
        value: input.value
      }));
    });
  </script>
</body>
</html>`;
  }

  updateAutoRefresh() {
    if (!this.view) {
      this.stopAutoRefresh();
      return;
    }
    const enabled = getConfig().get("controlCenterAutoRefresh", true);
    if (!enabled || !this.view.visible) {
      this.stopAutoRefresh();
      return;
    }
    const intervalMs = controlCenterIntervalMs();
    if (this.refreshInterval && this.refreshInterval.intervalMs === intervalMs) {
      return;
    }
    this.stopAutoRefresh();
    const handle = setInterval(() => {
      if (!this.view || !this.view.visible) {
        return;
      }
      this.refresh().catch((error) => log(`Control center auto-refresh failed: ${error.stack || error.message}`));
    }, intervalMs);
    this.refreshInterval = { handle, intervalMs };
  }

  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval.handle);
      this.refreshInterval = null;
    }
  }
}

async function openControlCenter() {
  await vscode.commands.executeCommand("workbench.view.extension.dataBridgeSidebar");
  refreshControlCenterSoon(0);
}

async function refreshControlCenter() {
  if (controlCenterProvider) {
    await controlCenterProvider.refresh();
  }
}

async function handleConfigurationChange(event) {
  const serverRelevantKeys = [
    "dataBridge.host",
    "dataBridge.port",
    "dataBridge.portSpan",
    "dataBridge.token"
  ];
  if (bridgeServer && serverRelevantKeys.some((key) => event.affectsConfiguration(key))) {
    await stopServer();
    await startServer();
  }
}

function textValue(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function toBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  if (typeof value === "boolean") {
    return value;
  }
  return ["1", "true", "yes"].includes(String(value).toLowerCase());
}

function toInteger(value, defaultValue = null) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : defaultValue;
}

function arrayValue(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return value === undefined || value === null ? [] : [value];
}

function normalizeSource(source) {
  if (Array.isArray(source)) {
    return source.join("");
  }
  if (typeof source === "string") {
    return source;
  }
  return source === undefined || source === null ? "" : String(source);
}

function notebookKind(kind) {
  if (kind === vscode.NotebookCellKind.Markup || kind === "markdown" || kind === "markup") {
    return vscode.NotebookCellKind.Markup;
  }
  return vscode.NotebookCellKind.Code;
}

function notebookLanguage(kind) {
  return notebookKind(kind) === vscode.NotebookCellKind.Markup ? "markdown" : "python";
}

function serializeRange(range) {
  return { start: range.start, end: range.end };
}

function selectionSnapshot(editor) {
  return editor ? editor.selections.map((range) => serializeRange(range)) : [];
}

function decodeOutputItem(item) {
  try {
    return Buffer.from(item.data).toString("utf8");
  } catch {
    return "";
  }
}

function summarizeOutput(output) {
  const mimeTypes = output.items.map((item) => item.mime);
  const text = output.items
    .map((item) => {
      if (
        item.mime === "text/plain" ||
        item.mime === "application/vnd.code.notebook.stdout" ||
        item.mime === "application/vnd.code.notebook.stderr" ||
        item.mime === "application/vnd.code.notebook.error"
      ) {
        return decodeOutputItem(item).trim();
      }
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .slice(0, 400);
  return { mimeTypes, text };
}

function serializeOutput(output, options = {}) {
  return {
    metadata: output.metadata || {},
    summary: summarizeOutput(output),
    items: output.items.map((item) => ({
      mime: item.mime,
      text: options.includeOutputText === false ? undefined : decodeOutputItem(item).slice(0, options.outputTextLimit || 4000)
    }))
  };
}

function executionSummary(cell) {
  const summary = cell.executionSummary || {};
  return {
    executionOrder: summary.executionOrder ?? null,
    success: summary.success ?? null,
    timing: summary.timing
      ? { startTime: summary.timing.startTime ?? null, endTime: summary.timing.endTime ?? null }
      : null
  };
}

function cellId(cell) {
  return cell.document.uri.toString();
}

function notebookUri(editorOrNotebook) {
  if (!editorOrNotebook) {
    return null;
  }
  const notebook = editorOrNotebook.notebook || editorOrNotebook;
  return notebook && notebook.uri ? notebook.uri.toString() : null;
}

function workspaceRoots() {
  return (vscode.workspace.workspaceFolders || []).map((folder) => ({
    name: folder.name,
    uri: folder.uri.toString(),
    path: folder.uri.fsPath
  }));
}

function windowIdentity(editor = activeNotebookEditor()) {
  const roots = workspaceRoots();
  const notebook = activeNotebookInfo(editor);
  return {
    workspaceName: vscode.workspace.name || null,
    rootPaths: roots.map((root) => root.path),
    rootUris: roots.map((root) => root.uri),
    activeNotebookUri: notebook.uri,
    notebookType: notebook.notebookType,
    hasActiveNotebook: notebook.hasActiveNotebook
  };
}

function notebookRuntimeRecord(uri) {
  if (!uri) {
    return null;
  }
  if (!bridgeState.notebookRuntime[uri]) {
    bridgeState.notebookRuntime[uri] = {
      uri,
      busy: false,
      statusKnown: false,
      executionRequestedAt: null,
      lastExecutionCompletedAt: null,
      lastOutputChangeAt: null,
      lastDocumentChangeAt: null,
      lastSelectionSeenAt: null,
      lastActivatedAt: null,
      lastIdentityReason: null,
      executionChangeCount: 0,
      outputChangeCount: 0,
      pendingTargets: [],
      lastObservedExecutionOrder: null,
      lastObservedCellIds: [],
      lastObservedNotebookVersion: 0,
      lastObservedMutationAt: null,
      lastMutationCellIds: [],
      completionObservedAt: null,
      outputObservedAt: null,
      idleObservedAt: null,
      identityDrifted: false,
      driftedAt: null,
      driftReason: null,
      selectionSnapshot: []
    };
  }
  return bridgeState.notebookRuntime[uri];
}

function notebookVersionToken(editor = activeNotebookEditor()) {
  const uri = notebookUri(editor);
  const runtime = notebookRuntimeRecord(uri);
  if (!uri || !runtime) {
    return null;
  }
  return `${uri}#${runtime.lastObservedNotebookVersion}`;
}

function activeRuntime(editor = activeNotebookEditor()) {
  const uri = notebookUri(editor);
  return notebookRuntimeRecord(uri);
}

function updateActiveNotebookIdentity(editor, reason) {
  const uri = notebookUri(editor);
  bridgeState.activeNotebook.uri = uri;
  bridgeState.activeNotebook.switchedAt = new Date().toISOString();
  bridgeState.activeNotebook.switchCount += 1;
  bridgeState.activeNotebook.selectionSnapshot = selectionSnapshot(editor);
  const runtime = notebookRuntimeRecord(uri);
  if (runtime) {
    runtime.lastActivatedAt = bridgeState.activeNotebook.switchedAt;
    runtime.lastIdentityReason = reason;
    runtime.lastSelectionSeenAt = editor && editor.selections ? new Date().toISOString() : runtime.lastSelectionSeenAt;
    runtime.selectionSnapshot = selectionSnapshot(editor);
  }
  bridgeState.activeNotebook.versionToken = notebookVersionToken(editor);
  observeIdentityDrift(editor, reason);
}

function updateSelectionObservation(editor, reason) {
  const uri = notebookUri(editor);
  const runtime = notebookRuntimeRecord(uri);
  const snapshot = selectionSnapshot(editor);
  bridgeState.activeNotebook.selectionSnapshot = snapshot;
  bridgeState.activeNotebook.versionToken = notebookVersionToken(editor);
  if (runtime) {
    runtime.lastSelectionSeenAt = new Date().toISOString();
    runtime.selectionSnapshot = snapshot;
  }
  observeIdentityDrift(editor, reason);
}

function targetMatchesSelection(editor, target) {
  if (!editor || !target) {
    return true;
  }
  if (target.selection === "current" || target.scope === "all") {
    return true;
  }
  const current = editor.selections && editor.selections[0];
  if (!current) {
    return false;
  }
  if (typeof target.index === "number") {
    return current.start <= target.index && current.end > target.index;
  }
  return true;
}

function observeIdentityDrift(editor, reason) {
  const lastExecution = bridgeState.lastExecution;
  if (!lastExecution || !lastExecution.pendingObservation) {
    return;
  }
  const currentUri = notebookUri(editor);
  const runtime = notebookRuntimeRecord(lastExecution.notebookUri);
  if (!runtime) {
    return;
  }
  const uriDrifted = currentUri !== lastExecution.notebookUri;
  const selectionDrifted = currentUri === lastExecution.notebookUri && !targetMatchesSelection(editor, lastExecution.target);
  if (uriDrifted || selectionDrifted) {
    const driftedAt = new Date().toISOString();
    runtime.identityDrifted = true;
    runtime.driftedAt = driftedAt;
    runtime.driftReason = uriDrifted ? "active-notebook-changed" : reason || "selection-changed";
    lastExecution.identityStable = false;
    lastExecution.identityDrifted = true;
    lastExecution.identityDriftedAt = driftedAt;
  }
}

function updateNotebookRuntimeFromEvent(event) {
  const uri = notebookUri(event.notebook);
  const runtime = notebookRuntimeRecord(uri);
  if (!runtime) {
    return;
  }
  const changedAt = new Date().toISOString();
  runtime.statusKnown = true;
  runtime.lastDocumentChangeAt = changedAt;
  runtime.lastObservedNotebookVersion += 1;
  bridgeState.activeNotebook.versionToken = notebookVersionToken(activeNotebookEditor());
  const outputChanged = event.cellChanges.some((change) => Array.isArray(change.outputs) && change.outputs.length >= 0);
  const executionChanged = event.cellChanges.some((change) => change.executionSummary !== undefined);

  if (outputChanged) {
    runtime.outputChangeCount += 1;
    runtime.lastOutputChangeAt = changedAt;
    runtime.outputObservedAt = changedAt;
    if (bridgeState.lastExecution && bridgeState.lastExecution.notebookUri === uri) {
      bridgeState.lastExecution.outputObserved = true;
      bridgeState.lastExecution.outputObservedAt = changedAt;
    }
  }

  if (executionChanged) {
    runtime.executionChangeCount += 1;
    runtime.lastExecutionCompletedAt = changedAt;
    runtime.completionObservedAt = changedAt;
    runtime.busy = false;
    runtime.pendingTargets = [];
    runtime.idleObservedAt = changedAt;
    if (bridgeState.lastExecution && bridgeState.lastExecution.notebookUri === uri) {
      bridgeState.lastExecution.pendingObservation = false;
      bridgeState.lastExecution.completedAt = changedAt;
      bridgeState.lastExecution.completionObserved = true;
      bridgeState.lastExecution.identityStable = !runtime.identityDrifted;
    }
  } else if (outputChanged && runtime.pendingTargets.length > 0) {
    runtime.busy = true;
  }

  if ((outputChanged || executionChanged) && bridgeState.lastMutation && bridgeState.lastMutation.notebookUri === uri) {
    runtime.lastObservedMutationAt = changedAt;
    bridgeState.lastMutation.lastMutationObservedAt = changedAt;
    bridgeState.lastMutation.lastMutationApplied = true;
  }

  const observedCells = event.cellChanges
    .filter((change) => change.cell)
    .map((change) => cellId(change.cell));
  if (observedCells.length > 0) {
    runtime.lastObservedCellIds = observedCells;
    runtime.lastMutationCellIds = observedCells;
  }

  const observedExecutionOrder = event.cellChanges
    .map((change) => change.executionSummary && change.executionSummary.executionOrder)
    .find((value) => typeof value === "number");
  if (typeof observedExecutionOrder === "number") {
    runtime.lastObservedExecutionOrder = observedExecutionOrder;
  }
}

function serializeCell(cell, index, options = {}) {
  const source = cell.document.getText();
  return {
    index,
    id: cellId(cell),
    kind: cell.kind === vscode.NotebookCellKind.Markup ? "markdown" : "code",
    languageId: cell.document.languageId,
    source: options.includeSource === false ? undefined : source,
    sourceSummary: source.slice(0, 240),
    metadata: options.includeMetadata === false ? undefined : cell.metadata || {},
    outputs: options.includeOutputs === false ? undefined : cell.outputs.map((output) => serializeOutput(output, options)),
    outputSummary: cell.outputs.map((output) => summarizeOutput(output)),
    executionSummary: executionSummary(cell),
    documentUri: cell.document.uri.toString()
  };
}

function activeNotebookEditor() {
  return vscode.window.activeNotebookEditor || null;
}

function activeNotebookInfo(editor = activeNotebookEditor()) {
  const runtime = activeRuntime(editor);
  return {
    hasActiveNotebook: Boolean(editor),
    uri: editor ? editor.notebook.uri.toString() : null,
    notebookType: editor ? editor.notebook.notebookType : null,
    isDirty: editor ? Boolean(editor.notebook.isDirty) : false,
    cellCount: editor ? editor.notebook.cellCount : 0,
    visibleRange: editor ? editor.visibleRanges.map((range) => serializeRange(range)) : [],
    selection: editor ? editor.selections.map((range) => serializeRange(range)) : [],
    identity: {
      uri: bridgeState.activeNotebook.uri,
      activeUri: bridgeState.activeNotebook.uri,
      versionToken: notebookVersionToken(editor),
      switchedAt: bridgeState.activeNotebook.switchedAt,
      switchCount: bridgeState.activeNotebook.switchCount,
      visibleEditors: bridgeState.activeNotebook.visibleEditors,
      selectionSnapshot: selectionSnapshot(editor),
      lastActivatedAt: runtime ? runtime.lastActivatedAt : null,
      lastIdentityReason: runtime ? runtime.lastIdentityReason : null
    }
  };
}

function mutationState(editor = activeNotebookEditor()) {
  const runtime = activeRuntime(editor);
  return {
    lastMutation: bridgeState.lastMutation,
    lastMutationTarget: bridgeState.lastMutation ? bridgeState.lastMutation.target || null : null,
    lastMutationApplied: Boolean(bridgeState.lastMutation && bridgeState.lastMutation.lastMutationApplied),
    lastMutationObservedAt: runtime ? runtime.lastObservedMutationAt : null,
    lastMutationSource: bridgeState.lastMutation ? bridgeState.lastMutation.source || "bridge" : null
  };
}

function kernelState(editor = activeNotebookEditor()) {
  const runtime = activeRuntime(editor);
  return {
    supported: Boolean(editor),
    connected: Boolean(editor),
    busy: Boolean(runtime && runtime.busy),
    unknownBusyState: Boolean(!runtime || !runtime.statusKnown),
    supportsShutdown: false,
    executionRequestedAt: runtime ? runtime.executionRequestedAt : null,
    lastExecutionCompletedAt: runtime ? runtime.lastExecutionCompletedAt : null,
    lastOutputChangeAt: runtime ? runtime.lastOutputChangeAt : null,
    idleObservedAt: runtime ? runtime.idleObservedAt : null,
    pendingTargets: runtime ? runtime.pendingTargets : [],
    lastKernelAction: bridgeState.lastKernelAction,
    lastExecution: bridgeState.lastExecution
  };
}

function debugState(editor = activeNotebookEditor()) {
  return {
    active: Boolean(vscode.debug.activeDebugSession),
    session: vscode.debug.activeDebugSession
      ? {
          id: vscode.debug.activeDebugSession.id,
          name: vscode.debug.activeDebugSession.name,
          type: vscode.debug.activeDebugSession.type
        }
      : null,
    notebook: activeNotebookInfo(editor),
    lastDebug: bridgeState.lastDebug
  };
}

function executionState(editor = activeNotebookEditor()) {
  const runtime = activeRuntime(editor);
  const inferred = inferredExecutionObservation(editor);
  return {
    notebook: activeNotebookInfo(editor),
    kernel: kernelState(editor),
    requestedAt: bridgeState.lastExecution ? bridgeState.lastExecution.at : null,
    pending: Boolean(runtime && runtime.busy),
    pendingTargets: runtime ? runtime.pendingTargets : [],
    completedAt: bridgeState.lastExecution ? bridgeState.lastExecution.completedAt || null : null,
    completionObserved: inferred.completionObserved,
    outputObserved: inferred.outputObserved,
    outputObservedAt: inferred.outputObservedAt,
    busy: Boolean(runtime && runtime.busy),
    idleObservedAt: runtime ? runtime.idleObservedAt : null,
    identityStable: inferred.identityStable,
    identityDrifted: Boolean(bridgeState.lastExecution && bridgeState.lastExecution.identityDrifted),
    lastExecution: bridgeState.lastExecution,
    pendingObservation: Boolean(bridgeState.lastExecution && bridgeState.lastExecution.pendingObservation),
    observed: runtime
      ? {
          executionChangeCount: runtime.executionChangeCount,
          outputChangeCount: runtime.outputChangeCount,
          lastDocumentChangeAt: runtime.lastDocumentChangeAt,
          lastObservedExecutionOrder: runtime.lastObservedExecutionOrder,
          lastObservedCellIds: runtime.lastObservedCellIds,
          completionObservedAt: runtime.completionObservedAt,
          outputObservedAt: runtime.outputObservedAt,
          identityDrifted: runtime.identityDrifted,
          driftedAt: runtime.driftedAt,
          driftReason: runtime.driftReason
        }
      : null
  };
}

function complianceState(editor = activeNotebookEditor()) {
  const runtime = activeRuntime(editor);
  const execution = bridgeState.lastExecution;
  const inferred = inferredExecutionObservation(editor);
  return {
    bridgeAvailable: Boolean(bridgeServer),
    bridgeMutationRequired: true,
    bridgeExecutionRequired: true,
    fallbackAllowed: false,
    fallbackReason: null,
    activeNotebookIdentityStable: Boolean(!runtime || !runtime.identityDrifted),
    lastMutationBridgeConfirmed: Boolean(bridgeState.lastMutation && bridgeState.lastMutation.lastMutationApplied),
    lastExecutionBridgeConfirmed: Boolean(execution && inferred.completionObserved && inferred.outputObserved && inferred.identityStable),
    lastMutationSource: bridgeState.lastMutation ? bridgeState.lastMutation.source || "bridge" : null,
    lastExecutionSource: execution ? "bridge" : null
  };
}

function briefState(editor = activeNotebookEditor()) {
  const notebook = activeNotebookInfo(editor);
  const execution = executionState(editor);
  const compliance = complianceState(editor);
  const server = {
    host: bridgeState.server.host || getServerConfig().host,
    port: bridgeState.server.port || getServerConfig().port,
    baseUrl: currentServerBaseUrl()
  };
  return {
    hasActiveNotebook: notebook.hasActiveNotebook,
    uri: notebook.uri,
    selection: notebook.selection,
    versionToken: notebook.identity.versionToken,
    busy: execution.busy,
    bridgeAvailable: compliance.bridgeAvailable,
    identityStable: compliance.activeNotebookIdentityStable,
    server
  };
}

function capabilities() {
  return {
    endpoints: DEFAULT_ENDPOINTS,
    commands: QUICK_COMMANDS,
    supports: {
      serverDiscovery: true,
      notebookState: true,
      multiWindowDiscovery: true,
      compliance: true,
      cellCrud: true,
      workflowOps: true,
      execution: true,
      debugCommands: true,
      outputRead: true,
      outputClear: true,
      kernelLifecycle: true,
      notebookLifecycle: true,
      viewerCommands: true,
      kernelShutdown: false
    }
  };
}

function structuredError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function responseError(error, operation) {
  bridgeState.lastError = {
    operation,
    code: error.code || "INTERNAL_ERROR",
    message: error.message,
    at: new Date().toISOString()
  };
  return {
    ok: false,
    operation,
    error: {
      code: error.code || "INTERNAL_ERROR",
      message: error.message,
      details: error.details || null
    }
  };
}

function okResponse(operation, payload = {}, options = {}) {
  if (options.includeState === false) {
    return {
      ok: true,
      operation,
      ...payload
    };
  }
  return {
    ok: true,
    operation,
    notebook: activeNotebookInfo(),
    kernel: kernelState(),
    mutation: mutationState(),
    execution: executionState(),
    compliance: complianceState(),
    window: windowIdentity(),
    ...payload
  };
}

function jsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(structuredError("INVALID_JSON", "Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function isAuthorized(req, token) {
  if (!token) {
    return true;
  }
  const header = req.headers.authorization || "";
  return header === `Bearer ${token}`;
}

function isAllowedCommand(commandId, config) {
  if (config.allowArbitraryCommands) {
    return true;
  }
  return config.allowedPrefixes.some((prefix) => commandId.startsWith(prefix));
}

async function getAllCommands() {
  const commands = await vscode.commands.getCommands(true);
  return commands.sort();
}

function getEditorOrThrow() {
  const editor = activeNotebookEditor();
  if (!editor) {
    throw structuredError("NO_ACTIVE_NOTEBOOK", "No active notebook editor");
  }
  return editor;
}

function getNotebookCells(editor) {
  return editor.notebook.getCells();
}

function findCell(editor, locator = {}, options = {}) {
  const cells = getNotebookCells(editor);
  const selection = textValue(locator.selection);
  if (selection === "current") {
    const current = editor.selections[0];
    if (!current) {
      throw structuredError("NO_SELECTION", "No selected notebook cell");
    }
    const cell = cells[current.start];
    if (!cell) {
      throw structuredError("NO_SELECTION", "Selected notebook cell is out of range");
    }
    return { cell, index: current.start };
  }

  const index = toInteger(locator.index);
  if (index !== null) {
    if (index < 0 || index >= cells.length) {
      throw structuredError("CELL_INDEX_OUT_OF_RANGE", `Cell index out of range: ${index}`);
    }
    return { cell: cells[index], index };
  }

  const desiredId = locator.id || locator.cellId;
  if (desiredId) {
    const matchIndex = cells.findIndex((cell) => cellId(cell) === desiredId || cell.metadata?.id === desiredId);
    if (matchIndex === -1) {
      throw structuredError("CELL_NOT_FOUND", `Unable to find cell: ${desiredId}`);
    }
    return { cell: cells[matchIndex], index: matchIndex };
  }

  const marker = locator.marker;
  if (marker) {
    const matches = cells
      .map((cell, cellIndex) => ({ cell, index: cellIndex }))
      .filter((entry) => entry.cell.document.getText().includes(marker));
    if (matches.length === 0) {
      throw structuredError("CELL_MARKER_NOT_FOUND", `No cell matched marker: ${marker}`);
    }
    if (matches.length > 1 && !options.allowMultipleMarkers) {
      throw structuredError("CELL_MARKER_AMBIGUOUS", `Marker matched multiple cells: ${marker}`);
    }
    return matches[0];
  }

  throw structuredError("CELL_LOCATOR_REQUIRED", "A cell locator is required");
}

function resolveCellFromTarget(editor, target) {
  if (!editor || !target) {
    return null;
  }
  try {
    if (typeof target.index === "number") {
      return findCell(editor, { index: target.index });
    }
    if (target.id) {
      return findCell(editor, { id: target.id });
    }
    if (target.selection === "current") {
      return findCell(editor, { selection: "current" });
    }
  } catch {
    return null;
  }
  return null;
}

function hasCellOutputs(cell) {
  return Boolean(cell && Array.isArray(cell.outputs) && cell.outputs.length > 0);
}

function inferredExecutionObservation(editor = activeNotebookEditor()) {
  const execution = bridgeState.lastExecution;
  if (!editor || !execution || execution.notebookUri !== notebookUri(editor)) {
    return {
      completionObserved: Boolean(execution && execution.completionObserved),
      outputObserved: Boolean(execution && execution.outputObserved),
      outputObservedAt: execution ? execution.outputObservedAt || null : null,
      identityStable: execution ? execution.identityStable !== false : true
    };
  }

  const runtime = activeRuntime(editor);
  const target = resolveCellFromTarget(editor, execution.target);
  const completionObserved = Boolean(execution.completionObserved || (runtime && runtime.completionObservedAt));
  const outputObserved = Boolean(execution.outputObserved || (target && hasCellOutputs(target.cell)));
  const outputObservedAt = execution.outputObservedAt || (outputObserved && runtime ? runtime.outputObservedAt || runtime.lastDocumentChangeAt : null);

  if (outputObserved && !execution.outputObserved) {
    execution.outputObserved = true;
    execution.outputObservedAt = outputObservedAt;
  }

  return {
    completionObserved,
    outputObserved,
    outputObservedAt,
    identityStable: execution.identityStable !== false
  };
}

function cloneCellData(cell, overrides = {}) {
  const nextKind = notebookKind(overrides.kind ?? cell.kind);
  const nextSource = normalizeSource(overrides.source ?? cell.document.getText());
  const nextMetadata = overrides.metadata ?? cell.metadata ?? {};
  const cellData = new vscode.NotebookCellData(nextKind, nextSource, overrides.languageId || cell.document.languageId || notebookLanguage(nextKind));
  cellData.metadata = nextMetadata;
  cellData.outputs = overrides.outputs !== undefined ? overrides.outputs : cell.outputs;
  return cellData;
}

async function applyNotebookCellReplacement(editor, start, end, cellData) {
  const edit = new vscode.WorkspaceEdit();
  edit.set(editor.notebook.uri, [vscode.NotebookEdit.replaceCells(new vscode.NotebookRange(start, end), cellData)]);
  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    throw structuredError("EDIT_REJECTED", "Notebook edit was rejected");
  }
}

async function applyNotebookMetadataEdit(editor, notebookEdits) {
  const edit = new vscode.WorkspaceEdit();
  edit.set(editor.notebook.uri, notebookEdits);
  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    throw structuredError("EDIT_REJECTED", "Notebook metadata edit was rejected");
  }
}

async function selectCell(editor, index, options = {}) {
  const range = new vscode.NotebookRange(index, index + 1);
  editor.selections = [range];
  if (options.reveal !== false && shouldFollowTargetCell(options.forceReveal)) {
    await revealCellSmoothly(editor, index, options);
  }
  return range;
}

async function withCellSelection(editor, locator, callback, options = {}) {
  const originalSelections = editor.selections.slice();
  const target = findCell(editor, locator);
  await selectCell(editor, target.index, { reveal: options.reveal !== false });
  try {
    return await callback(target);
  } finally {
    if (options.restoreSelection) {
      editor.selections = originalSelections;
    }
  }
}

function summarizeNotebook(editor, options = {}) {
  const cells = getNotebookCells(editor).map((cell, index) => serializeCell(cell, index, options));
  return {
    notebook: activeNotebookInfo(editor),
    cells,
    summary: {
      cellCount: cells.length,
      codeCellCount: cells.filter((cell) => cell.kind === "code").length,
      markdownCellCount: cells.filter((cell) => cell.kind === "markdown").length,
      dirty: Boolean(editor.notebook.isDirty)
    }
  };
}

function buildOutputItems(items = []) {
  return items.map((item) => {
    let data;
    if (item.base64) {
      data = Buffer.from(item.base64, "base64");
    } else if (item.json !== undefined) {
      data = Buffer.from(JSON.stringify(item.json), "utf8");
    } else if (item.text !== undefined) {
      data = Buffer.from(String(item.text), "utf8");
    } else {
      data = Buffer.from(String(item.data || ""), "utf8");
    }
    return new vscode.NotebookCellOutputItem(data, item.mime || "text/plain");
  });
}

function buildOutputs(outputs = []) {
  return outputs.map((outputSpec) => new vscode.NotebookCellOutput(buildOutputItems(outputSpec.items || []), outputSpec.metadata || {}));
}

function cellOutputSummary(cell) {
  return (cell.outputs || []).map((output) => summarizeOutput(output));
}

function cellHasErrorOutput(cell) {
  return Boolean(
    (cell.outputs || []).some((output) =>
      output.items.some((item) => item.mime === "application/vnd.code.notebook.error" || item.mime === "application/vnd.code.notebook.stderr")
    )
  );
}

async function executeCommand(commandId, args = [], meta = {}) {
  log(`Executing command: ${commandId}`);
  const currentEditor = activeNotebookEditor();
  const currentUri = notebookUri(currentEditor);
  const runtime = notebookRuntimeRecord(currentUri);
  const result = await vscode.commands.executeCommand(commandId, ...args);
  if (meta.kind === "execution") {
    bridgeState.lastExecution = {
      command: commandId,
      at: new Date().toISOString(),
      target: meta.target || null,
      pendingObservation: true,
      notebookUri: currentUri,
      completionObserved: false,
      outputObserved: false,
      outputObservedAt: null,
      completedAt: null,
      identityStable: true,
      identityDrifted: false
    };
    if (runtime) {
      runtime.statusKnown = true;
      runtime.busy = true;
      runtime.executionRequestedAt = bridgeState.lastExecution.at;
      runtime.pendingTargets = meta.target ? [meta.target] : [];
      runtime.identityDrifted = false;
      runtime.driftedAt = null;
      runtime.driftReason = null;
    }
  }
  if (meta.kind === "debug") {
    bridgeState.lastDebug = {
      command: commandId,
      at: new Date().toISOString(),
      target: meta.target || null,
      notebookUri: currentUri
    };
  }
  if (meta.kind === "kernel") {
    bridgeState.lastKernelAction = {
      command: commandId,
      at: new Date().toISOString(),
      target: meta.target || null,
      notebookUri: currentUri
    };
    if (runtime) {
      runtime.statusKnown = true;
      if (commandId === "jupyter.interruptkernel" || commandId === "jupyter.restartkernel") {
        runtime.busy = false;
        runtime.pendingTargets = [];
      }
    }
  }
  if (meta.kind === "notebook") {
    bridgeState.lastNotebookAction = {
      command: commandId,
      at: new Date().toISOString()
    };
  }
  return result;
}

async function executeBridgeCommand(commandId, args) {
  const result = await executeCommand(commandId, args);
  return okResponse("execute", {
    command: commandId,
    result: result === undefined ? null : result,
    summary: `Executed ${commandId}`
  });
}

async function executeCellByIndex(index, options = {}) {
  const editor = getEditorOrThrow();
  const numericIndex = toInteger(index);
  if (numericIndex === null || numericIndex < 0 || numericIndex >= editor.notebook.cellCount) {
    throw structuredError("CELL_INDEX_OUT_OF_RANGE", `Cell index out of range: ${index}`);
  }
  return withCellSelection(
    editor,
    { index: numericIndex },
    async (target) => {
      await executeCommand("notebook.cell.execute", [], {
        kind: "execution",
        target: { index: target.index, id: cellId(target.cell) }
      });
      return okResponse("executeCellByIndex", {
        cell: serializeCell(target.cell, target.index),
        selection: activeNotebookInfo(editor).selection,
        accepted: true,
        pendingObservation: true,
        summary: `Execution requested for cell ${target.index}`
      });
    },
    { restoreSelection: toBoolean(options.restoreSelection, false) }
  );
}

async function readCell(locator, options = {}) {
  const editor = getEditorOrThrow();
  const target = findCell(editor, locator);
  return okResponse("cell.read", {
    cell: serializeCell(target.cell, target.index, options),
    selection: activeNotebookInfo(editor).selection,
    summary: `Read cell ${target.index}`
  });
}

async function insertCell(payload, append = false) {
  const editor = getEditorOrThrow();
  const cells = getNotebookCells(editor);
  const index = append ? cells.length : toInteger(payload.index, cells.length);
  if (index < 0 || index > cells.length) {
    throw structuredError("CELL_INDEX_OUT_OF_RANGE", `Cell index out of range: ${index}`);
  }
  const kind = notebookKind(payload.kind);
  const cellData = new vscode.NotebookCellData(kind, normalizeSource(payload.source), textValue(payload.languageId, notebookLanguage(kind)));
  cellData.metadata = payload.metadata || {};
  cellData.outputs = [];
  await applyNotebookCellReplacement(editor, index, index, [cellData]);
  bridgeState.lastMutation = {
    operation: append ? "cell.append" : "cell.insert",
    at: new Date().toISOString(),
    notebookUri: notebookUri(editor),
    target: { index },
    index,
    source: "bridge",
    lastMutationApplied: true,
    lastMutationObservedAt: new Date().toISOString()
  };
  const updatedEditor = getEditorOrThrow();
  const insertedCell = updatedEditor.notebook.cellAt(index);
  if (!toBoolean(payload.noFollow, false) && shouldFollowTargetCell(false)) {
    await selectCell(updatedEditor, index, { reveal: true });
  }
  return okResponse(append ? "cell.append" : "cell.insert", {
    cell: serializeCell(insertedCell, index),
    applied: true,
    identityStable: true,
    summary: `${append ? "Appended" : "Inserted"} cell at ${index}`
  });
}

async function updateCell(payload) {
  const editor = getEditorOrThrow();
  const target = findCell(editor, payload);
  const nextData = cloneCellData(target.cell, {
    kind: payload.kind,
    source: payload.source !== undefined ? payload.source : target.cell.document.getText(),
    metadata: payload.metadata !== undefined ? payload.metadata : target.cell.metadata
  });
  await applyNotebookCellReplacement(editor, target.index, target.index + 1, [nextData]);
  bridgeState.lastMutation = {
    operation: "cell.update",
    at: new Date().toISOString(),
    notebookUri: notebookUri(editor),
    target: { index: target.index, id: cellId(target.cell) },
    index: target.index,
    source: "bridge",
    lastMutationApplied: true,
    lastMutationObservedAt: new Date().toISOString()
  };
  const refreshedCell = getEditorOrThrow().notebook.cellAt(target.index);
  if (!toBoolean(payload.noFollow, false) && shouldFollowTargetCell(false)) {
    await selectCell(getEditorOrThrow(), target.index, { reveal: true });
  }
  return okResponse("cell.update", {
    cell: serializeCell(refreshedCell, target.index),
    applied: true,
    identityStable: true,
    summary: `Updated cell ${target.index}`
  });
}

async function deleteCells(payload) {
  const editor = getEditorOrThrow();
  const indexes = arrayValue(payload.indexes || payload.indices || payload.index)
    .map((value) => toInteger(value))
    .filter((value) => value !== null)
    .sort((a, b) => a - b);
  if (indexes.length === 0) {
    const target = findCell(editor, payload);
    indexes.push(target.index);
  }
  const uniqueIndexes = [...new Set(indexes)];
  for (const index of uniqueIndexes) {
    if (index < 0 || index >= editor.notebook.cellCount) {
      throw structuredError("CELL_INDEX_OUT_OF_RANGE", `Cell index out of range: ${index}`);
    }
  }
  for (let i = uniqueIndexes.length - 1; i >= 0; i -= 1) {
    const index = uniqueIndexes[i];
    await applyNotebookCellReplacement(editor, index, index + 1, []);
  }
  bridgeState.lastMutation = {
    operation: "cell.delete",
    at: new Date().toISOString(),
    notebookUri: notebookUri(editor),
    target: { indexes: uniqueIndexes },
    indexes: uniqueIndexes,
    source: "bridge",
    lastMutationApplied: true,
    lastMutationObservedAt: new Date().toISOString()
  };
  return okResponse("cell.delete", {
    result: { deletedIndexes: uniqueIndexes },
    summary: `Deleted ${uniqueIndexes.length} cell(s)`
  });
}

async function moveCell(payload) {
  const editor = getEditorOrThrow();
  const target = findCell(editor, payload);
  const allCells = getNotebookCells(editor);
  const destinationIndex =
    payload.toIndex !== undefined
      ? toInteger(payload.toIndex)
      : payload.direction === "up"
        ? target.index - 1
        : payload.direction === "down"
          ? target.index + 1
          : null;
  if (destinationIndex === null || destinationIndex < 0 || destinationIndex >= allCells.length) {
    throw structuredError("CELL_INDEX_OUT_OF_RANGE", `Destination index out of range: ${destinationIndex}`);
  }
  const cellDatas = allCells.map((cell) => cloneCellData(cell));
  const [moved] = cellDatas.splice(target.index, 1);
  cellDatas.splice(destinationIndex, 0, moved);
  await applyNotebookCellReplacement(editor, 0, allCells.length, cellDatas);
  bridgeState.lastMutation = {
    operation: "cell.move",
    at: new Date().toISOString(),
    notebookUri: notebookUri(editor),
    target: { from: target.index, to: destinationIndex, id: cellId(target.cell) },
    from: target.index,
    to: destinationIndex,
    source: "bridge",
    lastMutationApplied: true,
    lastMutationObservedAt: new Date().toISOString()
  };
  if (!toBoolean(payload.noFollow, false) && shouldFollowTargetCell(false)) {
    await selectCell(getEditorOrThrow(), destinationIndex, { reveal: true });
  }
  return okResponse("cell.move", {
    result: { from: target.index, to: destinationIndex },
    summary: `Moved cell ${target.index} to ${destinationIndex}`
  });
}

async function duplicateCell(payload) {
  const editor = getEditorOrThrow();
  const target = findCell(editor, payload);
  const duplicate = cloneCellData(target.cell);
  const insertIndex = toInteger(payload.toIndex, target.index + 1);
  await applyNotebookCellReplacement(editor, insertIndex, insertIndex, [duplicate]);
  bridgeState.lastMutation = {
    operation: "cell.duplicate",
    at: new Date().toISOString(),
    notebookUri: notebookUri(editor),
    target: { from: target.index, to: insertIndex, id: cellId(target.cell) },
    from: target.index,
    to: insertIndex,
    source: "bridge",
    lastMutationApplied: true,
    lastMutationObservedAt: new Date().toISOString()
  };
  const inserted = getEditorOrThrow().notebook.cellAt(insertIndex);
  if (!toBoolean(payload.noFollow, false) && shouldFollowTargetCell(false)) {
    await selectCell(getEditorOrThrow(), insertIndex, { reveal: true });
  }
  return okResponse("cell.duplicate", {
    cell: serializeCell(inserted, insertIndex),
    summary: `Duplicated cell ${target.index} to ${insertIndex}`
  });
}

async function selectTargetCell(payload, revealOnly = false) {
  const editor = getEditorOrThrow();
  const target = findCell(editor, payload);
  const range = new vscode.NotebookRange(target.index, target.index + 1);
  if (!revealOnly) {
    editor.selections = [range];
  }
  if (!toBoolean(payload.noFollow, false) && (revealOnly || shouldFollowTargetCell(true))) {
    await revealCellSmoothly(editor, target.index, { forceReveal: true });
  }
  return okResponse(revealOnly ? "cell.reveal" : "cell.select", {
    cell: serializeCell(target.cell, target.index),
    selection: activeNotebookInfo(editor).selection,
    summary: `${revealOnly ? "Revealed" : "Selected"} cell ${target.index}`
  });
}

async function replaceOutputs(payload) {
  const editor = getEditorOrThrow();
  const target = findCell(editor, payload);
  const outputs = buildOutputs(payload.outputs || []);
  await applyNotebookMetadataEdit(editor, [vscode.NotebookEdit.updateCellOutputs(target.index, outputs)]);
  bridgeState.lastMutation = {
    operation: "cell.replaceOutputs",
    at: new Date().toISOString(),
    notebookUri: notebookUri(editor),
    target: { index: target.index, id: cellId(target.cell) },
    index: target.index,
    source: "bridge",
    lastMutationApplied: true,
    lastMutationObservedAt: new Date().toISOString()
  };
  const refreshedCell = getEditorOrThrow().notebook.cellAt(target.index);
  if (!toBoolean(payload.noFollow, false) && shouldFollowTargetCell(false)) {
    await selectCell(getEditorOrThrow(), target.index, { reveal: true });
  }
  return okResponse("cell.replaceOutputs", {
    cell: serializeCell(refreshedCell, target.index),
    summary: `Replaced outputs for cell ${target.index}`
  });
}

async function clearOutputs(payload) {
  const editor = getEditorOrThrow();
  if (toBoolean(payload.all, false)) {
    await executeCommand("notebook.clearAllCellsOutputs", [], { kind: "notebook" });
    bridgeState.lastMutation = {
      operation: "cell.clearOutputs",
      at: new Date().toISOString(),
      notebookUri: notebookUri(editor),
      target: { all: true },
      all: true,
      source: "bridge",
      lastMutationApplied: true,
      lastMutationObservedAt: new Date().toISOString()
    };
    return okResponse("cell.clearOutputs", {
      result: { all: true },
      summary: "Cleared outputs for all cells"
    });
  }
  return withCellSelection(
    editor,
    payload,
    async (target) => {
      await executeCommand("notebook.cell.clearOutputs", [], { kind: "notebook" });
      bridgeState.lastMutation = {
        operation: "cell.clearOutputs",
        at: new Date().toISOString(),
        notebookUri: notebookUri(editor),
        target: { index: target.index, id: cellId(target.cell) },
        index: target.index,
        source: "bridge",
        lastMutationApplied: true,
        lastMutationObservedAt: new Date().toISOString()
      };
      const refreshed = getEditorOrThrow().notebook.cellAt(target.index);
      return okResponse("cell.clearOutputs", {
        cell: serializeCell(refreshed, target.index),
        summary: `Cleared outputs for cell ${target.index}`
      });
    },
    { restoreSelection: toBoolean(payload.restoreSelection, false) }
  );
}

async function batchCellOperations(payload) {
  const operations = arrayValue(payload.operations || payload.ops);
  if (operations.length === 0) {
    throw structuredError("BATCH_OPERATIONS_REQUIRED", "Batch operations are required");
  }

  const results = [];
  for (const operation of operations) {
    const kind = textValue(operation.op || operation.action);
    const request = { ...operation, noFollow: operation.noFollow !== undefined ? operation.noFollow : true };
    switch (kind) {
      case "insert":
        results.push(await insertCell(request, false));
        break;
      case "append":
        results.push(await insertCell(request, true));
        break;
      case "update":
        results.push(await updateCell(request));
        break;
      case "delete":
        results.push(await deleteCells(request));
        break;
      case "move":
        results.push(await moveCell(request));
        break;
      case "duplicate":
        results.push(await duplicateCell(request));
        break;
      case "select":
        results.push(await selectTargetCell(request, false));
        break;
      case "reveal":
        results.push(await selectTargetCell(request, true));
        break;
      case "replaceOutputs":
        results.push(await replaceOutputs(request));
        break;
      case "clearOutputs":
        results.push(await clearOutputs(request));
        break;
      default:
        throw structuredError("BATCH_OPERATION_NOT_SUPPORTED", `Unsupported batch operation: ${kind}`);
    }
  }

  return okResponse("cell.batch", {
    result: {
      count: operations.length
    },
    results,
    summary: `Applied ${operations.length} batch cell operation(s)`
  }, { includeState: false });
}

async function runNotebookCommandWithLocator(operation, commandId, payload, options = {}) {
  const editor = getEditorOrThrow();
  if (options.useCurrentSelection) {
    await executeCommand(commandId, [], { kind: "execution", target: { selection: "current" } });
    return okResponse(operation, {
      accepted: true,
      pendingObservation: true,
      completionObserved: false,
      outputObserved: false,
      identityStable: true,
      selection: activeNotebookInfo(editor).selection,
      summary: `Execution requested with ${commandId}`
    });
  }
  return withCellSelection(
    editor,
    payload,
    async (target) => {
      await executeCommand(commandId, [], {
        kind: "execution",
        target: { index: target.index, id: cellId(target.cell) }
      });
      return okResponse(operation, {
        cell: serializeCell(target.cell, target.index),
        accepted: true,
        pendingObservation: true,
        completionObserved: false,
        outputObserved: false,
        identityStable: true,
        selection: activeNotebookInfo(editor).selection,
        summary: `Execution requested for cell ${target.index}`
      });
    },
    { restoreSelection: toBoolean(payload.restoreSelection, false) }
  );
}

async function debugNotebookCommand(operation, commandId, payload = {}, options = {}) {
  const editor = getEditorOrThrow();
  if (options.useCurrentSelection) {
    await executeCommand(commandId, [], { kind: "debug", target: { selection: "current" } });
    return okResponse(operation, {
      debug: debugState(editor),
      summary: `Debug command executed: ${commandId}`
    });
  }
  return withCellSelection(
    editor,
    payload,
    async (target) => {
      await executeCommand(commandId, [], {
        kind: "debug",
        target: { index: target.index, id: cellId(target.cell) }
      });
      return okResponse(operation, {
        cell: serializeCell(target.cell, target.index),
        debug: debugState(editor),
        summary: `Debug command executed for cell ${target.index}`
      });
    },
    { restoreSelection: toBoolean(payload.restoreSelection, false) }
  );
}

async function kernelCommand(operation, commandId, payload = {}, options = {}) {
  if (options.useLocator) {
    return runNotebookCommandWithLocator(operation, commandId, payload, {});
  }
  await executeCommand(commandId, [], { kind: "kernel", target: payload || null });
  return okResponse(operation, {
    result: { command: commandId },
    summary: `Kernel command executed: ${commandId}`
  });
}

async function notebookCommand(operation, commandId) {
  const editor = getEditorOrThrow();
  if (commandId === "save") {
    await editor.notebook.save();
  } else if (commandId === "revert") {
    await executeCommand("workbench.action.files.revert", [], { kind: "notebook" });
  } else if (commandId === "close") {
    await executeCommand("workbench.action.closeActiveEditor", [], { kind: "notebook" });
  } else if (commandId === "focus") {
    await vscode.window.showNotebookDocument(editor.notebook, { preserveFocus: false, preview: false });
    bridgeState.lastNotebookAction = { command: "focus", at: new Date().toISOString() };
  }
  return okResponse(operation, { summary: `Notebook command executed: ${commandId}` });
}

async function kernelShutdown() {
  throw structuredError("KERNEL_SHUTDOWN_UNSUPPORTED", "VS Code does not expose a supported public command for shutting down the current notebook kernel");
}

async function workflowUpdateAndRun(body) {
  const update = await updateCell(body);
  if (toBoolean(body.clearOutputs, false)) {
    await clearOutputs(body);
  }
  const execution = body.useCurrentSelection
    ? await runNotebookCommandWithLocator("workflow.updateAndRun", "notebook.cell.execute", body, { useCurrentSelection: true })
    : await runNotebookCommandWithLocator("workflow.updateAndRun", "notebook.cell.execute", body);
  const observe = normalizeObserveMode(body.observe);
  const includeOutput = toBoolean(body.includeOutput, false);
  let output = null;
  if (includeOutput) {
    output = await readOutput(body, { includeState: false });
  } else if (observe === "outputSummary") {
    output = await readOutput(body, { summaryOnly: true, includeState: false });
  }
  return okResponse("workflow.updateAndRun", {
    mutation: compactMutationResult(update),
    execution: compactExecutionResult(execution, observe),
    output,
    result: {
      mutationApplied: update.applied === true,
      executionAccepted: execution.accepted === true,
      hasOutputs: output ? output.hasOutputs === true : null,
      observe,
      includeOutput
    },
    summary: "Updated and executed target cell through bridge"
  }, { includeState: false });
}

async function workflowInsertAndRun(body) {
  const insert = body.append ? await insertCell(body, true) : await insertCell(body, false);
  const targetIndex = insert.cell.index;
  if (toBoolean(body.clearOutputs, false)) {
    await clearOutputs({ index: targetIndex });
  }
  const execution = await runNotebookCommandWithLocator("workflow.insertAndRun", "notebook.cell.execute", { index: targetIndex });
  const observe = normalizeObserveMode(body.observe);
  const includeOutput = toBoolean(body.includeOutput, false);
  let output = null;
  if (includeOutput) {
    output = await readOutput({ index: targetIndex }, { includeState: false });
  } else if (observe === "outputSummary") {
    output = await readOutput({ index: targetIndex }, { summaryOnly: true, includeState: false });
  }
  return okResponse("workflow.insertAndRun", {
    mutation: compactMutationResult(insert),
    execution: compactExecutionResult(execution, observe),
    output,
    result: {
      insertedIndex: targetIndex,
      mutationApplied: insert.applied === true,
      executionAccepted: execution.accepted === true,
      hasOutputs: output ? output.hasOutputs === true : null,
      observe,
      includeOutput
    },
    summary: "Inserted and executed target cell through bridge"
  }, { includeState: false });
}

function normalizeObserveMode(value) {
  const mode = textValue(value, "completion");
  return ["none", "completion", "outputSummary"].includes(mode) ? mode : "completion";
}

function compactMutationResult(response) {
  return {
    operation: response.operation || null,
    applied: response.applied === true,
    identityStable: response.identityStable !== false,
    cell: response.cell || null,
    summary: response.summary || null
  };
}

function compactExecutionResult(response, observe = "completion") {
  return {
    operation: response.operation || null,
    accepted: response.accepted === true,
    pendingObservation: response.pendingObservation === true,
    completionObserved: observe === "none" ? null : response.completionObserved === true,
    outputObserved: observe === "outputSummary" ? response.outputObserved === true : null,
    identityStable: response.identityStable !== false,
    selection: response.selection || [],
    cell: response.cell || null,
    summary: response.summary || null
  };
}

async function readOutput(locator, options = {}) {
  const active = getEditorOrThrow();
  const target = findCell(active, locator);
  const summaryOnly = options.summaryOnly === true;
  const cell = serializeCell(target.cell, target.index, {
    includeSource: false,
    includeMetadata: false,
    includeOutputs: !summaryOnly,
    outputTextLimit: summaryOnly ? 300 : 4000
  });
  const runtime = activeRuntime(active);
  const hasOutputs = Array.isArray(target.cell.outputs) && target.cell.outputs.length > 0;
  const outputSummary = cellOutputSummary(target.cell);
  const hasError = cellHasErrorOutput(target.cell);
  const inferred = inferredExecutionObservation(active);
  const observedFromBridgeExecution = Boolean(
    bridgeState.lastExecution &&
    bridgeState.lastExecution.notebookUri === notebookUri(active) &&
    inferred.outputObserved &&
    (!runtime || runtime.lastObservedCellIds.length === 0 || runtime.lastObservedCellIds.includes(cell.id))
  );
  const payload = {
    cell,
    hasOutputs,
    hasError,
    outputSummary,
    observedFromBridgeExecution,
    summary: `Collected outputs for cell ${target.index}`
  };
  if (summaryOnly) {
    delete payload.cell.outputs;
    return okResponse("output.summary", payload, {
      includeState: options.includeState !== false ? true : false
    });
  }
  return okResponse("output", payload, {
    includeState: options.includeState !== false ? true : false
  });
}

async function httpGet(url) {
  const editor = activeNotebookEditor();
  switch (url.pathname) {
    case "/status/brief":
      return okResponse("status.brief", {
        notebook: activeNotebookInfo(editor),
        window: windowIdentity(),
        server: {
          host: bridgeState.server.host || getServerConfig().host,
          port: bridgeState.server.port || getServerConfig().port,
          basePort: getServerConfig().port,
          portSpan: getServerConfig().portSpan,
          baseUrl: currentServerBaseUrl()
        },
        status: briefState(editor),
        summary: "Collected brief bridge status"
      }, { includeState: false });
    case "/status":
      return okResponse("status", {
        server: {
          host: bridgeState.server.host || getServerConfig().host,
          port: bridgeState.server.port || getServerConfig().port,
          basePort: getServerConfig().port,
          portSpan: getServerConfig().portSpan,
          allowArbitraryCommands: getServerConfig().allowArbitraryCommands
        },
        commands: QUICK_COMMANDS,
        capabilities: capabilities(),
        execution: executionState(editor),
        debug: debugState(editor)
      });
    case "/servers":
      return okResponse("servers", {
        servers: await discoverLocalServers(),
        summary: "Collected local bridge server list"
      });
    case "/commands": {
      const includeAll = url.searchParams.get("all") === "1";
      return okResponse("commands", { commands: includeAll ? await getAllCommands() : QUICK_COMMANDS });
    }
    case "/capabilities":
      return okResponse("capabilities", capabilities());
    case "/compliance":
      return okResponse("compliance", { compliance: complianceState(editor) });
    case "/notebook": {
      const active = getEditorOrThrow();
      return okResponse("notebook", summarizeNotebook(active, {
        includeSource: toBoolean(url.searchParams.get("includeSource"), true),
        includeMetadata: toBoolean(url.searchParams.get("includeMetadata"), true),
        includeOutputs: toBoolean(url.searchParams.get("includeOutputs"), false)
      }));
    }
    case "/notebook/dirty":
      return okResponse("notebook.dirty", { result: { isDirty: Boolean(editor && editor.notebook.isDirty) } });
    case "/cells": {
      const active = getEditorOrThrow();
      return okResponse("cells", {
        cells: getNotebookCells(active).map((cell, index) => serializeCell(cell, index, {
          includeSource: toBoolean(url.searchParams.get("includeSource"), true),
          includeMetadata: toBoolean(url.searchParams.get("includeMetadata"), true),
          includeOutputs: toBoolean(url.searchParams.get("includeOutputs"), false)
        }))
      });
    }
    case "/cell":
      return readCell({
        index: url.searchParams.get("index"),
        cellId: url.searchParams.get("cellId"),
        id: url.searchParams.get("id"),
        marker: url.searchParams.get("marker"),
        selection: url.searchParams.get("selection")
      }, {
        includeSource: toBoolean(url.searchParams.get("includeSource"), true),
        includeMetadata: toBoolean(url.searchParams.get("includeMetadata"), true),
        includeOutputs: toBoolean(url.searchParams.get("includeOutputs"), true)
      });
    case "/context": {
      const active = getEditorOrThrow();
      return okResponse("context", {
        context: {
          notebook: activeNotebookInfo(active),
          kernel: kernelState(active),
          mutation: mutationState(active),
          execution: executionState(active),
          compliance: complianceState(active),
          cells: getNotebookCells(active).map((cell, index) => serializeCell(cell, index, {
            includeSource: toBoolean(url.searchParams.get("includeSource"), true),
            includeMetadata: toBoolean(url.searchParams.get("includeMetadata"), true),
            includeOutputs: toBoolean(url.searchParams.get("includeOutputs"), false),
            outputTextLimit: 300
          }))
        },
        summary: "Collected full notebook context"
      });
    }
    case "/kernel":
    case "/kernel/state":
      return okResponse("kernel.state", { kernel: kernelState(editor) });
    case "/output/summary":
      return readOutput({
        index: url.searchParams.get("index"),
        cellId: url.searchParams.get("cellId"),
        id: url.searchParams.get("id"),
        marker: url.searchParams.get("marker"),
        selection: url.searchParams.get("selection")
      }, { summaryOnly: true, includeState: false });
    case "/output": {
      return readOutput({
        index: url.searchParams.get("index"),
        cellId: url.searchParams.get("cellId"),
        id: url.searchParams.get("id"),
        marker: url.searchParams.get("marker"),
        selection: url.searchParams.get("selection")
      });
    }
    case "/execution/state":
      return okResponse("execution.state", executionState(editor));
    case "/debug/state":
      return okResponse("debug.state", { debug: debugState(editor) });
    default:
      throw structuredError("NOT_FOUND", `Unknown GET route: ${url.pathname}`);
  }
}

async function httpPost(url, body) {
  switch (url.pathname) {
    case "/execute": {
      const config = getServerConfig();
      const command = body.command;
      if (!command || typeof command !== "string") {
        throw structuredError("COMMAND_REQUIRED", "Missing command");
      }
      if (!isAllowedCommand(command, config)) {
        throw structuredError("COMMAND_NOT_ALLOWED", `Command not allowed: ${command}`);
      }
      return executeBridgeCommand(command, body.args || []);
    }
    case "/executeCellByIndex":
      return executeCellByIndex(body.index, body);
    case "/cell/read":
      return readCell(body, body);
    case "/cell/insert":
      return insertCell(body, false);
    case "/cell/append":
      return insertCell(body, true);
    case "/cell/update":
      return updateCell(body);
    case "/cell/delete":
      return deleteCells(body);
    case "/cell/move":
      return moveCell(body);
    case "/cell/duplicate":
      return duplicateCell(body);
    case "/cell/select":
      return selectTargetCell(body, false);
    case "/cell/reveal":
      return selectTargetCell(body, true);
    case "/cell/replaceOutputs":
      return replaceOutputs(body);
    case "/cell/clearOutputs":
    case "/output/clear":
      return clearOutputs(body);
    case "/cell/batch":
      return batchCells(body);
    case "/workflow/updateAndRun":
      return workflowUpdateAndRun(body);
    case "/workflow/insertAndRun":
      return workflowInsertAndRun(body);
    case "/run/current":
      return runNotebookCommandWithLocator("run.current", "notebook.cell.execute", body, { useCurrentSelection: true });
    case "/run/cell":
      return runNotebookCommandWithLocator("run.cell", "notebook.cell.execute", body);
    case "/run/above":
      return runNotebookCommandWithLocator("run.above", "notebook.cell.executeCellsAbove", body);
    case "/run/below":
      return runNotebookCommandWithLocator("run.below", "notebook.cell.executeCellAndBelow", body);
    case "/run/all":
      await executeCommand("notebook.execute", [], { kind: "execution", target: { scope: "all" } });
      return okResponse("run.all", {
        accepted: true,
        pendingObservation: true,
        completionObserved: false,
        outputObserved: false,
        identityStable: true,
        summary: "Execution requested for entire notebook"
      });
    case "/run/selectedAndAdvance":
      return runNotebookCommandWithLocator("run.selectedAndAdvance", "notebook.cell.executeAndSelectBelow", body, {
        useCurrentSelection: toBoolean(body.useCurrentSelection, false)
      });
    case "/run/precedents":
      return runNotebookCommandWithLocator("run.precedents", "jupyter.runPrecedentCells", body);
    case "/run/dependents":
      return runNotebookCommandWithLocator("run.dependents", "jupyter.runDependentCells", body);
    case "/debug/cell":
      return debugNotebookCommand("debug.cell", "jupyter.debugcell", body);
    case "/debug/continue":
      await executeCommand("jupyter.debugcontinue", [], { kind: "debug" });
      return okResponse("debug.continue", { debug: debugState(), summary: "Debug continue requested" });
    case "/debug/stepOver":
      await executeCommand("jupyter.debugstepover", [], { kind: "debug" });
      return okResponse("debug.stepOver", { debug: debugState(), summary: "Debug step-over requested" });
    case "/debug/stop":
      await executeCommand("jupyter.debugstop", [], { kind: "debug" });
      return okResponse("debug.stop", { debug: debugState(), summary: "Debug stop requested" });
    case "/kernel/interrupt":
      return kernelCommand("kernel.interrupt", "jupyter.interruptkernel", body);
    case "/kernel/restart":
      return kernelCommand("kernel.restart", "jupyter.restartkernel", body);
    case "/kernel/restartAndRunAll":
      return kernelCommand("kernel.restartAndRunAll", "jupyter.restartkernelandrunallcells", body);
    case "/kernel/restartAndRunToCell":
      return kernelCommand("kernel.restartAndRunToCell", "jupyter.restartkernelandrunuptoselectedcell", body, { useLocator: true });
    case "/kernel/shutdown":
      return kernelShutdown();
    case "/kernel/select":
      await executeCommand("notebook.selectKernel", [], { kind: "kernel" });
      return okResponse("kernel.select", { summary: "Kernel picker opened" });
    case "/notebook/save":
      return notebookCommand("notebook.save", "save");
    case "/notebook/revert":
      return notebookCommand("notebook.revert", "revert");
    case "/notebook/closeEditor":
      return notebookCommand("notebook.closeEditor", "close");
    case "/notebook/focus":
      return notebookCommand("notebook.focus", "focus");
    case "/viewer/variables/open":
      await executeCommand("jupyter.openVariableView", [], { kind: "notebook" });
      return okResponse("viewer.variables.open", { summary: "Variable view opened" });
    case "/viewer/data/open":
      await executeCommand("jupyter.showDataViewer", [], { kind: "notebook" });
      return okResponse("viewer.data.open", { summary: "Data Viewer command invoked" });
    case "/viewer/output/open":
      await executeCommand("jupyter.viewOutput", [], { kind: "notebook" });
      return okResponse("viewer.output.open", { summary: "Jupyter output panel opened" });
    case "/interpreter/select":
      await executeCommand("jupyter.selectJupyterInterpreter", [], { kind: "notebook" });
      return okResponse("interpreter.select", { summary: "Interpreter picker opened" });
    default:
      throw structuredError("NOT_FOUND", `Unknown POST route: ${url.pathname}`);
  }
}

async function startServer() {
  if (bridgeServer) {
    refreshControlCenterSoon(0);
    return;
  }
  const config = getServerConfig();
  bridgeServer = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
    try {
      if (!isAuthorized(req, config.token)) {
        jsonResponse(res, 401, responseError(structuredError("UNAUTHORIZED", "Unauthorized"), "auth"));
        return;
      }

      if (req.method === "GET") {
        jsonResponse(res, 200, await httpGet(url));
        return;
      }

      if (req.method === "POST") {
        jsonResponse(res, 200, await httpPost(url, await parseBody(req)));
        return;
      }

      jsonResponse(res, 405, responseError(structuredError("METHOD_NOT_ALLOWED", `Unsupported method: ${req.method}`), "http"));
    } catch (error) {
      log(`Request failed: ${error.stack || error.message}`);
      const payload = responseError(error, `${req.method} ${url.pathname}`);
      const statusCode =
        error.code === "NOT_FOUND"
          ? 404
          : error.code === "UNAUTHORIZED"
            ? 401
            : error.code === "METHOD_NOT_ALLOWED"
              ? 405
              : error.code && error.code.includes("NOT_ALLOWED")
                ? 403
                : error.code && (error.code.includes("NOT_FOUND") || error.code.includes("OUT_OF_RANGE") || error.code.includes("REQUIRED") || error.code.includes("AMBIGUOUS") || error.code.includes("UNSUPPORTED"))
                  ? 400
                  : 500;
      jsonResponse(res, statusCode, payload);
    }
  });

  const candidatePorts = Array.from({ length: Math.max(config.portSpan || 1, 1) }, (_, index) => config.port + index);
  let boundPort = null;
  let lastError = null;

  for (const port of candidatePorts) {
    try {
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          bridgeServer.off("error", onError);
          reject(error);
        };
        bridgeServer.once("error", onError);
        bridgeServer.listen(port, config.host, () => {
          bridgeServer.off("error", onError);
          resolve();
        });
      });
      boundPort = port;
      break;
    } catch (error) {
      lastError = error;
      if (error.code !== "EADDRINUSE") {
        throw error;
      }
    }
  }

  if (boundPort === null) {
    throw lastError || new Error("Unable to bind any bridge port");
  }

  bridgeState.server = {
    host: config.host,
    port: boundPort,
    basePort: config.port,
    portSpan: config.portSpan,
    startedAt: new Date().toISOString()
  };

  log(`Server started at http://${config.host}:${boundPort} for ${JSON.stringify(windowIdentity())}`);
  refreshControlCenterSoon(0);
}

async function stopServer() {
  if (!bridgeServer) {
    refreshControlCenterSoon(0);
    return;
  }
  const server = bridgeServer;
  bridgeServer = undefined;
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  bridgeState.server = {
    host: null,
    port: null,
    basePort: null,
    portSpan: null,
    startedAt: null
  };
  log("Server stopped");
  refreshControlCenterSoon(0);
}

function showStatus() {
  const host = bridgeState.server.host || getServerConfig().host;
  const port = bridgeState.server.port || getServerConfig().port;
  const notebook = activeNotebookInfo();
  const serverRunning = Boolean(bridgeServer);
  vscode.window.showInformationMessage(
    `Data Bridge ${serverRunning ? (localeBundle() === I18N.zh ? "运行中" : "running") : (localeBundle() === I18N.zh ? "已停止" : "stopped")} on http://${host}:${port} | ${localeBundle() === I18N.zh ? "活动笔记本" : "Active notebook"}: ${notebook.hasActiveNotebook ? t("yes") : t("no")}`
  );
  output.show(true);
}

async function copyServerConfig() {
  const host = bridgeState.server.host || getServerConfig().host;
  const port = bridgeState.server.port || getServerConfig().port;
  await vscode.env.clipboard.writeText(JSON.stringify({
    baseUrl: `http://${host}:${port}`,
    token: getServerConfig().token || null,
    endpoints: DEFAULT_ENDPOINTS,
    window: windowIdentity()
  }, null, 2));
  vscode.window.showInformationMessage(localeBundle() === I18N.zh ? "Data Bridge 配置已复制到剪贴板。" : "Data Bridge config copied to clipboard.");
  refreshControlCenterSoon(0);
}

async function runNotebookCommand() {
  const pick = await vscode.window.showQuickPick(QUICK_COMMANDS, {
    placeHolder: "Choose a notebook or Jupyter command to run"
  });
  if (!pick) {
    return;
  }
  try {
    await executeBridgeCommand(pick, []);
    vscode.window.showInformationMessage(`Executed ${pick}`);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to execute ${pick}: ${error.message}`);
  }
}

async function listCommands() {
  const commands = await getAllCommands();
  const picks = await vscode.window.showQuickPick(commands, {
    canPickMany: true,
    placeHolder: "Select commands to inspect"
  });
  if (!picks || picks.length === 0) {
    return;
  }
  output.show(true);
  output.appendLine("Available commands:");
  picks.forEach((item) => output.appendLine(item));
}

module.exports = {
  activate,
  deactivate
};
