# Website site map

Checklist item 5. Draft for the owner, to build in Framer. The website lives on the main domain; the app lives on `app.<domain>` (`launch/decisions.md`, 2026-11-17). Keep `<domain>` as written until the domain is bought (item 10).

Sources: prices and offers from `launch/decisions.md`; features from `README.md`; messages and words from `marketing/positioning.md`.

## Pages

| Page | Path | Purpose | Copy file | Status |
|---|---|---|---|---|
| Home (also the landing page) | `/` | Say who FirmSync is for and what it does in one screen, show the three main messages, show the price, and send visitors to sign up. Campaign traffic (LinkedIn, outreach) lands here. | `home.md` | Ready to place |
| Features | `/features` | Walk through the time-to-cash flow, section by section, for visitors checking whether FirmSync does what they need. | `features.md` | Ready to place |
| Pricing | `/pricing` | List prices, the founding offer, annual billing, a worked example, storage, the guarantee and a pricing FAQ. | `pricing.md` | Ready to place |
| About | `/about` | Who is behind FirmSync, who it's for, and how we work (plain prices, real replies). | `about.md` | Needs owner's story (placeholders) |
| Contact | `/contact` | The support address and the reply promise. | `contact.md` | Ready to place once the domain exists |
| Help centre | `/help` | Index of help articles by category, with a search box and a contact link. | `help-centre.md` | Index ready; articles are item 9 |
| Help category | `/help/<category-slug>` | Framer CMS collection page listing a category's articles. | `help-centre.md` (categories) | With item 9 |
| Help article | `/help/<article-slug>` | Framer CMS article page. | Item 9 (Support writer) | Not in this item |
| Terms of service | `/terms` | Legal. | Item 7 | Not in this item; footer link only |
| Privacy policy | `/privacy` | Legal. | Item 7 | Not in this item; footer link only |
| Comparison: FirmSync vs BigTime | `/compare/bigtime` | Search content. | Item 8 | Not in this item; footer link once written |
| Comparison: FirmSync vs Harvest + QuickBooks | `/compare/harvest-quickbooks` | Search content. | Item 8 | Not in this item; footer link once written |
| Not found | `/404` | Framer's 404 page: "We can't find that page." Buttons: [Go to the home page](/) · [Visit the help centre](/help). | This file | Ready to place |

**Owner decision:** the help centre at `/help` (assumed throughout). Alternatives: `/support` or a `help.<domain>` subdomain. `/help` keeps it in the same Framer project and the same domain as the rest of the site.

## Main navigation (header, every page)

Left: FirmSync logo → `/`

Middle:
- Features → `/features`
- Pricing → `/pricing`
- Help → `/help`
- About → `/about`

Right:
- Log in → `https://app.<domain>/login`
- **Start now** (primary button) → `https://app.<domain>/signup?plan=monthly`

On mobile, the middle links and Log in go into the menu; Start now stays visible.

## Footer (every page)

**Product:** Features (`/features`) · Pricing (`/pricing`) · Log in (`https://app.<domain>/login`) · Start now (`https://app.<domain>/signup?plan=monthly`)

**Compare** *(add when item 8 is published)*: FirmSync vs BigTime (`/compare/bigtime`) · FirmSync vs Harvest + QuickBooks (`/compare/harvest-quickbooks`)

**Support:** Help centre (`/help`) · Contact (`/contact`) · support@<domain> (`mailto:support@<domain>`)

**Company:** About (`/about`) · Terms (`/terms`) · Privacy (`/privacy`)

Bottom line: `© <year> FirmSync. Prices in US dollars.` *(Owner: add the legal business name here if it differs from FirmSync.)*

Terms and Privacy must exist before live sales (`docs/superpowers/specs/2026-11-16-saas-billing-storage-design.md` §10). Until item 7 is done, keep those footer links pointing at the placeholder pages, or hide them and keep sign-up closed.

## Link formats (used in every page file)

| Link | Exact URL |
|---|---|
| Sign up, monthly | `https://app.<domain>/signup?plan=monthly` |
| Sign up, annual | `https://app.<domain>/signup?plan=annual` |
| Sign up from a campaign | add `utm_*` after the plan, e.g. `https://app.<domain>/signup?plan=monthly&utm_source=linkedin&utm_medium=social&utm_campaign=launch` |
| Sign up from a CPA partner | add `&ref=<code>` last, e.g. `https://app.<domain>/signup?plan=monthly&ref=<code>` (pattern only; partner codes are created per partner) |
| Log in | `https://app.<domain>/login` |
| Website pages | relative paths: `/`, `/features`, `/pricing`, `/about`, `/contact`, `/help` |
| Support email | `mailto:support@<domain>` |

Example `utm_*` values (suggested; the owner picks the final set and keeps them consistent):

| Where the link is shared | utm_source | utm_medium | utm_campaign |
|---|---|---|---|
| Owner's LinkedIn post | `linkedin` | `social` | `launch` |
| Owner's one-to-one outreach | `outreach` | `email` | `launch` |
| Founding-offer push | `linkedin` or `outreach` | `social` or `email` | `founding` |

Website sign-up buttons on the site itself carry the plan only, no `utm_*`. The `utm_*` values go on links shared outside the site (posts, emails) that point at a website page or straight at sign-up. When a visitor lands on a website page from a campaign link, carrying those values on to the sign-up button needs a small Framer script or setting; that's an owner/Framer decision (see the report).

## Images

All screenshots and images use the fictional **Demo Consulting** firm only: fictional consultants, clients, projects, invoices and amounts. No real customer data, names or emails. Each page file lists the screenshots its sections need. Screenshots go in `marketing/media/` (not in git).
