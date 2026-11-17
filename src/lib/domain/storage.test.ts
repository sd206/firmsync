import { describe, expect, it } from 'vitest'
import { formatBytes, storageLevel, usagePercent } from './storage'

describe('storageLevel', () => {
  it('uses 80, 95 and 100 percent boundaries', () => {
    expect(storageLevel(0, 1000)).toBe('ok')
    expect(storageLevel(799, 1000)).toBe('ok')
    expect(storageLevel(800, 1000)).toBe('notice')
    expect(storageLevel(949, 1000)).toBe('notice')
    expect(storageLevel(950, 1000)).toBe('warning')
    expect(storageLevel(999, 1000)).toBe('warning')
    expect(storageLevel(1000, 1000)).toBe('full')
    expect(storageLevel(1200, 1000)).toBe('full')
  })

  it('treats any usage of a zero allowance as full', () => {
    expect(storageLevel(1, 0)).toBe('full')
    expect(storageLevel(0, 0)).toBe('full')
  })
})

describe('formatBytes', () => {
  it('formats B, KB, MB and GB', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(839_680)).toBe('820 KB')
    expect(formatBytes(536_870_912)).toBe('512 MB')
    expect(formatBytes(4_402_341_478)).toBe('4.1 GB')
    expect(formatBytes(5_368_709_120)).toBe('5 GB')
  })
})

describe('usagePercent', () => {
  it('floors to a whole percent', () => {
    // 81.99…% rounds down, not to the nearest percent.
    expect(usagePercent(4_402_341_478, 5_368_709_120)).toBe(81)
    expect(usagePercent(4_402_341_479, 5_368_709_120)).toBe(82)
    expect(usagePercent(0, 1000)).toBe(0)
    expect(usagePercent(5, 0)).toBe(100)
  })
})
