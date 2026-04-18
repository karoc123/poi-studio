<?php

declare(strict_types=1);

namespace PoiStudio;

final class MapsLinkResolver
{
    public function resolve(string $url): string
    {
        $trimmedUrl = trim($url);

        if ($trimmedUrl === '') {
            throw new ApiException(400, 'URL must not be empty.');
        }

        $this->assertAllowedHost($trimmedUrl);

        if (!function_exists('curl_init')) {
            throw new ApiException(500, 'cURL extension is required to resolve short links.');
        }

        $curlHandle = curl_init($trimmedUrl);

        if ($curlHandle === false) {
            throw new ApiException(500, 'Could not initialize cURL.');
        }

        curl_setopt($curlHandle, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($curlHandle, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($curlHandle, CURLOPT_MAXREDIRS, 8);
        curl_setopt($curlHandle, CURLOPT_TIMEOUT, 10);
        curl_setopt($curlHandle, CURLOPT_CONNECTTIMEOUT, 5);
        curl_setopt($curlHandle, CURLOPT_USERAGENT, 'POI-Studio/1.0');

        $result = curl_exec($curlHandle);

        if ($result === false) {
            $error = curl_error($curlHandle);
            curl_close($curlHandle);
            throw new ApiException(502, 'Could not resolve maps URL: ' . $error);
        }

        $statusCode = (int) curl_getinfo($curlHandle, CURLINFO_RESPONSE_CODE);
        $effectiveUrl = (string) curl_getinfo($curlHandle, CURLINFO_EFFECTIVE_URL);

        curl_close($curlHandle);

        if ($statusCode >= 400) {
            throw new ApiException(502, sprintf('Maps URL returned HTTP %d.', $statusCode));
        }

        if ($effectiveUrl === '') {
            throw new ApiException(502, 'Could not determine resolved URL.');
        }

        $this->assertAllowedHost($effectiveUrl);

        return $effectiveUrl;
    }

    private function assertAllowedHost(string $url): void
    {
        $host = parse_url($url, PHP_URL_HOST);

        if (!is_string($host) || trim($host) === '') {
            throw new ApiException(400, 'The URL must include a valid hostname.');
        }

        $normalizedHost = strtolower($host);

        if (!$this->isAllowedGoogleHost($normalizedHost)) {
            throw new ApiException(400, 'Only Google Maps URLs are allowed.');
        }
    }

    private function isAllowedGoogleHost(string $host): bool
    {
        if ($host === 'maps.app.goo.gl' || $host === 'goo.gl') {
            return true;
        }

        if ($host === 'google.com' || str_ends_with($host, '.google.com')) {
            return true;
        }

        if (preg_match('/(^|\.)google\.[a-z.]+$/', $host) === 1) {
            return true;
        }

        return false;
    }
}
