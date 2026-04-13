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
  "GET /commands",
  "GET /capabilities",
  "GET /notebook",
  "GET /notebook/dirty",
  "GET /cells",
  "GET /cell",
  "GET /context",
  "GET /kernel",
  "GET /kernel/state",
  "GET /output",
  "GET /execution/state",
  "GET /debug/state",
  "POST /execute",
  "POST /executeCellByIndex",
  "POST /cell/read",
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
  notebookRuntime: {},
  activeNotebook: {
    uri: null,
    switchedAt: null,
    switchCount: 0,
    visibleEditors: 0
  }
};

let bridgeServer;
let output;

function activate(context) {
  output = vscode.window.createOutputChannel("Data Bridge");
  context.subscriptions.push(output);

  context.subscriptions.push(
    vscode.window.onDidChangeActiveNotebookEditor((editor) => {
      updateActiveNotebookIdentity(editor, "active-editor-changed");
    }),
    vscode.window.onDidChangeVisibleNotebookEditors((editors) => {
      bridgeState.activeNotebook.visibleEditors = editors.length;
    }),
    vscode.workspace.onDidChangeNotebookDocument((event) => {
      updateNotebookRuntimeFromEvent(event);
    })
  );

  updateActiveNotebookIdentity(vscode.window.activeNotebookEditor || null, "activate");
  bridgeState.activeNotebook.visibleEditors = vscode.window.visibleNotebookEditors.length;

  context.subscriptions.push(
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
  const envToken = process.env.DATA_BRIDGE_TOKEN || process.env.VSCODE_DATA_BRIDGE_TOKEN;
  return {
    host: envHost || config.get("host", "127.0.0.1"),
    port: toInteger(envPort, config.get("port", 8765)),
    token: envToken !== undefined ? envToken : config.get("token", ""),
    allowArbitraryCommands: config.get("allowArbitraryCommands", false),
    allowedPrefixes: config.get("allowedCommandPrefixes", [])
  };
}

function log(message) {
  output.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
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
      lastObservedNotebookVersion: 0
    };
  }
  return bridgeState.notebookRuntime[uri];
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
  const runtime = notebookRuntimeRecord(uri);
  if (runtime) {
    runtime.lastActivatedAt = bridgeState.activeNotebook.switchedAt;
    runtime.lastIdentityReason = reason;
    runtime.lastSelectionSeenAt = editor && editor.selections ? new Date().toISOString() : runtime.lastSelectionSeenAt;
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
  const outputChanged = event.cellChanges.some((change) => Array.isArray(change.outputs) && change.outputs.length >= 0);
  const executionChanged = event.cellChanges.some((change) => change.executionSummary !== undefined);

  if (outputChanged) {
    runtime.outputChangeCount += 1;
    runtime.lastOutputChangeAt = changedAt;
  }

  if (executionChanged) {
    runtime.executionChangeCount += 1;
    runtime.lastExecutionCompletedAt = changedAt;
    runtime.busy = false;
    runtime.pendingTargets = [];
    if (bridgeState.lastExecution && bridgeState.lastExecution.notebookUri === uri) {
      bridgeState.lastExecution.pendingObservation = false;
      bridgeState.lastExecution.completedAt = changedAt;
    }
  } else if (outputChanged && runtime.pendingTargets.length > 0) {
    runtime.busy = true;
  }

  const observedCells = event.cellChanges
    .filter((change) => change.cell)
    .map((change) => cellId(change.cell));
  if (observedCells.length > 0) {
    runtime.lastObservedCellIds = observedCells;
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
      activeUri: bridgeState.activeNotebook.uri,
      switchedAt: bridgeState.activeNotebook.switchedAt,
      switchCount: bridgeState.activeNotebook.switchCount,
      visibleEditors: bridgeState.activeNotebook.visibleEditors,
      lastActivatedAt: runtime ? runtime.lastActivatedAt : null,
      lastIdentityReason: runtime ? runtime.lastIdentityReason : null
    }
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
  return {
    notebook: activeNotebookInfo(editor),
    kernel: kernelState(editor),
    lastExecution: bridgeState.lastExecution,
    pendingObservation: Boolean(bridgeState.lastExecution && bridgeState.lastExecution.pendingObservation),
    observed: runtime
      ? {
          executionChangeCount: runtime.executionChangeCount,
          outputChangeCount: runtime.outputChangeCount,
          lastDocumentChangeAt: runtime.lastDocumentChangeAt,
          lastObservedExecutionOrder: runtime.lastObservedExecutionOrder,
          lastObservedCellIds: runtime.lastObservedCellIds
        }
      : null
  };
}

