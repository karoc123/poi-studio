# Project Notes

## Scope

- Lightweight POI editor for roadtrips.
- Vanilla JS SPA frontend + PHP API backend.
- Mobile-first behavior is mandatory.

## Data Model

- Trips are file-based in `data/trips/`.
- Trip JSON format uses `tripName: string` and `pois: array`.
- Each POI stores `position` as string `"lat, lng"`.

## UX

- Full-height slide-in panel is used on both mobile and desktop.
- Panel has two modes: POI list view and config view, switched via a gear button.
- POI list must remain fully scrollable in panel view.
- UI language is German.
- POI delete is one-click (`Loeschen`) without confirm button.
- POI detail popup uses custom quick actions (edit pencil + large close button) and a Google Maps web link.
- If a popup is open, first map tap closes popup; next tap creates a new POI.
- Dedicated current-location button exists on map.
- POI can be imported from Google Maps link, including short-link resolve via API.
- POI name/description can be edited.
- POI list supports client-side search by name and description.
- Search UX highlights matching terms in POI name/description.

## Persistence Rules

- New trip creation is local-first.
- A new trip is persisted only after first POI save.
- Auto-save stays enabled by default.
- Manual save button remains available.

## Backend Contract

- `GET /api/health`
- `GET /api/trips`
- `GET /api/trips/:tripId`
- `PUT /api/trips/:tripId`
- Extra helper endpoint for maps short links: `POST /api/maps/resolve`.

## Storage Rules

- Points are loaded exclusively from `data/trips/`.
- Legacy fallback files are intentionally ignored.

## Routing Notes

- Root and public `.htaccess` rules are wrapped in `IfModule mod_rewrite.c`.
- Root rewrite condition uses `REQUEST_URI !/public/` to avoid subpath rewrite loops.
- Front controller normalizes `/index.php/api/*` and `/public/index.php/api/*` for hosts without clean rewrites.
- Front controller also accepts query fallback `?api=/api/...` and returns explicit JSON errors for missing `vendor/autoload.php` or unsupported PHP runtime.
- Frontend API client tries clean URLs first, then query fallback via `index.php?api=...`.
- Frontend API client is query-first to avoid noisy 404 probes on hosts without rewrite support.
- Root `index.php` includes `public/index.php` so `/` works even if root rewrite is unavailable.

## Testing

- Pest feature tests cover health, list/get/save/validate flows and strict trips-only storage behavior.
