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

- Config panel is collapsible on mobile.
- POI list must remain scrollable in collapsed/open mobile flow.
- UI language is German.
- POI delete is one-click (`Loeschen`) without confirm button.
- POI detail popup includes navigation links (`geo:` and web fallback).
- Dedicated current-location button exists on map.
- POI can be imported from Google Maps link, including short-link resolve via API.
- POI name/description can be edited.

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

## Migration

- If no files exist in `data/trips/`, bootstrap from first valid legacy file:
  1. `data/points.json`
  2. `points.json`
  3. `pois.json`

## Testing

- Pest feature tests cover health, list/get/save/validate flows and legacy migration.
