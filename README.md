# Vòng quay màu hồng

A Vietnamese gift-pair spinner for class 8A1, with 22 male and 33 female participants. The app is plain HTML, CSS and JavaScript; there is no build step or dependency installation.

## Run locally

From this folder, run `python3 -m http.server 4173`, then visit `http://localhost:4173`. Serve the files over HTTP because the app fetches its roster.

## Edit the roster

The app always fetches `data/students.json` from the published GitHub project. It does not use browser roster overrides. Update this file in the repository to change the class name or participants.

Open **Danh sách** or `/edit/`, make changes, then choose **Lưu** and enter the shared password. Visitors do not need a GitHub login. The Supabase `roster-editor` function updates only `data/students.json` on `main`; GitHub Actions then deploys GitHub Pages. Allow the deployment to finish before reloading the live site.

JSON copy/download remains available for backups or manual updates. Downloading alone does not change the live site. If saving reports a version conflict, keep a JSON copy, reload the page, then reapply the changes to the latest roster.

The existing pairing rules are preserved: excluded entries are omitted, optional numeric `exclusiveID` values restrict compatibility, and matching exclusive pairs with equal `priority` are reserved for that numbered draw in each round. Other eligible pairs are randomly selected. This is not a uniformly random draw across the entire roster.

Each draw can reroll the female participant once while keeping the male wheel fixed. Only an accepted result updates history and consumes the draw. The wheels keep pointing at the confirmed winners until the next draw. **Bắt đầu lại** clears the current results and history; the selected theme stays in place. History lasts until the page reloads.

## Maintainer setup

1. Apply `supabase/migrations/20261019163000_roster_editor.sql` to the Supabase project and deploy the `roster-editor` Edge Function using `supabase/config.toml`.
2. Choose the shared password and store only its bcrypt hash in the singleton row of `private.roster_editor_config.password_hash`.
3. Create a fine-grained GitHub personal access token scoped to `Cyrene0/spinningwheel`, with **Contents: Read and write**. Store it in Supabase Vault and reference its secret UUID through `private.roster_editor_config.token_secret_id`. The function restricts writes to the roster file; the token itself is repository scoped.
4. Keep the password, token and service-role credentials out of source files and browser code. Rotate the Vault token before its expiry or if exposed; update the password hash when changing the shared password. The Pages workflow is `.github/workflows/pages.yml`.

## Check

With Node.js 22.7 or later, run:

```sh
node --test tests/*.test.mjs
git diff --check
```

Tests cover roster round trips, export validation, password-save requests and conflicts, pairing constraints and round scheduling, wheel winner alignment and reduced motion, and UI state/history behavior. Also check both pages in a browser at desktop and mobile widths before publishing.
