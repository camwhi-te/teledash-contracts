<?php

declare(strict_types=1);

namespace Teledash\Contracts;

use Opis\JsonSchema\Errors\ErrorFormatter;
use Opis\JsonSchema\Validator as OpisValidator;
use Teledash\Contracts\Generated\Catalogue;

final class Validator
{
    private static ?OpisValidator $opis = null;

    public static function schemaDir(): string
    {
        return dirname(__DIR__, 2).'/generated/schemas';
    }

    /** @return array{kind: string, class: class-string<Message>, schema: string} */
    public static function entry(string $type, int $version): array
    {
        return Catalogue::MESSAGES["{$type}@{$version}"]
            ?? throw new ContractException("unknown message {$type}@{$version}");
    }

    public static function isKnown(string $type, int $version): bool
    {
        return isset(Catalogue::MESSAGES["{$type}@{$version}"]);
    }

    /** Throws ContractException unless $message is a valid envelope with a valid payload. */
    public static function assertMessage(array|object $message): void
    {
        $data = self::toObject($message);
        self::validate($data, 'envelope.v1.json', 'envelope');

        $entry = self::entry($data->type, $data->version);
        self::validate($data->payload, $entry['schema'], "{$data->type}@{$data->version} payload");
    }

    private static function validate(mixed $data, string $schemaFile, string $what): void
    {
        $schema = json_decode((string) file_get_contents(self::schemaDir().'/'.$schemaFile));
        unset($schema->{'$id'});
        $result = self::opis()->validate($data, $schema);

        if (! $result->isValid()) {
            $errors = (new ErrorFormatter)->formatFlat($result->error());
            throw new ContractException("invalid {$what}: ".implode('; ', $errors));
        }
    }

    private static function toObject(array|object $value): object
    {
        if (is_array($value) && isset($value['payload']) && $value['payload'] === []) {
            $value['payload'] = new \stdClass;
        }

        return json_decode(json_encode($value, JSON_THROW_ON_ERROR), false, 512, JSON_THROW_ON_ERROR);
    }

    private static function opis(): OpisValidator
    {
        if (self::$opis === null) {
            self::$opis = new OpisValidator;
            self::$opis->setMaxErrors(10);
        }

        return self::$opis;
    }
}
