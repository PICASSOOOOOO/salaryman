/**
 * Stub for the VS Code webview API. The upstream pixel-agents project
 * runs inside a VS Code extension webview and posts messages back to
 * the host via `vscode.postMessage`. We're running in a regular browser
 * so every postMessage is a no-op: the engine still works because we
 * use it read-only (no layout persistence, no agent seat saving, no
 * sound preferences sync).
 */
type Msg = Record<string, unknown>;

export const vscode = {
  postMessage: (_msg: Msg) => {
    /* no-op in browser */
  },
};
