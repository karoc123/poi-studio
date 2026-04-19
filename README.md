# POI Studio

POI Studio is a mobile-first web app to manage map POIs for roadtrips.

It is designed for local usage and simple shared-hosting deployment:

- PHP backend (JSON file storage)
- Vanilla JavaScript frontend
- Leaflet + OpenStreetMap map layer
- Multi-trip support (`data/trips/<trip-id>.json`)

## Highlights

- Full-screen map UI with full-height slide-in panel (same behavior on mobile and desktop)
- POI panel and config panel can be switched via gear toggle
- Multiple trips, each stored in its own JSON file
- Create new trip in UI, persist only after first saved POI
- Add POIs by map click
- If a popup is open, the next map tap closes it first before creating a new POI
- Add POIs from Google Maps links (including short links via server-side resolve)
- Search POIs by name and description in the active trip
- Edit POI name and description
- One-click delete (`Loeschen`)
- POI popup includes quick edit/close actions and Google Maps navigation link
- Current-position button to center map on device location
- Auto-save (toggle) and manual save

## Requirements

- PHP 8.3+ (8.5 recommended for production if available)
- Composer (for local development/build)
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

Run lint + tests with one command:

```bash
composer run check
```

Current test scope covers API behavior for:

- health endpoint
- trip listing
- loading a trip
- saving and normalizing trip payloads
- validation errors
- missing trip handling
- strict storage in `data/trips/`

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

## Storage Rules

POI data is loaded exclusively from files inside `data/trips/`.

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

## Deploy on Shared Hosting (File Upload Only)

This setup targets classic shared hosting where PHP is available, but deployment is done by uploading files.

Recommended deployment mode for shared hosting: run Composer locally, then upload `vendor/` together with project files.

1. Build dependencies locally:

```bash
composer install --no-dev --optimize-autoloader
```

1. Upload project files via FTP/SFTP, including:

- `index.php`
- `public/`
- `src/`
- `data/`
- `vendor/`
- `.htaccess`
- `public/.htaccess`
- `composer.json` and `composer.lock` (optional but recommended for traceability)

1. Ensure writable storage for trip files:

- `data/trips/` must be writable by the PHP process.

1. Configure web root:

- Preferred: point document root to `public/`.
- Alternative: keep project root as web root and rely on included `.htaccess` rewrite rules.

1. Verify required PHP extensions on hoster:

- `curl`
- `json`

1. Open your domain and validate:

- App UI loads.
- API health endpoint returns success: `/api/health`.

### Troubleshooting: Composer Fails on Shared Host

If host-side `composer install` fails with errors similar to:

"Return type of Symfony\\Component\\Console\\Helper\\HelperSet::getIterator() ... should be compatible with IteratorAggregate::getIterator()"

then the host likely uses an outdated Composer binary (often Composer 1.x) that is not compatible with newer PHP runtimes.

Use one of these approaches:

1. Preferred: install dependencies locally and upload `vendor/`.

```bash
composer install --no-dev --optimize-autoloader
```

### Troubleshooting: `404` on `/api/trips`

If `https://your-domain/api/trips` returns `404`, your host likely does not apply clean-URL rewrite rules for that request path.

Check these fallback endpoints:

- `/index.php/api/trips`
- `/public/index.php/api/trips`
- `/public/index.php?api=/api/trips`

If one of these works, PHP and the app are fine and only rewrite handling is missing on the host setup.

## Project Structure

```text
.
├── .htaccess
├── composer.json
├── data/
│   └── trips/
│       └── <trip-id>.json
├── index.php
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
