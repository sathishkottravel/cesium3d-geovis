import { app, BrowserWindow, ipcMain, safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
}

// Telemetry API token, encrypted with the OS keychain (Keychain, DPAPI, libsecret/kwallet).
const tokenFile = () => path.join(app.getPath("userData"), "telemetry-token.bin");

/** Linux without a keyring falls back to a plain-text "basic_text" backend, which doesn't count. */
function keychainAvailable(): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false;
  return process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text";
}

// Synchronous so the renderer can load its settings synchronously at startup.
ipcMain.on("telemetry-token:get", (event) => {
  try {
    const file = tokenFile();
    event.returnValue = keychainAvailable() && fs.existsSync(file) ? safeStorage.decryptString(fs.readFileSync(file)) : null;
  } catch {
    event.returnValue = null;
  }
});

ipcMain.on("telemetry-token:set", (event, token: unknown) => {
  if (typeof token !== "string" || !keychainAvailable()) {
    event.returnValue = false;
    return;
  }
  fs.writeFileSync(tokenFile(), safeStorage.encryptString(token), { mode: 0o600 });
  event.returnValue = true;
});

ipcMain.on("telemetry-token:clear", (event) => {
  fs.rmSync(tokenFile(), { force: true });
  event.returnValue = true;
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
