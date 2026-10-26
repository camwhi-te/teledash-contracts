# teledash-contracts

The message envelope and every command and event schema shared by Teledash services. This repo is what stops the other repos drifting apart.

- **Source of truth:** JSON Schema in [`schemas/`](schemas). Shared types (money, MSISDN, ICCID, address…) live in [`schemas/defs.json`](schemas/defs.json).
- **Generated, committed output:** bundled schemas in [`generated/schemas`](generated/schemas), TypeScript types and an Ajv registry in [`src/generated`](src/generated), and PHP DTOs in [`php/src/Generated`](php/src/Generated). CI fails if generated code is stale.

## Layout

```
schemas/envelope.v1.json             the envelope on every message
schemas/defs.json                    shared definitions, inlined by codegen
schemas/messages/<type>/v<N>.json    one payload schema per type and version ("x-kind": command | event)
fixtures/<type>/v<N>/*.json          full example messages that must validate
fixtures/<type>/v<N>/invalid/*.json  examples that must be rejected
```

## Rules

- Commands are `<service>.<verb>` on the `commands` exchange (`sim.activate`). Events are past tense on the `events` exchange (`sim.activated`).
- **Changes are additive only.** `bun run check` compares every schema against the last release tag and fails on removed properties, newly required properties, narrowed types or removed enum values. A breaking change is a new `v<N+1>.json`; consumers handle both until producers move over.
- Consumers ignore unknown fields, so adding an optional property is always safe.
- Money is a decimal string (`"12.50"`), never a float. Times are UTC ISO-8601.

## Using it

TypeScript (Bun), pinned to a release tag:

```jsonc
// package.json
"@teledash/contracts": "git+https://github.com/camwhi-te/teledash-contracts.git#v0.1.0"
```

```ts
import { assertMessage, type Envelope, type PayloadOf } from '@teledash/contracts'
assertMessage(json) // throws ContractError with readable errors
```

PHP (Composer VCS repository):

```jsonc
"repositories": [{ "type": "vcs", "url": "https://github.com/camwhi-te/teledash-contracts" }],
"require": { "teledash/contracts": "^0.1" }
```

```php
use Teledash\Contracts\Envelope;
use Teledash\Contracts\Generated\Messages\DiagnosticPingV1;

$envelope = Envelope::wrap(new DiagnosticPingV1(target: 'sim', note: 'hi'), producer: 'core',
    correlationId: 'diag_1', actor: ['type' => 'agent', 'id' => 'ag_42']);
$received = Envelope::fromArray($json); // validates envelope and payload
$received->message();                   // the typed DTO
```

## Adding or changing a message

1. Add or edit `schemas/messages/<type>/v<N>.json`.
2. Add at least one fixture under `fixtures/<type>/v<N>/`.
3. `bun run generate && bun run check && bun run test`
4. Commit, then tag a release (`v0.x.y`) so consumers can pin it.
