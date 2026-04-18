# POI Studio

POI Studio is a mobile-first web app to manage map POIs for roadtrips.

It is designed for local usage and simple shared-hosting deployment:

- PHP backend (JSON file storage)
- Vanilla JavaScript frontend
- Leaflet + OpenStreetMap map layer
- Multi-trip support (`data/trips/<trip-id>.json`)

## Highlights

- Full-screen map UI with mobile collapsible config panel
- Multiple trips, each stored in its own JSON file
- Create new trip in UI, persist only after first saved POI
- Add POIs by map click
- Add POIs from Google Maps links (including short links via server-side resolve)
- Edit POI name and description
- One-click delete (`Loeschen`)
- POI popup includes navigation links
- Current-position button to center map on device location
- Auto-save (toggle) and manual save

## Requirements

- PHP 8.3+ (8.5 recommended for production if available)
- Composer
- PHP extensions: `curl`, `json`

## Quick Start

Install dependencies:

```bash
composer install
```

Run local server:

```bash
composer run serve
```

Open:

- `http://127.0.0.1:3000`

## Testing

Run all tests (Pest):

```bash
composer test
```

Current test scope covers API behavior for:

- health endpoint
- trip listing
- loading a trip
- saving and normalizing trip payloads
- validation errors
- missing trip handling
- legacy migration bootstrap

## Data Model

Trip files are stored in:

- `data/trips/<trip-id>.json`

Trip JSON schema:

```json
{
  "tripName": "Trip Display Name",
  "pois": [
    {
      "name": "Location Name",
      "position": "lat, lng",
      "description": "Short text"
    }
  ]
}
```

`position` is normalized and persisted as string `"lat, lng"`.

## Startup Migration

If `data/trips` is empty on startup, the backend migrates from the first valid legacy file:

1. `data/points.json`
2. `points.json`
3. `pois.json`

The migrated destination file is:

- `data/trips/points.json`

## API

### `GET /api/health`

Returns service health:

```json
{
  "ok": true
}
```

### `GET /api/trips`

Returns available trips:

```json
{
  "trips": [
    {
      "id": "schweden_2026",
      "name": "Schweden 2026",
      "poiCount": 42,
      "updatedAt": "2026-04-18T20:15:00+00:00"
    }
  ]
}
```

### `GET /api/trips/:tripId`

Returns one trip:

```json
{
  "id": "schweden_2026",
  "name": "Schweden 2026",
  "pois": [
    {
      "name": "Location Name",
      "position": "lat, lng",
      "description": "Short text"
    }
  ]
}
```

### `PUT /api/trips/:tripId`

Persists one trip.

Request body:

```json
{
  "tripName": "Trip Display Name",
  "pois": [
    {
      "name": "Location Name",
      "position": "lat, lng",
      "description": "Short text"
    }
  ]
}
```

### `POST /api/maps/resolve`

Resolves redirect-based Google Maps short links.

Request body:

```json
{
  "url": "https://maps.app.goo.gl/..."
}
```

Response body:

```json
{
  "ok": true,
  "url": "https://www.google.com/maps/..."
}
```

## Shared Hosting (`.htaccess`)

The project includes:

- root `.htaccess` to route requests to `public/` and block direct access to internal dirs
- `public/.htaccess` to route non-file requests to `public/index.php`

This enables clean routing without exposing internal source or data folders.

## Project Structure

```text
.
├── .htaccess
├── composer.json
├── data/
│   └── trips/
│       └── <trip-id>.json
├── public/
│   ├── .htaccess
│   ├── app.js
│   ├── index.html
│   ├── index.php
│   ├── router.php
│   └── styles.css
├── src/
│   ├── ApiApp.php
│   ├── ApiException.php
│   ├── ApiResult.php
│   ├── MapsLinkResolver.php
│   └── TripRepository.php
├── tests/
│   └── Feature/
│       └── ApiAppTest.php
└── README.md
```

## FOSS Notes

POI Studio is intended as a Free and Open Source Software project.

## License

Licensed under GNU General Public License v3.0 or later.

See `LICENSE` for full text.
