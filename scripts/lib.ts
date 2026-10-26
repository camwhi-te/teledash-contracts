import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const ROOT = join(import.meta.dir, '..')
export const SCHEMAS = join(ROOT, 'schemas')
export const MESSAGES = join(SCHEMAS, 'messages')
export const FIXTURES = join(ROOT, 'fixtures')

export type Json = any

export interface MessageSchema {
  type: string
  version: number
  kind: 'command' | 'event'
  /** e.g. DiagnosticPingV1 */
  className: string
  /** refs inlined, ready for Ajv and codegen */
  bundled: Json
  path: string
}

export const readJson = (path: string): Json => JSON.parse(readFileSync(path, 'utf8'))

const defs = () => readJson(join(SCHEMAS, 'defs.json')).$defs as Record<string, Json>

/** Replaces every `defs.json#/$defs/<name>` ref with the definition itself. */
export function inlineRefs(node: Json, d = defs()): Json {
  if (Array.isArray(node)) return node.map(n => inlineRefs(n, d))
  if (node === null || typeof node !== 'object') return node
  if (typeof node.$ref === 'string') {
    const m = node.$ref.match(/defs\.json#\/\$defs\/([a-z_]+)$/)
    if (!m) throw new Error(`unsupported $ref ${node.$ref}`)
    const def = d[m[1]]
    if (!def) throw new Error(`unknown def ${m[1]}`)
    const { $ref, ...rest } = node
    return inlineRefs({ ...def, ...rest }, d)
  }
  return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, inlineRefs(v, d)]))
}

export const pascal = (s: string) =>
  s
    .split(/[._-]/)
    .filter(Boolean)
    .map(p => p[0].toUpperCase() + p.slice(1))
    .join('')

export function loadMessages(): MessageSchema[] {
  const out: MessageSchema[] = []
  for (const type of readdirSync(MESSAGES).sort()) {
    if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(type)) throw new Error(`bad message type folder: ${type}`)
    for (const file of readdirSync(join(MESSAGES, type)).sort()) {
      const m = file.match(/^v(\d+)\.json$/)
      if (!m) throw new Error(`bad schema file name: ${type}/${file}`)
      const path = join(MESSAGES, type, file)
      const raw = readJson(path)
      if (raw['x-kind'] !== 'command' && raw['x-kind'] !== 'event')
        throw new Error(`${type}/${file}: x-kind must be command or event`)
      const version = Number(m[1])
      const bundled = inlineRefs(raw)
      bundled.$id = `https://teledash.local/schemas/messages/${type}/v${version}.json`
      out.push({ type, version, kind: raw['x-kind'], className: `${pascal(type)}V${version}`, bundled, path })
    }
  }
  return out
}

export function fixturesFor(type: string, version: number): { valid: string[]; invalid: string[] } {
  const dir = join(FIXTURES, type, `v${version}`)
  const list = (d: string) =>
    existsSync(d)
      ? readdirSync(d)
          .filter(f => f.endsWith('.json'))
          .map(f => join(d, f))
      : []
  return { valid: list(dir), invalid: list(join(dir, 'invalid')) }
}
