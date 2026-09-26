import { contextBridge } from "electron";

// Keep this surface minimal; it is the only bridge between renderer and Node.
contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
});
