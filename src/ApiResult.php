<?php

declare(strict_types=1);

namespace PoiStudio;

final class ApiResult
{
    /**
     * @param array<string, mixed> $payload
     */
    public function __construct(public readonly int $statusCode, public readonly array $payload)
    {
    }
}
