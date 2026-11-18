import { describe, expect, it } from 'vitest'
import { historyStatus } from './history'

const NOW = new Date('2026-11-18T12:00:00Z')

describe('historyStatus', () => {
  it('shows sent and failed as they are', () => {
    expect(historyStatus({ status: 'sent', createdAt: '2026-11-18T11:00:00Z' }, NOW)).toBe('Sent')
    expect(historyStatus({ status: 'failed', createdAt: '2026-11-18T11:00:00Z' }, NOW)).toBe('Failed')
  })

  it('shows a recent sending row as Sending', () => {
    expect(historyStatus({ status: 'sending', createdAt: '2026-11-18T11:50:00Z' }, NOW)).toBe('Sending')
  })

  it('shows a sending row older than 10 minutes as Unknown', () => {
    expect(historyStatus({ status: 'sending', createdAt: '2026-11-18T11:49:59Z' }, NOW)).toBe('Unknown')
  })
})
