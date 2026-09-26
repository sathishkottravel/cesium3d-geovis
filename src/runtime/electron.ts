import type { Runtime } from "./runtime";

export const electronRuntime: Runtime = {
  kind: "electron",
  describe: () => {
    const api = window.electronAPI;
    return api ? `Electron ${api.versions.electron} on ${api.platform}` : "Electron";
  },
};
