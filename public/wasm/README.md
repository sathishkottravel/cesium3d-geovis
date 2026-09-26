# Navigation WASM binaries

Compiled Navigraph navigation data interface modules. They are served at `<base>/wasm/` in both the web and Electron builds.

| File | Transport (`VITE_TRANSPORT`) | Status |
| --- | --- | --- |
| `standalone/msfs_navigation_data_interface.wasm` | `standalone` | Works in the browser and Electron. Needs WASI plus the `navigraph.send_message` import, both provided by `src/navigation/navigraph/NavigraphWasmHost.ts` |
| `msfs-2020/msfs_navigation_data_interface.wasm` | `msfs` | MSFS gauge module. It imports MSFS SDK functions (`fsCommBus*`, `fsNetworkHttpRequest*`) that are not provided yet, so it fails to instantiate |

The standalone build embeds a mock database: AIRAC cycle 2401, with 16 airports in Mexico and Central America (e.g. `MGGT`, `MMUN`, `MSLP`).

The `api` transport doesn't use these files.
