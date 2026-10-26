import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { catalogue, envelopeSchema } from './generated/registry'
import type { CommandKey, EventKey, MessagePayloads } from './generated/types'

export * from './generated/types'
export { catalogue, envelopeSchema }

export type MessageKey = keyof MessagePayloads
export type ServiceName =
  | 'core'
  | 'order'
  | 'billing'
  | 'msisdn'
  | 'sim'
  | 'warehouse'
  | 'activity-log'
  | 'notification'
  | 'network-sim'
  | 'payment-sim'
  | 'seed'
  | 'kit-test'

export interface Actor {
  type: 'agent' | 'system' | 'customer'
  id: string
}

export interface Envelope<P = Record<string, unknown>> {
  message_id: string
  type: string
  version: number
  occurred_at: string
  producer: ServiceName
  correlation_id: string
  causation_id: string | null
  actor: Actor
  payload: P
}

/** Splits `sim.activate@1` into its type and version. */
export type TypeOf<K extends MessageKey> = K extends `${infer T}@${string}` ? T : never
export type PayloadOf<K extends MessageKey> = MessagePayloads[K]
export type { CommandKey, EventKey }

export class ContractError extends Error {
  constructor(
    message: string,
    readonly errors: ErrorObject[] = [],
  ) {
    super(message)
    this.name = 'ContractError'
  }
}

const ajv = new Ajv2020({ allErrors: true, strict: false })
addFormats(ajv)
const validateEnvelopeFn = ajv.compile(envelopeSchema)
const payloadValidators = new Map<string, { kind: 'command' | 'event'; validate: ValidateFunction }>()
for (const m of catalogue)
  payloadValidators.set(`${m.type}@${m.version}`, { kind: m.kind, validate: ajv.compile(m.schema) })

const describe = (errors: ErrorObject[] | null | undefined) =>
  (errors ?? []).map(e => `${e.instancePath || '/'} ${e.message}`).join('; ')

export const isKnownMessage = (type: string, version: number): boolean => payloadValidators.has(`${type}@${version}`)

export const kindOf = (type: string, version: number): 'command' | 'event' | undefined =>
  payloadValidators.get(`${type}@${version}`)?.kind

/** Throws ContractError unless `value` is a valid envelope whose payload matches its type@version schema. */
export function assertMessage(value: unknown): asserts value is Envelope {
  if (!validateEnvelopeFn(value)) {
    throw new ContractError(`invalid envelope: ${describe(validateEnvelopeFn.errors)}`, validateEnvelopeFn.errors ?? [])
  }
  const env = value as unknown as Envelope
  assertPayload(env.type, env.version, env.payload)
}

export function assertPayload(type: string, version: number, payload: unknown): void {
  const v = payloadValidators.get(`${type}@${version}`)
  if (!v) throw new ContractError(`unknown message ${type}@${version}`)
  if (!v.validate(payload)) {
    throw new ContractError(
      `invalid ${type}@${version} payload: ${describe(v.validate.errors)}`,
      v.validate.errors ?? [],
    )
  }
}
