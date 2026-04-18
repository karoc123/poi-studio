<?php

declare(strict_types=1);

namespace PoiStudio;

use JsonException;

final class TripRepository
{
    private const TRIP_ID_PATTERN = '/^[a-z0-9][a-z0-9._-]{0,79}$/i';

    private bool $initialized = false;

    public function __construct(
        private readonly string $dataDir,
        private readonly string $tripsDir
    ) {
    }

    /**
     * @return list<array{id: string, name: string, poiCount: int, updatedAt: string}>
     */
    public function listTrips(): array
    {
        $this->ensureInitialized();

        $files = $this->listTripFiles();
        $trips = [];

        foreach ($files as $filePath) {
            $tripId = pathinfo($filePath, PATHINFO_FILENAME);

            try {
                $parsed = $this->readJsonFile($filePath);
                $normalized = $this->normalizeTripPayload($parsed, $tripId);
            } catch (ApiException) {
                continue;
            }

            $updatedAt = gmdate('c', (int) filemtime($filePath));

            $trips[] = [
                'id' => $tripId,
                'name' => $normalized['tripName'],
                'poiCount' => count($normalized['pois']),
                'updatedAt' => $updatedAt,
            ];
        }

        usort(
            $trips,
            static fn(array $a, array $b): int => strcasecmp($a['name'], $b['name'])
        );

        return array_values($trips);
    }

    /**
     * @return array{id: string, name: string, pois: list<array{name: string, position: string, description: string}>}
     */
    public function readTrip(string $tripIdValue): array
    {
        $this->ensureInitialized();

        $tripId = $this->validateTripId($tripIdValue);
        $filePath = $this->tripFilePath($tripId);

        if (!is_file($filePath)) {
            throw new ApiException(404, sprintf('Trip "%s" was not found.', $tripId));
        }

        $parsed = $this->readJsonFile($filePath);
        $normalized = $this->normalizeTripPayload($parsed, $tripId);

        return [
            'id' => $tripId,
            'name' => $normalized['tripName'],
            'pois' => $normalized['pois'],
        ];
    }

    /**
     * @param array<string, mixed> $payload
     *
     * @return array{id: string, name: string, pois: list<array{name: string, position: string, description: string}>}
     */
    public function saveTrip(string $tripIdValue, array $payload): array
    {
        $this->ensureInitialized();

        $tripId = $this->validateTripId($tripIdValue);
        $normalized = $this->normalizeTripPayload($payload, $tripId);

        $this->writeTripFile($tripId, $normalized['tripName'], $normalized['pois']);

        return [
            'id' => $tripId,
            'name' => $normalized['tripName'],
            'pois' => $normalized['pois'],
        ];
    }

    private function ensureInitialized(): void
    {
        if ($this->initialized) {
            return;
        }

        if (!is_dir($this->dataDir) && !mkdir($concurrentDirectory = $this->dataDir, 0775, true) && !is_dir($concurrentDirectory)) {
            throw new ApiException(500, 'Could not create data directory.');
        }

        if (!is_dir($this->tripsDir) && !mkdir($concurrentDirectory = $this->tripsDir, 0775, true) && !is_dir($concurrentDirectory)) {
            throw new ApiException(500, 'Could not create trips directory.');
        }

        $this->initialized = true;
    }

    /**
     * @return list<string>
     */
    private function listTripFiles(): array
    {
        $pattern = $this->tripsDir . DIRECTORY_SEPARATOR . '*.json';
        $files = glob($pattern);

        if ($files === false) {
            return [];
        }

        return array_values(array_filter($files, 'is_file'));
    }

    /**
     * @return array<string, mixed>
     */
    private function readJsonFile(string $filePath): array
    {
        $raw = @file_get_contents($filePath);

        if ($raw === false) {
            throw new ApiException(500, sprintf('Could not read file "%s".', $filePath));
        }

        try {
            $decoded = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new ApiException(500, sprintf('Invalid JSON in "%s": %s', $filePath, $exception->getMessage()));
        }

        if (!is_array($decoded)) {
            throw new ApiException(500, sprintf('JSON payload in "%s" must be an object or array.', $filePath));
        }

        return $decoded;
    }

