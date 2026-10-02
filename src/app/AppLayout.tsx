import { NavLink, Outlet } from "react-router";

/** Mode switcher shared by every page. */
export function AppLayout() {
  return (
    <>
      <nav className="app-nav" aria-label="Mode">
        <NavLink to="/" end>
          Route planner
        </NavLink>
        <NavLink to="/flight-telemetry">Flight telemetry</NavLink>
      </nav>
      <Outlet />
    </>
  );
}
