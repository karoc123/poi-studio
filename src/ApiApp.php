<?php

declare(strict_types=1);

namespace PoiStudio;

use Throwable;

final class ApiApp
{
    private readonly MapsLinkResolver $mapsLinkResolver;

    public function __construct(private readonly TripRepository $repository, ?MapsLinkResolver $mapsLinkResolver = null)
    {
        $this->mapsLinkResolver = $mapsLinkResolver ?? new MapsLinkResolver();
    }

    public function handle(string $method, string $requestUri, ?array $jsonBody): ApiResult
    {
        $httpMethod = strtoupper($method);
        $path = parse_url($requestUri, PHP_URL_PATH);

        if (!is_string($path)) {
            $path = '/';
        }

        if ($httpMethod === 'GET' && $path === '/api/health') {
            return new ApiResult(200, ['ok' => true]);
        }

        if ($httpMethod === 'GET' && $path === '/api/trips') {
            return $this->wrap('Could not load trips', function (): array {
                return ['trips' => $this->repository->listTrips()];
            });
        }

        if ($httpMethod === 'POST' && $path === '/api/maps/resolve') {
            if ($jsonBody === null || !isset($jsonBody['url']) || !is_string($jsonBody['url'])) {
                return new ApiResult(400, ['error' => 'Missing "url" in JSON request body']);
            }

            return $this->wrap('Could not resolve maps link', function () use ($jsonBody): array {
                $resolvedUrl = $this->mapsLinkResolver->resolve($jsonBody['url']);

                return [
                    'ok' => true,
                    'url' => $resolvedUrl,
                ];
            });
        }

        if (preg_match('#^/api/trips/([^/]+)$#', $path, $matches) === 1) {
            $tripId = rawurldecode($matches[1]);

            if ($httpMethod === 'GET') {
                return $this->wrap('Could not load trip', function () use ($tripId): array {
                    return $this->repository->readTrip($tripId);
                });
            }

            if ($httpMethod === 'PUT') {
                if ($jsonBody === null) {
                    return new ApiResult(400, ['error' => 'Missing JSON request body']);
                }

                return $this->wrap('Could not save trip', function () use ($tripId, $jsonBody): array {
                    $trip = $this->repository->saveTrip($tripId, $jsonBody);

                    return [
                        'ok' => true,
                        'count' => count($trip['pois']),
                        'trip' => $trip,
                    ];
                });
            }
        }

        if (str_starts_with($path, '/api/')) {
            return new ApiResult(404, ['error' => 'API route not found']);
        }

        return new ApiResult(404, ['error' => 'Not found']);
    }

    /**
     * @param callable(): array<string, mixed> $callback
     */
    private function wrap(string $fallbackError, callable $callback): ApiResult
    {
        try {
            return new ApiResult(200, $callback());
        } catch (ApiException $exception) {
            return new ApiResult(
                $exception->status,
                [
                    'error' => $fallbackError,
                    'details' => $exception->getMessage(),
                ]
            );
        } catch (Throwable $throwable) {
            return new ApiResult(
                500,
                [
                    'error' => $fallbackError,
                    'details' => $throwable->getMessage(),
                ]
            );
        }
    }
}
