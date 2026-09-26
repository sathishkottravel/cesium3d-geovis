// Must be imported before anything that loads Cesium assets.
// Cesium resolves workers/assets relative to this URL (copied by vite.shared.ts).
declare global {
  interface Window {
    CESIUM_BASE_URL?: string;
  }
}

window.CESIUM_BASE_URL = `${import.meta.env.BASE_URL}cesium/`;

export {};
