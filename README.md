# Vòng quay 8/3

A Vietnamese classroom gift-pair spinner. The app is plain HTML, CSS and JavaScript; there is no build step or dependency installation.

## Run locally

From this folder, run `python3 -m http.server 4173`, then visit `http://localhost:4173`. Serve the files over HTTP because the app fetches its roster.

## Edit the roster

Open **Danh sách lớp** or `/edit/`. Edit the tables, download `students.json`, then replace `data/students.json` in the repository. The editor validates before export; downloading does not update the live site. Keep a copy of the previous file before replacing it.

The existing pairing rules are preserved: excluded entries are omitted, optional numeric `exclusiveID` values restrict compatibility, and matching exclusive pairs with equal `priority` are reserved for that numbered draw in each round. Other eligible pairs are randomly selected. This is not a uniformly random draw across the entire roster.

Each draw can reroll the female participant once while keeping the male participant. Only an accepted result updates history and consumes the draw. **Bắt đầu lại** clears the current results and history; the selected theme stays in place. History lasts until the page reloads.

## Check

With Node.js 22.7 or later, run:

```sh
node --test tests/*.test.mjs
git diff --check
```

Tests cover roster round trips and export validation, pairing constraints and round scheduling, wheel winner alignment and reduced motion, and UI state/history behavior. Also check both pages in a browser at desktop and mobile widths before publishing.
