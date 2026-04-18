<?php

declare(strict_types=1);

use PoiStudio\ApiApp;
use PoiStudio\TripRepository;

require dirname(__DIR__) . '/vendor/autoload.php';

$requestUri = (string) ($_SERVER['REQUEST_URI'] ?? '/');
$path = parse_url($requestUri, PHP_URL_PATH);

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
    $result = $app->handle($method, $requestUri, $jsonBody);

    http_response_code($result->statusCode);
    header('Content-Type: application/json; charset=utf-8');

    echo json_encode($result->payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

readfile(__DIR__ . '/index.html');