    private function validateTripId(string $tripIdValue): string
    {
        $tripId = trim($tripIdValue);

        if (!preg_match(self::TRIP_ID_PATTERN, $tripId)) {
            throw new ApiException(400, 'Invalid trip id. Use only letters, digits, dash, underscore or dot.');
        }

        return $tripId;
    }

    private function tripFilePath(string $tripId): string
    {
        return $this->tripsDir . DIRECTORY_SEPARATOR . $tripId . '.json';
    }

    /**
     * @param list<array{name: string, position: string, description: string}> $pois
     */
    private function writeTripFile(string $tripId, string $tripName, array $pois): void
    {
        $payload = [
            'tripName' => $tripName,
            'pois' => $pois,
        ];

        try {
            $json = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new ApiException(500, 'Could not encode trip JSON: ' . $exception->getMessage());
        }

        $result = @file_put_contents($this->tripFilePath($tripId), $json . PHP_EOL);

        if ($result === false) {
            throw new ApiException(500, sprintf('Could not write trip file for "%s".', $tripId));
        }
    }

    /**
     * @param array<string, mixed>|list<mixed> $payload
     *
     * @return array{tripName: string, pois: list<array{name: string, position: string, description: string}>}
     */
    private function normalizeTripPayload(array $payload, string $fallbackName): array
    {
        $list = $payload['pois'] ?? null;

        if (!is_array($list)) {
            throw new ApiException(400, 'Payload requires a "pois" array.');
        }

        $tripNameRaw = $payload['tripName'] ?? $fallbackName;
        $tripName = trim((string) $tripNameRaw);

        if ($tripName === '') {
            $tripName = $fallbackName;
        }

        $normalizedPois = [];
        $pois = array_values($list);

        foreach ($pois as $index => $poi) {
            $normalizedPois[] = $this->normalizePoi($poi, $index);
        }

        return [
            'tripName' => $tripName,
            'pois' => $normalizedPois,
        ];
    }

    /**
     * @param mixed $poi
     *
     * @return array{name: string, position: string, description: string}
     */
    private function normalizePoi(mixed $poi, int $index): array
    {
        if (!is_array($poi)) {
            throw new ApiException(400, sprintf('POI at index %d must be an object.', $index));
        }

        $name = trim((string) ($poi['name'] ?? ''));

        if ($name === '') {
            throw new ApiException(400, sprintf('POI at index %d requires a non-empty "name".', $index));
        }

        $description = trim((string) ($poi['description'] ?? ''));

        return [
            'name' => $name,
            'position' => $this->normalizePosition($poi['position'] ?? null),
            'description' => $description,
        ];
    }

    private function normalizePosition(mixed $position): string
    {
        $latRaw = null;
        $lngRaw = null;

        if (is_string($position)) {
            $parts = preg_split('/\s*,\s*/', trim($position));

            if (!is_array($parts) || count($parts) < 2) {
                throw new ApiException(400, sprintf('Invalid position string "%s". Use "lat, lng".', $position));
            }

            $latRaw = $parts[0];
            $lngRaw = $parts[1];
        } elseif (is_array($position) && array_is_list($position) && count($position) >= 2) {
            $latRaw = $position[0];
            $lngRaw = $position[1];
        } elseif (is_array($position) && array_key_exists('lat', $position) && array_key_exists('lng', $position)) {
            $latRaw = $position['lat'];
            $lngRaw = $position['lng'];
        }

        if ($latRaw === null || $lngRaw === null) {
            throw new ApiException(400, 'Position must be "lat, lng", [lat, lng], or {lat, lng}.');
        }

        if (!is_numeric($latRaw) || !is_numeric($lngRaw)) {
            throw new ApiException(400, 'Position must contain numeric latitude and longitude.');
        }

        $lat = (float) $latRaw;
        $lng = (float) $lngRaw;

        if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) {
            throw new ApiException(400, sprintf('Position is out of range: %s, %s.', $lat, $lng));
        }

        return $this->trimCoord($lat) . ', ' . $this->trimCoord($lng);
    }

    private function trimCoord(float $value): string
    {
        $rounded = round($value, 6);

        if ($rounded === -0.0) {
            $rounded = 0.0;
        }

        $formatted = rtrim(rtrim(number_format($rounded, 6, '.', ''), '0'), '.');

        return $formatted === '' ? '0' : $formatted;
    }
}
