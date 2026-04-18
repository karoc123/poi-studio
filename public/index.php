<?php

declare(strict_types=1);

use PoiStudio\ApiApp;
use PoiStudio\TripRepository;

function startsWith(string $haystack, string $needle): bool
{
    if ($needle === '') {
        return true;
    }

    return strncmp($haystack, $needle, strlen($needle)) === 0;
}

$requestUri = (string) ($_SERVER['REQUEST_URI'] ?? '/');
$rawPath = parse_url($requestUri, PHP_URL_PATH);

if (!is_string($rawPath) || $rawPath === '') {
    $rawPath = '/';
}

$normalizedPath = $rawPath;
$apiRoute = $_GET['api'] ?? null;

if (is_string($apiRoute) && trim($apiRoute) !== '') {
    $normalizedPath = trim($apiRoute);

    if (!startsWith($normalizedPath, '/')) {
        $normalizedPath = '/' . $normalizedPath;
    }

    if ($normalizedPath === '/api') {
        $normalizedPath = '/api/';
    } elseif (!startsWith($normalizedPath, '/api/')) {
        $normalizedPath = '/api' . $normalizedPath;
    }
} else {
    if (preg_match('#^/(?:public/)?index\.php(?:/|$)#', $normalizedPath) === 1) {
        $normalizedPath = (string) preg_replace('#^/(?:public/)?index\.php#', '', $normalizedPath, 1);
    }

    if ($normalizedPath === '/public/api' || startsWith($normalizedPath, '/public/api/')) {
        $normalizedPath = substr($normalizedPath, strlen('/public'));
    }
}

if ($normalizedPath === '') {
    $normalizedPath = '/';
}

if (!startsWith($normalizedPath, '/')) {
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

if (startsWith($path, '/api/')) {
    if (PHP_VERSION_ID < 80100) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');

        echo json_encode(
            [
                'error' => 'Unsupported PHP version',
                'details' => 'PHP 8.1+ required for API runtime. Detected: ' . PHP_VERSION,
            ],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        );
        exit;
    }

    $autoloadPath = dirname(__DIR__) . '/vendor/autoload.php';

    if (!is_file($autoloadPath)) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');

        echo json_encode(
            [
                'error' => 'Dependencies missing',
                'details' => 'vendor/autoload.php not found. Run composer install --no-dev --optimize-autoloader and upload vendor/.',
            ],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        );
        exit;
    }

    require $autoloadPath;

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
        dirname(__DIR__) . '/data',
        dirname(__DIR__) . '/data/trips'
    );

    $app = new ApiApp($repository);
    $result = $app->handle($method, $normalizedRequestUri, $jsonBody);

    http_response_code($result->statusCode);
    header('Content-Type: application/json; charset=utf-8');

    echo json_encode($result->payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

readfile(__DIR__ . '/index.html');
