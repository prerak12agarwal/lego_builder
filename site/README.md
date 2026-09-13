# LEGO Builder UI preview

The consumer workbench prototype follows the founder-confirmed mockup direction. Product criteria are in [Product](../Product.md); engineering contracts are in [Architecture](../Architecture.md).

Implemented: responsive sample workbench, session-local photo preview/reordering/view labels, five-stop complexity selection and separate size input, model orbit/zoom/pan/reset, searchable parts with CSV export, and eight directly navigable layer steps. Model, parts and instructions derive from one hand-authored 49-placement revision.

Real conversion, durable project storage, authentication flows, pricing and purchasing are not connected. Photos are never transmitted by this application. Navigation preserves in-memory setup and instruction progress; refresh resets them. Sample part references/colors and physical assembly are not validated for purchasing or construction.

## Development and verification

Requires Node.js 22.14 or later for the test command. From this directory, use the actual package scripts:

- `npm run install:ci` installs the locked dependencies.
- `npm run dev` starts the local preview; use its printed URL.
- `npm run typecheck` checks TypeScript.
- `npm test` checks sample geometry, support, final connectivity, inventory, CSV and instruction coverage, including negative fixtures.
- `npm run build` builds the Worker-compatible site.

Use the installed Sites skills to configure the local execution profile before setup/build/preview and to publish. The portable profile is appropriate on this workstation. The ignored `.sites-runtime/` selection and local development authentication never establish production access control.

## Source and publication

GitHub is the canonical collaboration repository; this directory belongs to `codex/ui-site` and its pull request. Sites requires a separate Git root containing only the app source. Create a clean publication snapshot of this directory, excluding dependencies, local runtime state, `.env` files and generated output from the source commit. Use the existing project ID in `.openai/hosting.json`, commit/push the snapshot with a short-lived Sites credential, and package the build from exactly that source revision. Do not replace GitHub origin, include the parent repository or create another Site.

No D1/R2 bindings or external providers are configured. The retained starter libraries and optional helpers do not imply implemented persistence or account features.
