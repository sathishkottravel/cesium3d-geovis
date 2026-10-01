import { describe, expect, it } from "vitest";
import {
  clearTelemetrySettings,
  loadTelemetrySettings,
  maskSecret,
  saveTelemetrySettings,
  TELEMETRY_SETTINGS_KEY,
  type SettingsStores,
} from "../../../src/telemetry/telemetrySettings";

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

function stores() {
  return { session: memoryStorage(), local: memoryStorage() };
}

const blocked: SettingsStores["session"] = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("SecurityError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};

const DEFAULT_URL = "/telemetry-api/graphql";

describe("telemetry settings", () => {
  it("defaults to the configured URL and no token", () => {
    expect(loadTelemetrySettings(stores(), DEFAULT_URL)).toEqual({
      source: "api",
      graphqlUrl: DEFAULT_URL,
      token: "",
      remember: false,
    });
    expect(loadTelemetrySettings(stores(), DEFAULT_URL, "sample").source).toBe("sample");
  });

  it("keeps the token for the session by default", () => {
    const s = stores();
    saveTelemetrySettings(s, { source: "api", graphqlUrl: "https://x.test/graphql", token: "tok", remember: false });
    expect(s.session.items.has(TELEMETRY_SETTINGS_KEY)).toBe(true);
    expect(s.local.items.has(TELEMETRY_SETTINGS_KEY)).toBe(false);
    expect(loadTelemetrySettings(s, DEFAULT_URL)).toEqual({
      source: "api",
      graphqlUrl: "https://x.test/graphql",
      token: "tok",
      remember: false,
    });
  });

  it("moves the token to localStorage when remembered, and back when not", () => {
    const s = stores();
    saveTelemetrySettings(s, { source: "sample", graphqlUrl: DEFAULT_URL, token: "tok", remember: true });
    expect(s.local.items.has(TELEMETRY_SETTINGS_KEY)).toBe(true);
    expect(s.session.items.has(TELEMETRY_SETTINGS_KEY)).toBe(false);
    // A new tab: only localStorage survives.
    expect(loadTelemetrySettings({ local: s.local }, DEFAULT_URL)).toMatchObject({
      source: "sample",
      token: "tok",
      remember: true,
    });

    saveTelemetrySettings(s, { source: "api", graphqlUrl: DEFAULT_URL, token: "tok", remember: false });
    expect(s.local.items.has(TELEMETRY_SETTINGS_KEY)).toBe(false);
  });

  it("forgets the token everywhere", () => {
    const s = stores();
    saveTelemetrySettings(s, { source: "api", graphqlUrl: DEFAULT_URL, token: "a", remember: true });
    s.session.setItem(TELEMETRY_SETTINGS_KEY, JSON.stringify({ token: "b" }));
    clearTelemetrySettings(s);
    expect(loadTelemetrySettings(s, DEFAULT_URL).token).toBe("");
  });

  it("falls back to defaults when storage is blocked or corrupt", () => {
    const corrupt = memoryStorage();
    corrupt.setItem(TELEMETRY_SETTINGS_KEY, "{not json");
    expect(loadTelemetrySettings({ session: blocked, local: corrupt }, DEFAULT_URL).graphqlUrl).toBe(DEFAULT_URL);
    expect(() => saveTelemetrySettings({ session: blocked, local: blocked }, {
      source: "api",
      graphqlUrl: DEFAULT_URL,
      token: "t",
      remember: false,
    })).not.toThrow();
    expect(() => clearTelemetrySettings({ session: blocked, local: blocked })).not.toThrow();
  });

  it("masks secrets, revealing at most 4 characters", () => {
    expect(maskSecret("")).toBe("");
    expect(maskSecret("short")).toBe("•••");
    expect(maskSecret("abcdefghijklmnop")).toBe("abcd…•••");
  });
});
