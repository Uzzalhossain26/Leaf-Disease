<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Storage buckets are private; store object paths in DB and display via signed URLs (workspace blocks public buckets).
- Admin access uses public.user_roles + has_role(); public sign-up is disabled in auth config, so only existing accounts can sign in and the login form has no sign-up path.
- Farmer diagnosis history lives on the device (src/lib/local-history.ts, localStorage) so the public app never needs a login; cloud diagnoses rows remain for admin stats and reports.
- AI second opinion runs in a createServerFn (src/lib/ai-opinion.functions.ts), not a Supabase edge function, and checks the app_settings toggle server-side — keeps the key server-only and stops credit use when admins switch it off.
- PWA is manifest-only with an install banner in AppShell (browser install event, or Add to Home Screen steps on iPhone; rules in src/lib/install-prompt.ts); offline diagnosis relies on MobileNet + reference embeddings cached in IndexedDB — the Lovable TanStack config forbids Workbox/PWA plugins.
- Shared mobile layout and safe-area spacing belong in AppShell and global styles; use shared controls for touch sizing so every page stays consistent.
- Admin-uploaded crop cover photos are stored in the reference-images bucket under covers/ and turned into signed links in cropsQuery; static /crops/* paths and http links are used as-is.
