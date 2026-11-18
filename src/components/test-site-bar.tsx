import { isTestSite } from '@/lib/app-env'

export const TEST_SITE_TEXT = "TEST SITE — fictional data only. Changes here don't affect real firms."

/**
 * The Test site's notice, at the top of every page (rendered by the root layout). It sits in the
 * page flow and sticks to the top, so it pushes content down instead of covering it. Fixed amber
 * and near-black in both light and dark mode (contrast about 11:1). Not dismissible.
 */
export function TestSiteBar({ appEnv = process.env.NEXT_PUBLIC_APP_ENV }: { appEnv?: string }) {
  if (!isTestSite(appEnv)) return null
  return (
    <div
      role="region"
      aria-label="Test site"
      className="sticky top-0 z-50 bg-amber-400 px-4 py-1 text-center text-sm font-semibold text-amber-950"
    >
      {TEST_SITE_TEXT}
    </div>
  )
}
