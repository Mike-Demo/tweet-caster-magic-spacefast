import { AppWebAwesomeLoader } from "@/components/app-webawesome-loader";
import { AppFooter } from "@/components/app-footer";
import { BrandMark } from "@/components/brand-mark";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  clearTweetAppToken,
  getDashboard,
  postNow,
  removeXCredentials,
  saveAutomationSettings,
  saveSourceAccount,
  saveTweetAppToken,
  saveXCredentials,
  setPostStatus,
  syncNow,
  testTweetAppConnection,
  X_ENVIRONMENTS,
  type QueueItem,
  type XEnvironment,
} from "./api-client";
import { logout } from "./api-client";


import { PREVIEW_URL, PUBLISHED_URL, SITE_URL } from "@/lib/structured-data";
import {
  WaBadge,
  WaButton,
  WaCallout,
  WaCard,
  WaCopyButton,
  WaDetails,
  WaDivider,
  WaIcon,
  WaSpinner,
  WaSwitch,
  WaTab,
  WaTabGroup,
  WaTabPanel,
} from "@/design-system/font-awsome-web-awesome-171158";

export function DashboardPage() {
  return <Dashboard />;
}

function statusVariant(status: string): "neutral" | "success" | "warning" | "danger" {
  if (status === "posted") return "success";
  if (status === "failed") return "danger";
  if (status === "skipped") return "warning";
  return "neutral";
}

