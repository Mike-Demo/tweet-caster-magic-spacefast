# Security audit remediation backlog

Issue creation is unavailable in this session, so the issue titles and bodies below are ready to file. This is triage only; no finding has been fixed here.

## Prioritized confirmed findings

There is one confirmed finding, so it is the highest-priority item. It is reachable by anyone who can send a victim a crafted landing-page URL, and can establish a browser session as the attacker's account. No confirmed findings share a root cause.

### `[security][medium] Bind OAuth return tokens to an initiated sign-in flow`

**Parent:** [Security audit 2026-10-21 — prioritize findings and create remediation issues](https://github.com/Mike-Demo/tweet-caster-magic-spacefast/issues/1)

**Fingerprint:** `oauth-url-token-session-fixation`

**Evidence:** On each landing-page load, `consumeOAuthReturn` in `src/routes/index.tsx` reads `access_token` and `refresh_token` from the URL hash or query string. If both are present, it calls `supabase.auth.setSession` and navigates to `/app`. `validateSearch` does not strip or gate these token parameters. There is no state, nonce, PKCE-verifier, or flow-initiation check.

**Root cause:** `consumeOAuthReturn` trusts bearer tokens supplied in the page URL without verifying that the current browser initiated the OAuth flow to which the tokens belong. An attacker with valid tokens for an account they control can use a crafted link to fix a victim's browser into that account's session (login CSRF/session fixation).

**Smallest fix:** In `consumeOAuthReturn` (`src/routes/index.tsx`), stop accepting `access_token`/`refresh_token` from the query string and only establish a session for a flow the app itself initiated: verify the OAuth state/PKCE binding issued by the sign-in flow before calling `setSession`, or remove the manual consumer and rely on the auth library's callback handling for the redirect return.

## Needs-validation checklist issue

### `[security][needs-validation] Audit leads to validate`

**Parent:** [Security audit 2026-10-21 — prioritize findings and create remediation issues](https://github.com/Mike-Demo/tweet-caster-magic-spacefast/issues/1)

Please validate each audit lead and record the requested missing fact. These are not confirmed findings; do not assign severity unless validation establishes one.

- [ ] **hCaptcha gate for sign-up/sign-in is client-enforced only and falls back to hCaptcha's always-pass test keys**  
  Fingerprint: `captcha-gate-client-only-and-test-key-fallback`  
  Claimed root cause: Captcha verification is performed as a client-sequenced, unbound server-function call rather than enforced by Supabase Auth on the `signUp`/`signInWithPassword` requests, and the captcha functions fail open to always-pass test keys when the `HCAPTCHA_*` environment variables are unset.  
  **Exact missing fact:** Whether the deployed Supabase project (project_id `xiniywqounmojcmprwxj` per `supabase/config.toml`) has hCaptcha enforcement enabled in its Auth settings, a dashboard-side setting absent from the repository.

- [ ] **CSP frame-ancestors is delivered only via a `<meta>` tag, which browsers ignore for framing control**  
  Fingerprint: `csp-frame-ancestors-meta-only-clickjacking`  
  Claimed root cause: Framing protection is declared only in a Content-Security-Policy `<meta>` tag (`src/routes/__root.tsx`), which browsers ignore for `frame-ancestors`, while `public/_headers` and `wrangler.jsonc` define no header-delivered CSP `frame-ancestors` or `X-Frame-Options`.  
  **Exact missing fact:** The actual HTTP response headers served for the deployed site by the deployed edge: specifically whether they include a header-delivered Content-Security-Policy with `frame-ancestors` or an `X-Frame-Options` header. This is resolvable only by an owner-observed header capture, not by source inspection.

- [ ] **Unauthenticated `saveThemeDefaults` server function writes caller-supplied CSS to a server file, guarded only by a `NODE_ENV` check**  
  Fingerprint: `save-theme-defaults-unauthenticated-file-write`  
  Claimed root cause: `saveThemeDefaults` (`theme-editor.functions.ts`) exposes an unauthenticated POST server function whose handler `writeBrandCss` (`theme-editor-write.server.ts`) performs a server filesystem write of caller-supplied CSS guarded only by a `NODE_ENV !== 'production'` check instead of an authorization control.  
  **Exact missing fact:** Whether the deployed build actually registers/exposes the `saveThemeDefaults` server-function endpoint, given that no module in `src` imports `theme-editor.functions.ts` and `ThemeEditor` is never rendered by any route; in TanStack Start a server function whose defining module is never imported may not be registered in the built server at all.
