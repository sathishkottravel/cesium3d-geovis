import { createHashRouter } from "react-router";
import { AppLayout } from "./AppLayout";
import { MapView } from "./MapView";
import { TelemetryView } from "./TelemetryView";

// Hash-based: GitHub Pages and Electron's file:// have no server-side rewrites.
export const router = createHashRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <MapView /> },
      { path: "flight-telemetry", element: <TelemetryView /> },
    ],
  },
]);
