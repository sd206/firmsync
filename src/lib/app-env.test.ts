import { describe, expect, it } from 'vitest'
import { isTestSite, testPrefixed } from './app-env'

describe('isTestSite', () => {
  it('is true only for "test"', () => {
    expect(isTestSite('test')).toBe(true)
    expect(isTestSite(' Test ')).toBe(true)
  })

  it('is false when unset or anything else, so Prod and local behave as before', () => {
    expect(isTestSite(undefined)).toBe(false)
    expect(isTestSite('')).toBe(false)
    expect(isTestSite('production')).toBe(false)
    expect(isTestSite('prod')).toBe(false)
    expect(isTestSite('testing')).toBe(false)
  })
})

describe('testPrefixed', () => {
  it('prefixes "[TEST] " on the Test site', () => {
    expect(testPrefixed('Invoice INV-1 from Demo Consulting', 'test')).toBe('[TEST] Invoice INV-1 from Demo Consulting')
  })

  it('leaves the text alone elsewhere', () => {
    expect(testPrefixed('Invoice INV-1 from Demo Consulting', undefined)).toBe('Invoice INV-1 from Demo Consulting')
    expect(testPrefixed('VeriTreo', 'production')).toBe('VeriTreo')
  })

  it('never doubles the prefix', () => {
    expect(testPrefixed('[TEST] Invoice INV-1', 'test')).toBe('[TEST] Invoice INV-1')
  })
})
