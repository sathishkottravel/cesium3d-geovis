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

  describe("desktop app (OS keychain)", () => {
    function keychain(available = true) {
      let token: string | null = null;
      return {
        get token() {
          return token;
        },
        getTelemetryToken: () => token,
        setTelemetryToken: (t: string) => {
          if (available) token = t;
          return available;
        },
        clearTelemetryToken: () => {
          token = null;
        },
      };
    }

    it("keeps a remembered token in the keychain, never in localStorage", () => {
      const s = { ...stores(), keychain: keychain() };
      saveTelemetrySettings(s, { source: "api", graphqlUrl: DEFAULT_URL, token: "s3cret", remember: true });
      expect(s.keychain.token).toBe("s3cret");
      expect(s.local.items.get(TELEMETRY_SETTINGS_KEY)).not.toContain("s3cret");
      // Next start: localStorage plus the keychain.
      expect(loadTelemetrySettings({ local: s.local, keychain: s.keychain }, DEFAULT_URL)).toMatchObject({
        token: "s3cret",
        remember: true,
      });
    });

    it("removes it from the keychain when not remembered or forgotten", () => {
      const s = { ...stores(), keychain: keychain() };
      saveTelemetrySettings(s, { source: "api", graphqlUrl: DEFAULT_URL, token: "s3cret", remember: true });
      saveTelemetrySettings(s, { source: "api", graphqlUrl: DEFAULT_URL, token: "s3cret", remember: false });
      expect(s.keychain.token).toBeNull();
      saveTelemetrySettings(s, { source: "api", graphqlUrl: DEFAULT_URL, token: "s3cret", remember: true });
      clearTelemetrySettings(s);
      expect(s.keychain.token).toBeNull();
    });

    it("doesn't fall back to plain text without a keychain: the token stays for the session", () => {
      const s = { ...stores(), keychain: keychain(false) };
      saveTelemetrySettings(s, { source: "api", graphqlUrl: DEFAULT_URL, token: "s3cret", remember: true });
      expect(s.local.items.get(TELEMETRY_SETTINGS_KEY)).not.toContain("s3cret");
      expect(loadTelemetrySettings(s, DEFAULT_URL)).toMatchObject({ token: "s3cret", remember: false });
      // A new session has no token.
      expect(loadTelemetrySettings({ local: s.local, keychain: s.keychain }, DEFAULT_URL).token).toBe("");
    });
  });

  it("masks secrets, revealing at most 4 characters", () => {
    expect(maskSecret("")).toBe("");
    expect(maskSecret("short")).toBe("•••");
    expect(maskSecret("abcdefghijklmnop")).toBe("abcd…•••");
  });
});
