<?php

declare(strict_types=1);

namespace Teledash\Contracts;

/** Implemented by every generated message payload DTO. */
interface Message
{
    public static function fromArray(array $data): self;

    public function toArray(): array;

    public function type(): string;

    public function version(): int;
}
