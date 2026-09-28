import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AppWebAwesomeLoader } from "@/components/app-webawesome-loader";
import { AppFooter } from "@/components/app-footer";
import { BrandMark } from "@/components/brand-mark";
import { login } from "./api-client";
import {
  WaButton,
  WaCallout,
  WaCard,
} from "@/design-system/font-awsome-web-awesome-171158";

export function LoginPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(password);
      await navigate({ to: "/app" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AppWebAwesomeLoader />
      <div
        className="wa-stack wa-gap-l"
        style={{ maxWidth: "28rem", margin: "0 auto", padding: "4rem 1.25rem" }}
      >
        <header className="wa-cluster" style={{ justifyContent: "center" }}>
          <span className="wa-cluster wa-gap-xs" style={{ fontWeight: 700, fontSize: "1.25rem" }}>
            <BrandMark /> Crosspost
          </span>
        </header>

        <WaCard>
          <form onSubmit={submit} className="wa-stack wa-gap-m">
            <h1 style={{ margin: 0, fontSize: "var(--wa-font-size-xl)" }}>Sign in</h1>
            <p style={{ margin: 0, color: "var(--wa-color-text-quiet)" }}>
              Enter your dashboard password to manage your crossposting.
            </p>
            {error ? <WaCallout variant="danger">{error}</WaCallout> : null}
            <label className="wa-stack wa-gap-2xs" htmlFor="password">
              <span>Password</span>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <WaButton variant="brand" type="submit" disabled={busy || password.length === 0}>
              {busy ? "Signing in…" : "Sign in"}
            </WaButton>
          </form>
        </WaCard>
      </div>
      <AppFooter />
    </>
  );
}
