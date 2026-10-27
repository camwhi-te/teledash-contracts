<?php

use Teledash\Contracts\ContractException;
use Teledash\Contracts\Envelope;
use Teledash\Contracts\Generated\Catalogue;
use Teledash\Contracts\Generated\Messages\DiagnosticPingV1;
use Teledash\Contracts\Validator;

$fixtures = fn (string $sub = '') => glob(dirname(__DIR__, 2)."/fixtures/*/v*/{$sub}*.json");

it('accepts every valid fixture', function (string $file) {
    $data = json_decode(file_get_contents($file), true);
    $envelope = Envelope::fromArray($data);

    expect($envelope->message())->toBeInstanceOf(Catalogue::MESSAGES["{$data['type']}@{$data['version']}"]['class']);
})->with($fixtures());

it('rejects every invalid fixture', function (string $file) {
    Validator::assertMessage(json_decode(file_get_contents($file), true));
})->with($fixtures('invalid/'))->throws(ContractException::class);

it('wraps a DTO in a valid envelope that round-trips', function () {
    $envelope = Envelope::wrap(
        new DiagnosticPingV1(target: 'core', note: 'hi'),
        producer: 'core',
        correlationId: 'diag_1',
        actor: ['type' => 'system', 'id' => 'core'],
    );

    $decoded = Envelope::fromArray(json_decode($envelope->toJson(), true));

    expect($decoded->message())->toEqual(new DiagnosticPingV1(target: 'core', note: 'hi'));
});

it('rejects an unknown message type', function () {
    Validator::assertMessage([
        'message_id' => '01JB7Q2V9K3M4N5P6Q7R8S9T0V', 'type' => 'nope.never', 'version' => 1,
        'occurred_at' => '2026-10-26T20:57:00Z', 'producer' => 'core', 'correlation_id' => 'x',
        'causation_id' => null, 'actor' => ['type' => 'system', 'id' => 'core'], 'payload' => [],
    ]);
})->throws(ContractException::class, 'unknown message');

it('keeps required fields that are null, and drops optional ones that are', function () {
    $dto = new \Teledash\Contracts\Generated\Messages\AccountSearchedV1(
        agent_ref: '0193a3f0-6a1e-7c2b-9d4e-1f2a3b4c5d6e', term_type: 'email', matched: false, customer_account_ref: null,
    );
    expect($dto->toArray())->toHaveKey('customer_account_ref')->and($dto->toArray()['customer_account_ref'])->toBeNull();

    $send = new \Teledash\Contracts\Generated\Messages\NotificationSendV1(
        notification_id: '0193a3f0-6a1e-7c2b-9d4e-1f2a3b4c5d6e', channel: 'sms', to: '447700900123', template: 'otac', body: 'x',
    );
    expect($send->toArray())->not->toHaveKey('subject');

    Envelope::fromArray(json_decode(Envelope::wrap($dto, 'core', 'c', ['type' => 'system', 'id' => 'core'])->toJson(), true));
});
