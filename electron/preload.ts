import { contextBridge, ipcRenderer } from "electron";

// Keep this surface minimal; it is the only bridge between renderer and Node.
contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  // The telemetry API token, kept encrypted by the OS keychain (see main.ts).
  secrets: {
    getTelemetryToken: (): string | null => ipcRenderer.sendSync("telemetry-token:get"),
    setTelemetryToken: (token: string): boolean => ipcRenderer.sendSync("telemetry-token:set", token),
    clearTelemetryToken: (): void => {
      ipcRenderer.sendSync("telemetry-token:clear");
    },
  },
});
