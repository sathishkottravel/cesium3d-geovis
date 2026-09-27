import { describe, expect, it, vi } from "vitest";
import { NavigationDataInterface } from "../../src/navigation/NavigationDataInterface";
import { NavigraphWasmHost } from "../../src/navigation/navigraph/NavigraphWasmHost";
import { MsfsTransport } from "../../src/navigation/transports/MsfsTransport";
import { StandaloneTransport } from "../../src/navigation/transports/StandaloneTransport";
import { servePublicDir } from "../helpers";

const REMOTE_WASM = "/wasm/standalone/remote/standalone_navigation_data_interface.wasm";
const MSFS_WASM = "/wasm/msfs-2020/msfs_navigation_data_interface.wasm";
const PACKAGE_URL = "https://packages.example.test/navdata.zip?sig=abc";

describe("standalone_remote transport against the remote WASM build", () => {
  it("loads the module with the navigraph.fetch import provided", async () => {
    servePublicDir();
    const host = await NavigraphWasmHost.load(REMOTE_WASM);
    host.dispose();
  });

  it("downloads the package through the host fetch and fails connect when it is unavailable", async () => {
    const fetchMock = servePublicDir((url) =>
      url === PACKAGE_URL ? new Response("gone", { status: 404, statusText: "Not Found" }) : new Response(null, { status: 500 }),
    );
    const getNavdataUrl = vi.fn(async () => PACKAGE_URL);
    const transport = new StandaloneTransport(REMOTE_WASM, { kind: "standalone_remote", getNavdataUrl });
    const nav = new NavigationDataInterface(transport);

    await expect(nav.connect()).rejects.toThrow();
    expect(nav.connectionState).toBe("error");
    expect(getNavdataUrl).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toContain(PACKAGE_URL);
    await nav.disconnect();
  });
});

describe("msfs transport against the MSFS 2020 gauge build", () => {
  it("fails to instantiate without the MSFS SDK imports", async () => {
    servePublicDir();
    const nav = new NavigationDataInterface(new MsfsTransport(MSFS_WASM));

    // No `env` import object is passed, so V8 rejects with a TypeError before linking individual
    // functions. Once MSFS SDK shims exist this becomes a LinkError, then a successful connect.
    await expect(nav.connect()).rejects.toThrow(/module="env"/);
    expect(nav.connectionState).toBe("error");
    expect(nav.error).toBeInstanceOf(Error);
  });
});

describe("missing WASM binary", () => {
  it("surfaces a WasmLoadError pointing at the README", async () => {
    servePublicDir();
    const nav = new NavigationDataInterface(new StandaloneTransport("/wasm/standalone/nope/missing.wasm"));
    await expect(nav.connect()).rejects.toThrow(/HTTP 404.*public\/wasm\/README\.md/);
    expect(nav.connectionState).toBe("error");
  });
});
