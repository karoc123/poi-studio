<?php

declare(strict_types=1);

namespace PoiStudio;

use RuntimeException;

final class ApiException extends RuntimeException
{
    public function __construct(public readonly int $status, string $message)
    {
        parent::__construct($message);
    }
}
