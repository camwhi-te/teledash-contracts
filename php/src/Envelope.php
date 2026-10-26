<?php

declare(strict_types=1);

namespace Teledash\Contracts;

use DateTimeImmutable;
use DateTimeZone;
use Symfony\Component\Uid\Ulid;

/** The wrapper around every command and event. See schemas/envelope.v1.json. */
final readonly class Envelope
{
    /**
     * @param  array{type: string, id: string}  $actor
     */
    public function __construct(
        public string $message_id,
        public string $type,
        public int $version,
        public string $occurred_at,
        public string $producer,
        public string $correlation_id,
        public ?string $causation_id,
        public array $actor,
        public array $payload,
    ) {}

    /**
     * Wraps a payload in a new envelope with a fresh ULID and the current UTC time.
     *
     * @param  array{type: string, id: string}  $actor
     */
    public static function wrap(
        Message $payload,
        string $producer,
        string $correlationId,
        array $actor,
        ?string $causationId = null,
    ): self {
        return new self(
            message_id: (string) new Ulid,
            type: $payload->type(),
            version: $payload->version(),
            occurred_at: (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z'),
            producer: $producer,
            correlation_id: $correlationId,
            causation_id: $causationId,
            actor: $actor,
            payload: $payload->toArray(),
        );
    }

    public static function fromArray(array $data): self
    {
        Validator::assertMessage($data);

        return new self(
            message_id: $data['message_id'],
            type: $data['type'],
            version: $data['version'],
            occurred_at: $data['occurred_at'],
            producer: $data['producer'],
            correlation_id: $data['correlation_id'],
            causation_id: $data['causation_id'],
            actor: $data['actor'],
            payload: $data['payload'],
        );
    }

    /** The payload as its generated DTO class. */
    public function message(): Message
    {
        $entry = Validator::entry($this->type, $this->version);

        return $entry['class']::fromArray($this->payload);
    }

    public function toArray(): array
    {
        return [
            'message_id' => $this->message_id,
            'type' => $this->type,
            'version' => $this->version,
            'occurred_at' => $this->occurred_at,
            'producer' => $this->producer,
            'correlation_id' => $this->correlation_id,
            'causation_id' => $this->causation_id,
            'actor' => $this->actor,
            'payload' => (object) $this->payload,
        ];
    }

    public function toJson(): string
    {
        return json_encode($this->toArray(), JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
    }
}
