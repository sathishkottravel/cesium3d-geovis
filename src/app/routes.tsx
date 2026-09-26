import type { ReactElement } from "react";
import { MapView } from "./MapView";

export interface AppRoute {
  path: string;
  element: ReactElement;
}

// Single route for now; swap in a router (react-router, TanStack) when more views exist.
// Use a hash-based router: GitHub Pages and Electron's file:// have no server-side rewrites.
export const routes: AppRoute[] = [{ path: "/", element: <MapView /> }];
