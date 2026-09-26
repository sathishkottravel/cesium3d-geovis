# Navigation WASM binaries

Drop the compiled navigation modules here. They are served at `<base>/wasm/` in both the web and Electron builds.

| File | Transport (`VITE_TRANSPORT`) |
| --- | --- |
| `navigation-standalone.wasm` | `standalone` |
| `navigation-msfs.wasm` | `msfs` |

Until real binaries are added, the WASM transports report a "WASM module not found" error in the UI. The `api` transport doesn't need them.
