/** Storage sizes and how close a firm is to its allowance. 1 GB here is 1 GiB (1,073,741,824 bytes). */

/** Shown when an upload is refused because the firm's storage is full. */
export const STORAGE_FULL = 'Your firm has used all of its storage. Delete old files or add storage in Settings › Billing.'

export type StorageLevel = 'ok' | 'notice' | 'warning' | 'full'

const KB = 1024
const MB = KB * 1024
const GB = MB * 1024

/** ok below 80%, notice from 80%, warning from 95%, full at or over the allowance (a zero allowance is always full). */
export function storageLevel(used: number, allowance: number): StorageLevel {
  if (allowance <= 0 || used >= allowance) return 'full'
  if (used * 100 >= allowance * 95) return 'warning'
  if (used * 100 >= allowance * 80) return 'notice'
  return 'ok'
}

/** Whole percent used, rounded down; 100 when there is no allowance. */
export function usagePercent(used: number, allowance: number): number {
  if (allowance <= 0) return 100
  return Math.floor((used * 100) / allowance)
}

/** "0 B", "512 B", "820 KB", "512 MB", "4.1 GB", "5 GB". */
export function formatBytes(n: number): string {
  if (n >= GB) {
    const v = (n / GB).toFixed(1)
    return `${v.endsWith('.0') ? v.slice(0, -2) : v} GB`
  }
  if (n >= MB) return `${Math.round(n / MB)} MB`
  if (n >= KB) return `${Math.round(n / KB)} KB`
  return `${Math.max(0, Math.round(n))} B`
}
