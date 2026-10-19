# Vòng quay màu hồng

A Vietnamese gift-pair spinner for class 8A1, with 22 male and 33 female participants. The app is plain HTML, CSS and JavaScript; there is no build step or dependency installation.

## Run locally

From this folder, run `python3 -m http.server 4173`, then visit `http://localhost:4173`. Serve the files over HTTP because the app fetches its roster.

## Edit the roster

The app always fetches `data/students.json` from the published GitHub project. It does not use browser roster overrides. Update this file in the repository to change the class name or participants.

Open **Danh sách** or `/edit/` to edit and export JSON. Replace the repository's `data/students.json` with the downloaded file, then publish the update. Downloading alone does not change the live site.

The existing pairing rules are preserved: excluded entries are omitted, optional numeric `exclusiveID` values restrict compatibility, and matching exclusive pairs with equal `priority` are reserved for that numbered draw in each round. Other eligible pairs are randomly selected. This is not a uniformly random draw across the entire roster.

Each draw can reroll the female participant once while keeping the male wheel fixed. Only an accepted result updates history and consumes the draw. The wheels keep pointing at the confirmed winners until the next draw. **Bắt đầu lại** clears the current results and history; the selected theme stays in place. History lasts until the page reloads.

## Check

With Node.js 22.7 or later, run:

```sh
node --test tests/*.test.mjs
git diff --check
```

Tests cover roster round trips and export validation, pairing constraints and round scheduling, wheel winner alignment and reduced motion, and UI state/history behavior. Also check both pages in a browser at desktop and mobile widths before publishing.
