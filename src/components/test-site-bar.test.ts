import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TEST_SITE_TEXT, TestSiteBar } from './test-site-bar'

const render = (appEnv: string | undefined) => renderToStaticMarkup(createElement(TestSiteBar, { appEnv }))

describe('TestSiteBar', () => {
  it('shows the notice on the Test site', () => {
    const html = render('test')
    expect(TEST_SITE_TEXT).toBe("TEST SITE — fictional data only. Changes here don't affect real firms.")
    expect(html).toContain('TEST SITE — fictional data only. Changes here don&#x27;t affect real firms.')
    expect(html).toContain('role="region"')
    expect(html).toContain('aria-label="Test site"')
    // In the page flow at the top (pushes content down), never an overlay.
    expect(html).toContain('sticky')
    expect(html).not.toContain('fixed')
    // Not dismissible: nothing to click.
    expect(html).not.toContain('<button')
  })

  it('renders nothing when the variable is unset or not "test"', () => {
    expect(render(undefined)).toBe('')
    expect(render('production')).toBe('')
  })
})