function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dashboard = useQuery({ queryKey: ["dashboard"], queryFn: () => getDashboard() });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  const run = <T,>(promise: Promise<T>, success?: string) =>
    promise
      .then((value) => {
        setError(null);
        if (success) setMessage(success);
        void refresh();
        return value;
      })
      .catch((cause: unknown) => {
        setMessage(null);
        setError(cause instanceof Error ? cause.message : "Something went wrong.");
      });

  const [username, setUsername] = useState("");
  const [keys, setKeys] = useState({ apiKey: "", apiSecret: "", accessToken: "", accessSecret: "" });

  const [environment, setEnvironment] = useState<XEnvironment>("production");
  const [tweetToken, setTweetToken] = useState("");


  useEffect(() => {
    if (dashboard.data?.settings.tweetUsername) setUsername(dashboard.data.settings.tweetUsername);
  }, [dashboard.data?.settings.tweetUsername]);

  useEffect(() => {
    if (dashboard.data?.activeEnvironment) setEnvironment(dashboard.data.activeEnvironment);
  }, [dashboard.data?.activeEnvironment]);

  const saveAccount = useMutation({
    mutationFn: (value: string) => saveSourceAccount({ data: { username: value } }),
  });
  const saveKeys = useMutation({
    mutationFn: () => saveXCredentials({ data: { ...keys, environment } }),
  });
  const sync = useMutation({ mutationFn: () => syncNow() });
  const saveToken = useMutation({
    mutationFn: () => saveTweetAppToken({ data: { token: tweetToken } }),
  });
  const testToken = useMutation({ mutationFn: () => testTweetAppConnection() });



  if (dashboard.isLoading) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "60vh" }}>
        <WaSpinner style={{ fontSize: "2rem" }} />
      </div>
    );
  }

  const data = dashboard.data;
  const settings = data?.settings;
  const posts = data?.posts ?? [];
  const pending = posts.filter((post) => post.status === "pending");
  const history = posts.filter((post) => post.status !== "pending");
  const slots = data?.credentials ?? [];
  const anyConnected = slots.some((slot) => slot.connected);
  const connectedSlot = slots.find((slot) => slot.connected) ?? null;
  const tweetApp = data?.tweetApp ?? { connected: false, hint: null, needsReconnect: false };

  const environmentLabels: Record<XEnvironment, string> = {
    development: "Development",
    staging: "Staging",
    production: "Production",
  };


  return (
    <>
      <AppWebAwesomeLoader />
      <div className="wa-stack wa-gap-l" style={{ maxWidth: "64rem", margin: "0 auto", padding: "2rem 1.25rem 4rem" }}>
        <header className="wa-cluster" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <span className="wa-cluster wa-gap-xs" style={{ fontWeight: 700, fontSize: "1.15rem" }}>
            <BrandMark /> Crosspost
          </span>
          <WaButton
            appearance="outlined"
            onClick={() => {
              void logout().then(() => {
                queryClient.clear();
                void navigate({ to: "/" });
              });
            }}
          >
            Sign out
          </WaButton>
        </header>

        <h1 style={{ margin: 0, fontSize: "var(--wa-font-size-2xl)" }}>Crosspost dashboard</h1>

        {error ? <WaCallout variant="danger">{error}</WaCallout> : null}
        {message ? <WaCallout variant="success">{message}</WaCallout> : null}

        {!anyConnected || !settings?.tweetUsername ? (
          <WaCallout variant="brand">
            <WaIcon slot="icon" name="circle-info" />
            Finish the two setup steps below and your posts start flowing to X.
          </WaCallout>
        ) : null}

        <WaTabGroup>
          <WaTab panel="setup">Setup</WaTab>
          <WaTab panel="queue">Waiting ({pending.length})</WaTab>
          <WaTab panel="history">History</WaTab>

          <WaTabPanel name="setup">
            <div className="wa-stack wa-gap-l" style={{ paddingTop: "1rem" }}>
              <WaCard>
                <div className="wa-stack wa-gap-m">
                  <h2 style={{ margin: 0 }}>1. Connect your tweet.app account</h2>
                  <p style={{ margin: 0, color: "var(--wa-color-text-quiet)" }}>
                    tweet.app now requires a signed-in token before it will share your posts, so
                    Crosspost needs your own access token. It is stored encrypted and never sent
                    back to your browser.
                  </p>

                  {tweetApp.needsReconnect ? (
                    <WaCallout variant="warning">
                      <WaIcon slot="icon" name="triangle-exclamation" />
                      Your tweet.app connection stopped working. Paste a fresh token to start
                      posting again — automatic posting is paused until you do.
                    </WaCallout>
                  ) : null}

                  <div className="wa-cluster wa-gap-s" style={{ alignItems: "end" }}>
                    <label
                      className="wa-stack wa-gap-2xs"
                      style={{ flex: "1 1 20rem" }}
                      htmlFor="tweet-token"
                    >
                      <span>tweet.app access token</span>
                      <input
                        id="tweet-token"
                        name="tweetToken"
                        type="password"
                        value={tweetToken}
                        placeholder="eyJ…"
                        onChange={(event) => setTweetToken(event.target.value)}
                      />
                    </label>
                    <WaButton
                      variant="brand"
                      disabled={saveToken.isPending}
                      onClick={() =>
                        void run(saveToken.mutateAsync(), "tweet.app connected.").then(() =>
                          setTweetToken(""),
                        )
                      }
                    >
                      Save token
                    </WaButton>
                  </div>

                  {tweetApp.connected ? (
                    <div
                      className="wa-cluster wa-gap-s"
                      style={{ justifyContent: "space-between", alignItems: "center" }}
                    >
                      <span className="wa-cluster wa-gap-xs" style={{ alignItems: "center" }}>
                        <WaBadge variant={tweetApp.needsReconnect ? "warning" : "success"}>
                          {tweetApp.needsReconnect ? "Needs reconnecting" : "Connected"}
                        </WaBadge>
                        <span
                          style={{
                            color: "var(--wa-color-text-quiet)",
                            fontSize: "var(--wa-font-size-s)",
                          }}
                        >
                          token {tweetApp.hint ?? ""}
                        </span>
                      </span>
                      <span className="wa-cluster wa-gap-xs">
                        <WaButton
                          appearance="outlined"
                          disabled={testToken.isPending}
                          onClick={() =>
                            void testToken
                              .mutateAsync()
                              .then((result) => {
                                setError(null);
                                setMessage(result.message);
                                void refresh();
                              })
                              .catch((cause: unknown) => {
                                setMessage(null);
                                setError(
                                  cause instanceof Error ? cause.message : "Test failed.",
                                );
                              })
                          }
                        >
                          Test connection
                        </WaButton>
                        <WaButton
                          appearance="outlined"
                          variant="danger"
                          onClick={() =>
                            void run(clearTweetAppToken(), "tweet.app token removed.")
                          }
                        >
                          Clear token
                        </WaButton>
                      </span>
                    </div>
                  ) : (
                    <span style={{ color: "var(--wa-color-text-quiet)" }}>
                      No tweet.app token saved yet.
                    </span>
                  )}

                  <WaDetails summary="How to find your tweet.app token">
                    <div className="wa-stack wa-gap-2xs">
                      <span>
                        1. Sign in at tweet.app in Chrome, open developer tools (F12), go to the{" "}
                        <strong>Network</strong> tab, tick <strong>Preserve log</strong> and filter
                        to <strong>Fetch/XHR</strong>.
                      </span>
                      <span>
                        2. Reload your feed and click any request to{" "}
                        <code>api.tweet.app/api/…</code>.
                      </span>
                      <span>
                        3. Under <strong>Request Headers</strong>, copy the value after{" "}
                        <code>Authorization: Bearer</code> and paste it above.
                      </span>
                      <span>
                        Tokens expire. If posting stops, come back here and paste a fresh one.
                      </span>
                    </div>
                  </WaDetails>
                </div>
              </WaCard>

              <WaCard>
                <div className="wa-stack wa-gap-m">
                  <h2 style={{ margin: 0 }}>2. The tweet.app account to watch</h2>

                  <div className="wa-cluster wa-gap-s" style={{ alignItems: "end" }}>
                    <label className="wa-stack wa-gap-2xs" style={{ flex: "1 1 16rem" }} htmlFor="tweet-username">
                      <span>Username</span>
                      <input
                        id="tweet-username"
                        name="tweetUsername"
                        value={username}
                        placeholder="demo"
                        onChange={(event) => setUsername(event.target.value)}
                      />
                    </label>

                    <WaButton
                      variant="brand"
                      disabled={saveAccount.isPending}
                      onClick={() => void run(saveAccount.mutateAsync(username), "Account connected.")}
                    >
                      Connect
                    </WaButton>
                  </div>
                  {settings?.tweetUsername ? (
                    <p style={{ margin: 0, color: "var(--wa-color-text-quiet)" }}>
                      Watching @{settings.tweetUsername}
                      {settings.tweetDisplayName ? ` (${settings.tweetDisplayName})` : ""}. Only posts
                      published from now on are sent.
                    </p>
                  ) : null}
                </div>
              </WaCard>

              <WaCard>
                <div className="wa-stack wa-gap-m">
                  <h2 style={{ margin: 0 }}>3. Your X developer keys</h2>
                  <p style={{ margin: 0, color: "var(--wa-color-text-quiet)" }}>
                    You need your own X developer account and your own app — Crosspost never posts
                    through a shared or Crosspost-owned account. Set the app&apos;s user
                    authentication permission to <strong>Read and write</strong>, then paste its
                    four values. Crosspost keeps one set of keys at a time; tell us which mode they
                    came from in X, and test with Development before switching to Production.
                  </p>

                  {connectedSlot ? (
                    <div
                      className="wa-cluster wa-gap-s"
                      style={{ justifyContent: "space-between", alignItems: "center" }}
                    >
                      <span className="wa-cluster wa-gap-xs" style={{ alignItems: "center" }}>
                        <strong>@{connectedSlot.xUsername ?? "unknown"}</strong>
                        <WaBadge variant="success">
                          {environmentLabels[connectedSlot.environment]}
                        </WaBadge>
                        <span
                          style={{
                            color: "var(--wa-color-text-quiet)",
                            fontSize: "var(--wa-font-size-s)",
                          }}
                        >
                          key {connectedSlot.hint ?? ""}
                        </span>
                      </span>
                      <WaButton
                        appearance="outlined"
                        variant="danger"
                        onClick={() =>
                          void run(
                            removeXCredentials({
                              data: { environment: connectedSlot.environment },
                            }),
                            "Keys cleared.",
                          )
                        }
                      >
                        Clear keys
                      </WaButton>
                    </div>
                  ) : (
                    <span style={{ color: "var(--wa-color-text-quiet)" }}>No keys saved yet.</span>
                  )}



                  <WaDetails summary="Key details — what X asks you for">
                  <WaCallout variant="neutral">

                    <span slot="icon" />
                    <div className="wa-stack wa-gap-2xs">
                      <span>
                        The Access Token and Secret act as <strong>you</strong>: anything Crosspost
                        sends appears as a post from the account that owns the app.
                      </span>
                      <span>
                        In the X console, open <strong>Keys &amp; Tokens</strong>. The Consumer Key
                        and Secret Key are the first two values below. Under{" "}
                        <strong>OAuth 1.0 Keys</strong>, generate the Access Token and Secret after
                        setting Read and write — if you change the permission afterwards, regenerate
                        them or posting is refused.
                      </span>
                      <span>
                        The Bearer Token is not used here; it can only read public data, never post.
                      </span>
                      <span>
                        X shows these values only once. Keep them in a password manager —
                        regenerating replaces the old ones.
                      </span>
                      <span>
                        Crosspost stores the four values encrypted, uses them only to publish the
                        posts you approve (or all of them if you turn on automatic posting), and
                        never sends them back to your browser. Removing the keys stops all posting
                        immediately.
                      </span>
                    </div>
                  </WaCallout>

                  <div className="wa-stack wa-gap-2xs">
                    <strong>What X asks you for</strong>
                    <span
                      style={{
                        color: "var(--wa-color-text-quiet)",
                        fontSize: "var(--wa-font-size-s)",
                      }}
                    >
                      On the app&apos;s <em>User authentication settings</em> screen, choose{" "}
                      <strong>Read and write</strong> and{" "}
                      <strong>Web App, Automated App or Bot</strong>, then paste these. X accepts
                      several callback addresses — add the backups too. Crosspost never runs
                      X&apos;s sign-in redirect, so none of them are used for posting, and you can
                      leave &ldquo;Request email from users&rdquo; off.
                    </span>
                    <div className="wa-stack wa-gap-2xs">
                      {(
                        [
                          ["Callback URI / Redirect URL", `${SITE_URL}/x-callback`],
                          ["Callback URI (backup)", `${PUBLISHED_URL}/x-callback`],
                          ["Callback URI (preview)", `${PREVIEW_URL}/x-callback`],
                          ["Website URL", SITE_URL],
                          ["Terms of Service", `${SITE_URL}/terms`],
                          ["Privacy Policy", `${SITE_URL}/privacy`],
                        ] as const
                      ).map(([label, value]) => (
                        <div key={label} className="wa-cluster wa-gap-2xs">
                          <span style={{ fontSize: "var(--wa-font-size-s)" }}>{label}:</span>
                          <code style={{ fontSize: "var(--wa-font-size-s)" }}>{value}</code>
                          <WaCopyButton value={value} copy-label={`Copy ${label}`} />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="wa-cluster wa-gap-s" style={{ fontSize: "var(--wa-font-size-s)" }}>
                    {(
                      [
                        ["https://console.x.com", "Developer Console"],
                        ["https://docs.x.com/x-api/getting-started/getting-access", "Getting access"],
                        [
                          "https://docs.x.com/resources/fundamentals/authentication/overview",
                          "Authentication overview",
                        ],
                        [
                          "https://docs.x.com/resources/fundamentals/authentication/oauth-1-0a/api-key-and-secret",
                          "OAuth 1.0a keys",
                        ],
                      ] as const
                    ).map(([href, label]) => (
                      <a key={href} href={href} target="_blank" rel="noreferrer">
                        {label}
                      </a>
                    ))}
                  </div>
                  </WaDetails>


                  <div className="wa-stack wa-gap-2xs">
                    <strong>Which mode did you set in X?</strong>
                    <span
                      style={{
                        color: "var(--wa-color-text-quiet)",
                        fontSize: "var(--wa-font-size-s)",
                      }}
                    >
                      Pick the environment your keys came from in the X console. We recommend
                      testing with Development first, checking that a post goes out as expected, and
                      only then swapping in your Production keys.
                    </span>
                    <div className="wa-cluster wa-gap-2xs">
                      {X_ENVIRONMENTS.map((value) => (
                        <WaButton
                          key={value}
                          appearance={environment === value ? "filled" : "outlined"}
                          onClick={() => setEnvironment(value)}
                        >
                          {environmentLabels[value]}
                        </WaButton>
                      ))}
                    </div>
                  </div>


                  <div className="wa-grid" style={{ ["--min-column-size" as string]: "16rem" }}>

                    {(
                      [
                        ["apiKey", "API key", "Consumer Key in the X console"],
                        ["apiSecret", "API key secret", "Secret Key in the X console"],
                        [
                          "accessToken",
                          "Access token",
                          "Under OAuth 1.0 Keys — posts as your own account",
                        ],
                        [
                          "accessSecret",
                          "Access token secret",
                          "Shown once alongside the access token",
                        ],
                      ] as const
                    ).map(([field, label, hint]) => (

                      <label key={field} className="wa-stack wa-gap-2xs" htmlFor={`x-cred-${field}`}>
                        <span>{label}</span>
                        <input
                          id={`x-cred-${field}`}
                          name={field}
                          type="password"
                          autoComplete="off"
                          value={keys[field]}
                          onChange={(event) => setKeys({ ...keys, [field]: event.target.value })}
                        />
                        <small style={{ color: "var(--wa-color-text-quiet)" }}>{hint}</small>
                      </label>

                    ))}
                  </div>

                  <div>
                    <WaButton
                      variant="brand"
                      disabled={saveKeys.isPending}
                      onClick={() =>
                        void run(
                          saveKeys.mutateAsync(),
                          `${environmentLabels[environment]} keys checked with X and saved.`,
                        ).then(() =>
                          setKeys({ apiKey: "", apiSecret: "", accessToken: "", accessSecret: "" }),
                        )
                      }
                    >
                      Check and save
                    </WaButton>
                  </div>

                </div>
              </WaCard>

              <WaCard>
                <div className="wa-stack wa-gap-m">
                  <h2 style={{ margin: 0 }}>4. How it should behave</h2>
                  <WaSwitch
                    checked={settings?.autoPost ?? false}
                    onWaChange={(event: { target: HTMLInputElement }) =>
                      void run(
                        saveAutomationSettings({
                          data: {
                            autoPost: event.target.checked,
                            skipReplies: settings?.skipReplies ?? true,
                            skipQuotes: settings?.skipQuotes ?? false,
                            longPostMode: settings?.longPostMode ?? "truncate",
                          },
                        }),
                        "Saved.",
                      )
                    }
                  >
                    Post to X automatically (otherwise everything waits for your approval)
                  </WaSwitch>
                  <WaSwitch
                    checked={settings?.skipReplies ?? true}
                    onWaChange={(event: { target: HTMLInputElement }) =>
                      void run(
                        saveAutomationSettings({
                          data: {
                            autoPost: settings?.autoPost ?? false,
                            skipReplies: event.target.checked,
                            skipQuotes: settings?.skipQuotes ?? false,
                            longPostMode: settings?.longPostMode ?? "truncate",
                          },
                        }),
                        "Saved.",
                      )
                    }
                  >
                    Skip replies
                  </WaSwitch>
                  <WaSwitch
                    checked={settings?.skipQuotes ?? false}
                    onWaChange={(event: { target: HTMLInputElement }) =>
                      void run(
                        saveAutomationSettings({
                          data: {
                            autoPost: settings?.autoPost ?? false,
                            skipReplies: settings?.skipReplies ?? true,
                            skipQuotes: event.target.checked,
                            longPostMode: settings?.longPostMode ?? "truncate",
                          },
                        }),
                        "Saved.",
                      )
                    }
                  >
                    Skip quote posts
                  </WaSwitch>
                  <label className="wa-stack wa-gap-2xs" style={{ maxWidth: "22rem" }} htmlFor="long-post-mode">
                    <span>Posts longer than X allows</span>
                    <select
                      id="long-post-mode"
                      name="longPostMode"
                      value={settings?.longPostMode ?? "truncate"}

                      onChange={(event) =>
                        void run(
                          saveAutomationSettings({
                            data: {
                              autoPost: settings?.autoPost ?? false,
                              skipReplies: settings?.skipReplies ?? true,
                              skipQuotes: settings?.skipQuotes ?? false,
                              longPostMode: event.target.value,
                            },
                          }),
                          "Saved.",
                        )
                      }
                    >
                      <option value="truncate">Shorten them to fit</option>
                      <option value="skip">Leave them out</option>
                    </select>
                  </label>
                </div>
              </WaCard>
            </div>
          </WaTabPanel>

          <WaTabPanel name="queue">
            <div className="wa-stack wa-gap-m" style={{ paddingTop: "1rem" }}>
              <div className="wa-cluster" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--wa-color-text-quiet)" }}>
                  {settings?.lastSyncedAt
                    ? `Last checked ${new Date(settings.lastSyncedAt).toLocaleString()}`
                    : "Not checked yet"}
                </span>
                <WaButton
                  variant="brand"
                  appearance="outlined"
                  disabled={sync.isPending}
                  onClick={() =>
                    void run(sync.mutateAsync()).then((result) => {
                      if (result) setMessage(result.message);
                    })
                  }
                >
                  <WaIcon slot="start" name="rotate" /> Check for new posts
                </WaButton>
              </div>

              {pending.length === 0 ? (
                <WaCallout>Nothing waiting. New tweet.app posts show up here.</WaCallout>
              ) : (
                pending.map((post) => (
                  <PostCard key={post.id} post={post}>
                    <WaButton
                      variant="brand"
                      onClick={() => void run(postNow({ data: { id: post.id } }), "Sent to X.")}
                    >
                      Post to X
                    </WaButton>
                    <WaButton
                      appearance="outlined"
                      onClick={() =>
                        void run(
                          setPostStatus({ data: { id: post.id, status: "skipped" } }),
                          "Skipped.",
                        )
                      }
                    >
                      Skip
                    </WaButton>
                  </PostCard>
                ))
              )}
            </div>
          </WaTabPanel>

          <WaTabPanel name="history">
            <div className="wa-stack wa-gap-m" style={{ paddingTop: "1rem" }}>
              {history.length === 0 ? (
                <WaCallout>Nothing has been sent yet.</WaCallout>
              ) : (
                history.map((post) => (
                  <PostCard key={post.id} post={post}>
                    {post.xPostId ? (
                      <WaButton
                        appearance="outlined"
                        href={`https://x.com/i/web/status/${post.xPostId}`}
                        target="_blank"
                      >
                        View on X
                      </WaButton>
                    ) : null}
                    {post.status !== "posted" ? (
                      <WaButton
                        appearance="outlined"
                        onClick={() =>
                          void run(
                            setPostStatus({ data: { id: post.id, status: "pending" } }),
                            "Back in the queue.",
                          )
                        }
                      >
                        Try again
                      </WaButton>
                    ) : null}
                  </PostCard>
                ))
              )}
            </div>
          </WaTabPanel>
        </WaTabGroup>
      </div>
      <AppFooter />
    </>
  );
}

function PostCard({ post, children }: { post: QueueItem; children?: React.ReactNode }) {
  return (
    <WaCard>
      <div className="wa-stack wa-gap-s">
        <div className="wa-cluster" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "var(--wa-color-text-quiet)", fontSize: "0.9rem" }}>
            {new Date(post.sourceCreatedAt).toLocaleString()}
          </span>
          <WaBadge variant={statusVariant(post.status)}>{post.status}</WaBadge>
        </div>
        <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{post.sourceText}</p>
        {post.error ? (
          <span style={{ color: "var(--wa-color-danger-fill-loud)", fontSize: "0.9rem" }}>
            {post.error}
          </span>
        ) : null}
        <WaDivider />
        <div className="wa-cluster wa-gap-s">{children}</div>
      </div>
    </WaCard>
  );
}
