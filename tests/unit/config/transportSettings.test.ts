import { describe, expect, it } from "vitest";
import {
  defaultSettings,
  loadSettings,
  maskSignedUrl,
  saveSettings,
  SETTINGS_STORAGE_KEY,
  validateSettings,
  type SettingsStorage,
  type TransportSettings,
} from "../../../src/config/transportSettings";
import type { TransportKind } from "../../../src/navigation/types";

const defaults: TransportSettings = {
  mode: "mock",
  remote: { packageUrl: "" },
  api: { baseUrl: "http://localhost:3000/api/mock", token: "" },
};

function storageWith(raw: string | null): SettingsStorage {
  return { getItem: () => raw, setItem: () => {} };
}

describe("defaultSettings", () => {
  it.each([
    ["standalone", "mock"],
    ["standalone_remote", "remote"],
    ["api", "api"],
    // Not offered in the UI (the MSFS module cannot run here yet).
    ["msfs", "mock"],
  ] as [TransportKind, string][])("maps VITE_TRANSPORT=%s to mode %s", (transport, mode) => {
    expect(defaultSettings({ transport, apiBaseUrl: "https://a.test" }).mode).toBe(mode);
  });

  it("prefills the API URL from VITE_API_BASE_URL and leaves secrets empty", () => {
    expect(defaultSettings({ transport: "standalone", apiBaseUrl: "https://a.test" })).toEqual({
      mode: "mock",
      remote: { packageUrl: "" },
      api: { baseUrl: "https://a.test", token: "" },
    });
  });
});

describe("loadSettings / saveSettings", () => {
  it("round-trips through storage under a single key", () => {
    const data: Record<string, string> = {};
    const storage: SettingsStorage = { getItem: (k) => data[k] ?? null, setItem: (k, v) => (data[k] = v) };
    const settings: TransportSettings = {
      mode: "remote",
      remote: { packageUrl: "https://pkg.test/a.zip?sig=1" },
      api: { baseUrl: "https://api.test", token: "tok" },
    };
    saveSettings(storage, settings);
    expect(Object.keys(data)).toEqual([SETTINGS_STORAGE_KEY]);
    expect(loadSettings(storage, defaults)).toEqual(settings);
  });

  it.each([
    ["nothing saved", null],
    ["corrupt JSON", "{not json"],
    ["a non-object", "42"],
    ["null", "null"],
  ])("returns defaults for %s", (_label, raw) => {
    expect(loadSettings(storageWith(raw), defaults)).toEqual(defaults);
  });

  it("returns defaults when there is no storage or it throws", () => {
    expect(loadSettings(undefined, defaults)).toEqual(defaults);
    const blocked: SettingsStorage = {
      getItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    };
    expect(loadSettings(blocked, defaults)).toEqual(defaults);
    expect(() => saveSettings(blocked, defaults)).not.toThrow();
  });

  it("fills invalid or missing fields from defaults", () => {
    const raw = JSON.stringify({ mode: "msfs", remote: null, api: { baseUrl: 5, token: "t" } });
    expect(loadSettings(storageWith(raw), defaults)).toEqual({
      mode: "mock",
      remote: { packageUrl: "" },
      api: { baseUrl: defaults.api.baseUrl, token: "t" },
    });
  });
});

describe("validateSettings", () => {
  const withMode = (patch: Partial<TransportSettings>): TransportSettings => ({ ...defaults, ...patch });

  it("accepts mock with anything in the other fields", () => {
    expect(validateSettings(withMode({ mode: "mock", api: { baseUrl: "", token: "" } }))).toEqual({});
  });

  it.each(["https://api.test/v1", "http://localhost:8787"])("accepts api URL %s", (baseUrl) => {
    expect(validateSettings(withMode({ mode: "api", api: { baseUrl, token: "" } }))).toEqual({});
  });

  it.each(["", "api.test", "ftp://api.test", "javascript:alert(1)"])("rejects api URL %j", (baseUrl) => {
    expect(validateSettings(withMode({ mode: "api", api: { baseUrl, token: "" } }))).toHaveProperty("baseUrl");
  });

  it("accepts remote with a signed URL regardless of the API URL", () => {
    const s = withMode({ mode: "remote", remote: { packageUrl: "https://pkg.test/a.zip?sig=1" }, api: { baseUrl: "", token: "" } });
    expect(validateSettings(s)).toEqual({});
  });

  it("rejects a remote package URL that is not http(s)", () => {
    const s = withMode({ mode: "remote", remote: { packageUrl: "file:///etc/passwd" } });
    expect(validateSettings(s)).toHaveProperty("packageUrl");
  });

  it("requires a valid API URL for remote without a signed URL (backend issues it)", () => {
    expect(validateSettings(withMode({ mode: "remote" }))).toEqual({});
    const s = withMode({ mode: "remote", api: { baseUrl: "nope", token: "" } });
    expect(validateSettings(s)).toHaveProperty("baseUrl");
  });
});

describe("maskSignedUrl", () => {
  it.each([
    [
      "masks every query value",
      "https://packages.navigraph.com/navdata/2401.zip?Expires=1700000000&Signature=abc%2Fdef&Key-Pair-Id=K1",
      "https://packages.navigraph.com/navdata/2401.zip?Expires=•••&Signature=•••&Key-Pair-Id=•••",
    ],
    ["keeps URLs without a query", "https://pkg.test/a.zip", "https://pkg.test/a.zip"],
    ["masks user info", "https://user:pass@pkg.test/a.zip", "https://•••@pkg.test/a.zip"],
    ["masks the fragment", "https://pkg.test/a.zip#token=abc", "https://pkg.test/a.zip#•••"],
    ["keeps the port", "http://localhost:9000/a.zip?sig=1", "http://localhost:9000/a.zip?sig=•••"],
    ["masks unparseable input entirely", "not a url sig=secret", "•••"],
    ["is empty for empty input", "  ", ""],
  ])("%s", (_label, input, expected) => {
    expect(maskSignedUrl(input)).toBe(expected);
  });

  it("never contains the secret values", () => {
    const masked = maskSignedUrl("https://pkg.test/a.zip?Signature=SUPERSECRET&Policy=ALSOSECRET#FRAG");
    expect(masked).not.toMatch(/SUPERSECRET|ALSOSECRET|FRAG/);
  });
});
