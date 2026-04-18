<?php

declare(strict_types=1);

use PoiStudio\ApiApp;
use PoiStudio\TripRepository;

beforeEach(function (): void {
    $this->tempRoot = sys_get_temp_dir() . '/poi-studio-tests-' . bin2hex(random_bytes(6));
    $dataDir = $this->tempRoot . '/data';
    $tripsDir = $dataDir . '/trips';

    mkdir($tripsDir, 0775, true);

    $this->repository = new TripRepository(
        dataDir: $dataDir,
        tripsDir: $tripsDir
    );

    $this->app = new ApiApp($this->repository);
});

afterEach(function (): void {
    deleteDirectory($this->tempRoot);
});

it('returns a healthy response', function (): void {
    $result = $this->app->handle('GET', '/api/health', null);

    expect($result->statusCode)->toBe(200)
        ->and($result->payload)->toBe(['ok' => true]);
});

it('lists available trips', function (): void {
    writeJson(
        $this->tempRoot . '/data/trips/schweden_2026.json',
        [
            'tripName' => 'Schweden 2026',
            'pois' => [
                [
                    'name' => 'Stockholm',
                    'position' => '59.3293, 18.0686',
                    'description' => 'Startpunkt',
                ],
            ],
        ]
    );

    $result = $this->app->handle('GET', '/api/trips', null);

    expect($result->statusCode)->toBe(200)
        ->and($result->payload)->toHaveKey('trips')
        ->and($result->payload['trips'])->toHaveCount(1)
        ->and($result->payload['trips'][0]['id'])->toBe('schweden_2026')
        ->and($result->payload['trips'][0]['name'])->toBe('Schweden 2026')
        ->and($result->payload['trips'][0]['poiCount'])->toBe(1);
});

it('loads one trip by id', function (): void {
    writeJson(
        $this->tempRoot . '/data/trips/scandinavia.json',
        [
            'tripName' => 'Scandinavia',
            'pois' => [
                [
                    'name' => 'Malmö',
                    'position' => [55.605, 13.0038],
                    'description' => '',
                ],
            ],
        ]
    );

    $result = $this->app->handle('GET', '/api/trips/scandinavia', null);

    expect($result->statusCode)->toBe(200)
        ->and($result->payload['id'])->toBe('scandinavia')
        ->and($result->payload['name'])->toBe('Scandinavia')
        ->and($result->payload['pois'])->toHaveCount(1)
        ->and($result->payload['pois'][0]['position'])->toBe('55.605, 13.0038');
});

it('writes a trip and returns the saved payload', function (): void {
    $payload = [
        'tripName' => 'Nordic Loop',
        'pois' => [
            [
                'name' => 'Lulea',
                'position' => [65.5848, 22.1547],
                'description' => 'Nordlicht Spot',
            ],
        ],
    ];

    $result = $this->app->handle('PUT', '/api/trips/nordic_loop', $payload);

    expect($result->statusCode)->toBe(200)
        ->and($result->payload['ok'])->toBeTrue()
        ->and($result->payload['count'])->toBe(1)
        ->and($result->payload['trip']['name'])->toBe('Nordic Loop')
        ->and($result->payload['trip']['pois'][0]['position'])->toBe('65.5848, 22.1547');

    $savedTrip = readJson($this->tempRoot . '/data/trips/nordic_loop.json');

    expect($savedTrip['tripName'])->toBe('Nordic Loop')
        ->and($savedTrip['pois'])->toHaveCount(1)
        ->and($savedTrip['pois'][0]['name'])->toBe('Lulea');
});

it('returns 400 for invalid trip payload', function (): void {
    $payload = ['tripName' => 'Broken Trip'];

    $result = $this->app->handle('PUT', '/api/trips/broken', $payload);

    expect($result->statusCode)->toBe(400)
        ->and($result->payload)->toHaveKey('error')
        ->and($result->payload['error'])->toBe('Could not save trip');
});

it('returns 400 when payload uses points alias instead of pois', function (): void {
    $payload = [
        'tripName' => 'Broken Trip',
        'points' => [
            [
                'name' => 'Legacy style',
                'position' => '59.1, 18.1',
                'description' => '',
            ],
        ],
    ];

    $result = $this->app->handle('PUT', '/api/trips/broken_alias', $payload);

    expect($result->statusCode)->toBe(400)
        ->and($result->payload)->toHaveKey('error')
        ->and($result->payload['error'])->toBe('Could not save trip');
});

it('returns 404 for unknown trip id', function (): void {
    $result = $this->app->handle('GET', '/api/trips/not_found', null);

    expect($result->statusCode)->toBe(404)
        ->and($result->payload['error'])->toBe('Could not load trip');
});

it('rejects maps resolve request without url', function (): void {
    $result = $this->app->handle('POST', '/api/maps/resolve', []);

    expect($result->statusCode)->toBe(400)
        ->and($result->payload['error'])->toBe('Missing "url" in JSON request body');
});

it('rejects non-google maps links in resolver endpoint', function (): void {
    $result = $this->app->handle('POST', '/api/maps/resolve', [
        'url' => 'https://example.com/not-google',
    ]);

    expect($result->statusCode)->toBe(400)
        ->and($result->payload['error'])->toBe('Could not resolve maps link');
});

it('ignores legacy files outside data/trips', function (): void {
    writeJson(
        $this->tempRoot . '/data/points.json',
        [
            'name' => 'Legacy Trip',
            'pois' => [
                [
                    'name' => 'Legacy POI',
                    'position' => '59.12, 17.99',
                    'description' => 'imported',
                ],
            ],
        ]
    );

    $result = $this->app->handle('GET', '/api/trips', null);

    expect($result->statusCode)->toBe(200)
        ->and($result->payload['trips'])->toHaveCount(0)
        ->and(file_exists($this->tempRoot . '/data/trips/points.json'))->toBeFalse();
});

/**
 * @param array<string, mixed> $payload
 */
function writeJson(string $filePath, array $payload): void
{
    $json = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    file_put_contents($filePath, $json . PHP_EOL);
}

/**
 * @return array<string, mixed>
 */
function readJson(string $filePath): array
{
    $raw = file_get_contents($filePath);

    if (!is_string($raw)) {
        throw new RuntimeException('Could not read JSON fixture file.');
    }

    $decoded = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);

    if (!is_array($decoded)) {
        throw new RuntimeException('Invalid JSON fixture content.');
    }

    return $decoded;
}

function deleteDirectory(string $directory): void
{
    if (!is_dir($directory)) {
        return;
    }

    $items = scandir($directory);

    if (!is_array($items)) {
        return;
    }

    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }

        $path = $directory . DIRECTORY_SEPARATOR . $item;

        if (is_dir($path)) {
            deleteDirectory($path);
        } else {
            unlink($path);
        }
    }

    rmdir($directory);
}
