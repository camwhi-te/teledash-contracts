// Contract checks run in CI:
//  1. every message version has at least one valid fixture, and every fixture
//     (valid/ and invalid/) behaves as expected against the envelope + payload schema
//  2. commands are <service>.<verb>; events are past tense
//  3. changes since the last release tag are additive: no removed properties,
//     no newly required properties, no changed types (a breaking change needs a new version)

import { relative } from 'node:path'
import { $ } from 'bun'
import { assertMessage } from '../src/index'
import { fixturesFor, inlineRefs, type Json, loadMessages, ROOT, readJson } from './lib'

const problems: string[] = []
const messages = loadMessages()

for (const m of messages) {
  const { valid, invalid } = fixturesFor(m.type, m.version)
  if (valid.length === 0) problems.push(`${m.type}@${m.version}: no fixtures in fixtures/${m.type}/v${m.version}/`)
  for (const f of valid) {
    const msg = readJson(f)
    try {
      assertMessage(msg)
      if (msg.type !== m.type || msg.version !== m.version)
        problems.push(`${relative(ROOT, f)}: type/version doesn't match its folder`)
    } catch (e) {
      problems.push(`${relative(ROOT, f)}: ${(e as Error).message}`)
    }
  }
  for (const f of invalid) {
    try {
      assertMessage(readJson(f))
      problems.push(`${relative(ROOT, f)}: expected to be rejected but passed`)
    } catch {}
  }

  const verb = m.type.split('.').at(-1) ?? ''
  if (m.kind === 'event' && !/(ed|sent|run|done|failed)$/.test(verb))
    problems.push(`${m.type}: events must be past tense`)
  if (m.kind === 'command' && /ed$/.test(verb))
    problems.push(`${m.type}: commands are imperative (<service>.<verb>), not past tense`)
}

// ---- additive-only check against the most recent tag --------------------------

function typesOf(s: Json): string[] {
  return (Array.isArray(s?.type) ? s.type : [s?.type]).filter(Boolean).sort()
}

function compare(path: string, before: Json, after: Json) {
  if (!before || !after) return
  const tb = typesOf(before)
  const ta = typesOf(after)
  if (tb.length && tb.some(t => !ta.includes(t))) problems.push(`${path}: type narrowed from ${tb} to ${ta}`)
  const req = new Set<string>(before.required ?? [])
  for (const r of after.required ?? []) if (!req.has(r)) problems.push(`${path}: '${r}' became required`)
  for (const [k, v] of Object.entries(before.properties ?? {})) {
    if (!after.properties?.[k]) problems.push(`${path}: property '${k}' removed`)
    else compare(`${path}.${k}`, v, after.properties[k])
  }
  if (before.enum && after.enum) {
    for (const e of before.enum) if (!after.enum.includes(e)) problems.push(`${path}: enum value '${e}' removed`)
  }
  if (before.items && after.items) compare(`${path}[]`, before.items, after.items)
}

const lastTag = (await $`git describe --tags --abbrev=0`.cwd(ROOT).quiet().nothrow()).stdout.toString().trim()
if (lastTag) {
  const defsAtTag = (await $`git show ${lastTag}:schemas/defs.json`.cwd(ROOT).quiet().nothrow()).stdout.toString()
  const oldDefs = defsAtTag ? JSON.parse(defsAtTag).$defs : undefined
  for (const m of messages) {
    const rel = relative(ROOT, m.path)
    const old = await $`git show ${lastTag}:${rel}`.cwd(ROOT).quiet().nothrow()
    if (old.exitCode !== 0 || !oldDefs) continue
    compare(`${m.type}@${m.version}`, inlineRefs(JSON.parse(old.stdout.toString()), oldDefs), m.bundled)
  }
  const envAtTag = await $`git show ${lastTag}:schemas/envelope.v1.json`.cwd(ROOT).quiet().nothrow()
  if (envAtTag.exitCode === 0)
    compare('envelope', JSON.parse(envAtTag.stdout.toString()), readJson(`${ROOT}/schemas/envelope.v1.json`))
}

if (problems.length) {
  console.error(problems.map(p => `✗ ${p}`).join('\n'))
  process.exit(1)
}
console.log(`✓ ${messages.length} message schemas checked${lastTag ? ` (additive against ${lastTag})` : ''}`)
