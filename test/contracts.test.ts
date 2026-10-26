import { describe, expect, test } from 'bun:test'
import { assertMessage, assertPayload, ContractError, catalogue, isKnownMessage, kindOf } from '../src/index'

const ping = {
  message_id: '01JB7Q2V9K3M4N5P6Q7R8S9T0V',
  type: 'diagnostic.ping',
  version: 1,
  occurred_at: '2026-10-26T20:57:00Z',
  producer: 'kit-test',
  correlation_id: 'diag_01',
  causation_id: null,
  actor: { type: 'system', id: 'kit-test' },
  payload: { target: 'kit-test', note: 'hello' },
}

describe('contracts', () => {
  test('catalogue lists every message with its kind', () => {
    expect(catalogue.length).toBeGreaterThan(0)
    expect(kindOf('diagnostic.ping', 1)).toBe('command')
    expect(kindOf('diagnostic.ponged', 1)).toBe('event')
    expect(isKnownMessage('diagnostic.ping', 99)).toBe(false)
  })

  test('accepts a valid message', () => {
    expect(() => assertMessage(ping)).not.toThrow()
  })

  test('tolerates unknown payload fields (additive changes)', () => {
    expect(() => assertMessage({ ...ping, payload: { ...ping.payload, added_later: true } })).not.toThrow()
  })

  test('rejects a bad envelope', () => {
    expect(() => assertMessage({ ...ping, message_id: 'not-a-ulid' })).toThrow(ContractError)
  })

  test('rejects a bad payload with a readable error', () => {
    expect(() => assertPayload('diagnostic.ping', 1, { target: 'x' })).toThrow(/note/)
  })

  test('rejects an unknown type', () => {
    expect(() => assertMessage({ ...ping, type: 'nope.never' })).toThrow(/unknown message/)
  })
})
