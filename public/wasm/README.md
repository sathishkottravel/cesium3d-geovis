# Navigation WASM binaries

Compiled Navigraph navigation data interface modules. They are served at `<base>/wasm/` in both the web and Electron builds.

| File | Transport (`VITE_TRANSPORT`) | Status |
| --- | --- | --- |
| `standalone/mock/standalone_navigation_data_interface.wasm` | `standalone` | Works in the browser and Electron. Needs WASI plus the `navigraph.send_message` import, both provided by `src/navigation/navigraph/NavigraphWasmHost.ts` |
| `standalone/remote/standalone_navigation_data_interface.wasm` | `standalone_remote` | Same as `standalone`, plus the `navigraph.fetch` import and a navigation data package downloaded at runtime (see the main README) |
| `msfs-2020/msfs_navigation_data_interface.wasm` | `msfs` | MSFS gauge module. It imports MSFS SDK functions (`fsCommBus*`, `fsNetworkHttpRequest*`) that are not provided yet, so it fails to instantiate |

The mock standalone build embeds a mock database: AIRAC cycle 2401, with 16 airports in Mexico and Central America (e.g. `MGGT`, `MMUN`, `MSLP`).

The `api` transport doesn't use these files.
