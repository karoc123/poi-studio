<?php

declare(strict_types=1);

use PoiStudio\ApiApp;
use PoiStudio\TripRepository;

require dirname(__DIR__) . '/vendor/autoload.php';

$requestUri = (string) ($_SERVER['REQUEST_URI'] ?? '/');
$rawPath = parse_url($requestUri, PHP_URL_PATH);

if (!is_string($rawPath) || $rawPath === '') {
    $rawPath = '/';
}

$normalizedPath = $rawPath;

if (preg_match('#^/(?:public/)?index\.php(?:/|$)#', $normalizedPath) === 1) {
    $normalizedPath = (string) preg_replace('#^/(?:public/)?index\.php#', '', $normalizedPath, 1);
}

if ($normalizedPath === '/public/api' || str_starts_with($normalizedPath, '/public/api/')) {
    $normalizedPath = substr($normalizedPath, strlen('/public'));
}

if ($normalizedPath === '') {
    $normalizedPath = '/';
}

if (!str_starts_with($normalizedPath, '/')) {
    $normalizedPath = '/' . $normalizedPath;
}

$query = parse_url($requestUri, PHP_URL_QUERY);
$normalizedRequestUri = $normalizedPath;

if (is_string($query) && $query !== '') {
    $normalizedRequestUri .= '?' . $query;
}

$path = parse_url($normalizedRequestUri, PHP_URL_PATH);

if (!is_string($path)) {
    $path = '/';
}

if (str_starts_with($path, '/api/')) {
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    $jsonBody = null;

    if (in_array($method, ['POST', 'PUT', 'PATCH'], true)) {
        $rawBody = file_get_contents('php://input');

        if (is_string($rawBody) && trim($rawBody) !== '') {
            try {
                $decoded = json_decode($rawBody, true, 512, JSON_THROW_ON_ERROR);
            } catch (JsonException $exception) {
                http_response_code(400);
                header('Content-Type: application/json; charset=utf-8');

                echo json_encode(
                    [
                        'error' => 'Invalid JSON request body',
                        'details' => $exception->getMessage(),
                    ],
                    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
                );
                exit;
            }

            if (is_array($decoded)) {
                $jsonBody = $decoded;
            }
        }
    }

    $repository = new TripRepository(
        dataDir: dirname(__DIR__) . '/data',
        tripsDir: dirname(__DIR__) . '/data/trips'
    );

    $app = new ApiApp($repository);
    $result = $app->handle($method, $normalizedRequestUri, $jsonBody);

    http_response_code($result->statusCode);
    header('Content-Type: application/json; charset=utf-8');

    echo json_encode($result->payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

readfile(__DIR__ . '/index.html');