function capabilities() {
  return {
    endpoints: DEFAULT_ENDPOINTS,
    commands: QUICK_COMMANDS,
    supports: {
      notebookState: true,
      cellCrud: true,
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

function okResponse(operation, payload = {}) {
  return {
    ok: true,
    operation,
    notebook: activeNotebookInfo(),
    kernel: kernelState(),
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
  edit.replaceNotebookCells(editor.notebook.uri, new vscode.NotebookRange(start, end), cellData);
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
  if (options.reveal !== false) {
    editor.revealRange(range);
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
      notebookUri: currentUri
    };
    if (runtime) {
      runtime.statusKnown = true;
      runtime.busy = true;
      runtime.executionRequestedAt = bridgeState.lastExecution.at;
      runtime.pendingTargets = meta.target ? [meta.target] : [];
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
  bridgeState.lastMutation = { operation: append ? "cell.append" : "cell.insert", at: new Date().toISOString(), index };
  const updatedEditor = getEditorOrThrow();
  const insertedCell = updatedEditor.notebook.cellAt(index);
  return okResponse(append ? "cell.append" : "cell.insert", {
    cell: serializeCell(insertedCell, index),
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
  bridgeState.lastMutation = { operation: "cell.update", at: new Date().toISOString(), index: target.index };
  const refreshedCell = getEditorOrThrow().notebook.cellAt(target.index);
  return okResponse("cell.update", {
    cell: serializeCell(refreshedCell, target.index),
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
  bridgeState.lastMutation = { operation: "cell.delete", at: new Date().toISOString(), indexes: uniqueIndexes };
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
  bridgeState.lastMutation = { operation: "cell.move", at: new Date().toISOString(), from: target.index, to: destinationIndex };
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
  bridgeState.lastMutation = { operation: "cell.duplicate", at: new Date().toISOString(), from: target.index, to: insertIndex };
  const inserted = getEditorOrThrow().notebook.cellAt(insertIndex);
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
  editor.revealRange(range);
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
  bridgeState.lastMutation = { operation: "cell.replaceOutputs", at: new Date().toISOString(), index: target.index };
  const refreshedCell = getEditorOrThrow().notebook.cellAt(target.index);
  return okResponse("cell.replaceOutputs", {
    cell: serializeCell(refreshedCell, target.index),
    summary: `Replaced outputs for cell ${target.index}`
  });
}

async function clearOutputs(payload) {
  const editor = getEditorOrThrow();
  if (toBoolean(payload.all, false)) {
    await executeCommand("notebook.clearAllCellsOutputs", [], { kind: "notebook" });
    bridgeState.lastMutation = { operation: "cell.clearOutputs", at: new Date().toISOString(), all: true };
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
      bridgeState.lastMutation = { operation: "cell.clearOutputs", at: new Date().toISOString(), index: target.index };
      const refreshed = getEditorOrThrow().notebook.cellAt(target.index);
      return okResponse("cell.clearOutputs", {
        cell: serializeCell(refreshed, target.index),
        summary: `Cleared outputs for cell ${target.index}`
      });
    },
    { restoreSelection: toBoolean(payload.restoreSelection, false) }
  );
}

async function runNotebookCommandWithLocator(operation, commandId, payload, options = {}) {
  const editor = getEditorOrThrow();
  if (options.useCurrentSelection) {
    await executeCommand(commandId, [], { kind: "execution", target: { selection: "current" } });
    return okResponse(operation, {
      accepted: true,
      pendingObservation: true,
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

async function httpGet(url) {
  const editor = activeNotebookEditor();
  switch (url.pathname) {
    case "/status":
      return okResponse("status", {
        server: {
          host: getServerConfig().host,
          port: getServerConfig().port,
          allowArbitraryCommands: getServerConfig().allowArbitraryCommands
        },
        commands: QUICK_COMMANDS,
        capabilities: capabilities(),
        execution: executionState(editor),
        debug: debugState(editor)
      });
    case "/commands": {
      const includeAll = url.searchParams.get("all") === "1";
      return okResponse("commands", { commands: includeAll ? await getAllCommands() : QUICK_COMMANDS });
    }
    case "/capabilities":
      return okResponse("capabilities", capabilities());
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
          execution: executionState(active),
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
    case "/output": {
      const active = getEditorOrThrow();
      const target = findCell(active, {
        index: url.searchParams.get("index"),
        cellId: url.searchParams.get("cellId"),
        id: url.searchParams.get("id"),
        marker: url.searchParams.get("marker"),
        selection: url.searchParams.get("selection")
      });
      return okResponse("output", {
        cell: serializeCell(target.cell, target.index, {
          includeSource: false,
          includeMetadata: false,
          includeOutputs: true,
          outputTextLimit: 4000
        }),
        summary: `Collected outputs for cell ${target.index}`
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
      return okResponse("run.all", { accepted: true, pendingObservation: true, summary: "Execution requested for entire notebook" });
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

  await new Promise((resolve, reject) => {
    bridgeServer.once("error", reject);
    bridgeServer.listen(config.port, config.host, () => {
      bridgeServer.off("error", reject);
      resolve();
    });
  });

  log(`Server started at http://${config.host}:${config.port}`);
}

async function stopServer() {
  if (!bridgeServer) {
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
  log("Server stopped");
}

function showStatus() {
  const config = getServerConfig();
  const notebook = activeNotebookInfo();
  const serverRunning = Boolean(bridgeServer);
  vscode.window.showInformationMessage(
    `Data Bridge ${serverRunning ? "running" : "stopped"} on http://${config.host}:${config.port} | Active notebook: ${notebook.hasActiveNotebook ? "yes" : "no"}`
  );
  output.show(true);
}

async function copyServerConfig() {
  const config = getServerConfig();
  await vscode.env.clipboard.writeText(JSON.stringify({
    baseUrl: `http://${config.host}:${config.port}`,
    token: config.token || null,
    endpoints: DEFAULT_ENDPOINTS
  }, null, 2));
  vscode.window.showInformationMessage("Data Bridge config copied to clipboard.");
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
