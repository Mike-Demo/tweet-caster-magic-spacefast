import { useEffect, useState } from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useNavigate,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LoginPage } from "./Login";
import { DashboardPage } from "./Dashboard";
import { checkSession } from "./api-client";

const queryClient = new QueryClient();

function Root() {
  return <Outlet />;
}

const rootRoute = createRootRoute({ component: Root });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: IndexRedirect,
});

function IndexRedirect() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void checkSession().then((authenticated) => {
      if (cancelled) return;
      setChecking(false);
      void navigate({ to: authenticated ? "/app" : "/login" });
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (checking) return null;
  return null;
}

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app",
  component: ProtectedApp,
});

function ProtectedApp() {
  const navigate = useNavigate();
  const [state, setState] = useState<"checking" | "ok">("checking");

  useEffect(() => {
    let cancelled = false;
    void checkSession().then((authenticated) => {
      if (cancelled) return;
      if (!authenticated) {
        void navigate({ to: "/login" });
      } else {
        setState("ok");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (state !== "ok") return null;
  return <DashboardPage />;
}

const routeTree = rootRoute.addChildren([indexRoute, loginRoute, appRoute]);

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function SpaApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
