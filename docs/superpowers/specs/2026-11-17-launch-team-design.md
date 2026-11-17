# FirmSync launch team — design

Status: draft for approval · 2026-11-17

## 1. Intent

The owner wants to take FirmSync to go-live as a paid product without doing all the building, writing and coordinating alone. An AI team does the work in clear roles; the owner makes the decisions and does the things only a person can (accounts, payments, legal, publishing). The team works from one go-live checklist in the FirmSync repository, and the owner talks mainly to one coordinating role, the launch manager.

**Launch day (decided):** FirmSync on its own custom domain, with a marketing website, a landing page, and self-serve sign-up with billing. Supporting decisions are logged in `launch/decisions.md` (pricing, founding offer, CPA referrals, support, separate website on the main domain with the app on `app.`).

**Success:** the owner can see at any time what is done, what's in progress, and what is waiting on them; each piece of work arrives finished, tested and explained; nothing goes public, costs money or changes production without the owner's yes.

## 2. Goals, non-goals, anti-goals

**Goals**
- Team roles defined once, in the repo, with FirmSync-specific instructions.
- A single go-live checklist with owners (role or the owner) and status.
- A marketing website in Framer, built by the owner from AI-written page copy, on the main domain.
- A weekly status summary without being asked.

**Non-goals**
- Setting a launch date (the owner hasn't one).
- Fully autonomous agents that act without the owner on decisions.
- Live chat or paid ads at launch.

**Anti-goals**
- Anything published, sent, bought, signed or applied to production without the owner's explicit approval.
- AI-written legal text presented as final (terms, privacy, partner agreement need the owner and a lawyer).
- Two places that disagree (website prices vs. Stripe; checklist vs. reality).
- Long, drifting sessions that lose track; each piece of work starts from a written brief.

## 3. Approaches considered

- **A. Launch manager + specialists per piece of work (chosen).** One coordinating session owns the checklist and starts a dedicated session per piece of work with a role and a brief; sessions report back; the launch manager checks and updates the checklist. Most organised; needs a little setup.
- **B. Standing departments the owner talks to.** Simple to picture, but the owner coordinates, and long-lived sessions lose detail. Rejected.
- **C. Fully automatic scheduled agents.** Unsuitable for decision-heavy launch work; used only for the weekly status summary.

Website: **Framer (chosen by the owner, 2026-11-17)** over a code-built site. The owner can edit it directly without a developer; the AI team writes the copy and structure and the owner places it (or the AI does small edits in the owner's browser, with approval).

## 4. Structure

```
Documents\FirmSync\                     ← one git repo (sd206/firmsync), the team's home
  CLAUDE.md                             ← team charter: what FirmSync is, folder map, standing rules, approvals, how work flows
  .claude\agents\                       ← role definitions (below)
  src\ supabase\ tests\ docs\ …         ← the app (Vercel)
  launch\checklist.md                   ← the go-live checklist
  launch\decisions.md                   ← decisions log (exists)
  launch\status\YYYY-MM-DD.md           ← weekly status summaries
  marketing\                            ← positioning, LinkedIn and outreach drafts, CPA partner kit, comparison research
  marketing\website\                    ← page-by-page website copy and Framer CMS import files
  marketing\media\                      ← videos and images (not in git; exists)
```

**Website in Framer** *(owner's choice)*: the site lives in Framer on the main domain (landing page, features, pricing, about, contact, help centre and articles in Framer's CMS, terms, privacy). Sign-up and log-in buttons link to `app.<domain>` as decided, with the plan, `utm_*` and `ref` values in the link. Nothing for the website lives in the repo except the copy in `marketing/website/`.

## 5. Roles

Each role is a file in `.claude/agents/` with: purpose, what it may do, what it must ask the owner about, the FirmSync context it must read first (CLAUDE.md, decisions log, relevant spec), and its definition of done.

| Role | Does | Never does without the owner |
|---|---|---|
| **Launch manager** | Keeps `launch/checklist.md` current; turns the next ready item into a brief; starts the right specialist session; checks results against the brief; writes the weekly status; tells the owner exactly what's waiting on them. | Start work the owner hasn't agreed to; change decisions. |
| **Developer** | Builds app and website features from approved designs and plans, test-first; follows the project's design → plan → build → review process. | Merge, push, apply production migrations, change production settings. |
| **Reviewer** | Reviews a finished branch with fresh eyes (correctness, security, the design's intent) and reports findings. | Change code. |
| **Website & copy writer** | Writes ready-to-place website copy (one file per page: sections, headlines, body, buttons with exact links, image/screenshot requests), Framer CMS import files for articles, comparison pages, LinkedIn posts, outreach and CPA partner material, in FirmSync's voice for small-firm owners. | Publish or send anything; edit the live Framer site; state prices or claims not in the decisions log. |
| **Support writer** | Writes help-centre articles from the product's real behaviour; drafts replies to support emails the owner pastes in. | Reply to customers. |

The launch manager is the session the owner opens in the FirmSync folder; the others run as separate sessions the launch manager starts (visible and steerable in the owner's sidebar), each from a brief that names the role file, the checklist item, the files involved and what done looks like.

## 6. How work flows

1. The launch manager picks the next ready checklist item (dependencies met, owner inputs available) and proposes it; the owner says go.
2. It writes a brief and starts a specialist session.
3. The specialist works; anything needing a decision comes back to the owner through the launch manager.
4. The specialist finishes on its own branch (code) or in `marketing/` / `launch/` (drafts) and reports. Website copy is placed into Framer by the owner.
5. The launch manager checks the result against the brief (for code: tests green and a Reviewer pass), marks the item done or sends it back, and asks the owner for any approval needed (merge, publish, apply).
6. Several items can run in parallel when they touch different files.

## 7. Go-live checklist (initial content)

Each item: owner (role or **You**), depends on, status. Initial items:

**Product (Developer)**
1. Part 2 — sign-up and Stripe billing, incl. founding prices, $100 referral credit, partner codes and Platform › Partners, sign-up safeguards (needs: **You** create a Stripe account, test mode).
2. Part 3 — read-only mode and data deletion.
3. In-app Help menu: help-centre link and Contact support form that emails `support@` with firm/user/page/browser.
4. Custom-domain readiness: app works on `app.<domain>`; auth redirect URLs, email links and `NEXT_PUBLIC_SITE_URL` switch by configuration.

**Website (Website & copy writer, then You)**
5. Site map and page-by-page copy in `marketing/website/`: home/landing, features, pricing (from the decisions log), about, contact, help-centre index; sign-up and log-in links with the right parameters.
6. **You:** create the Framer site and build the pages from that copy (Framer plan with custom domain); brand colours and logo shared with the app.
7. Terms and privacy pages (wording from **You**/lawyer; placeholders until then).
8. Comparison pages (vs. BigTime; vs. Harvest + QuickBooks) after a current competitor price check.
9. ~15 help-centre articles as a Framer CMS import file (Support writer); **You** import them.

**Accounts and setup (You, with step-by-step guidance from the launch manager)**
10. Buy the domain; DNS: main domain → Framer, `app.` → the app on Vercel.
11. Email on the domain (e.g. Google Workspace): `support@`; sending domain verified in Resend (SPF/DKIM); Supabase SMTP; `NOTIFY_FROM`.
12. Stripe account; Stripe Tax decision; live mode at launch.
13. Production environment for the custom domain (its own Supabase project and live keys, per the billing design) — the launch manager prepares the runbook.
14. Terms of service, privacy policy, CPA partner agreement (lawyer).

**Marketing (Website & copy writer)**
15. Positioning one-pager (who, problem, promise, proof).
16. LinkedIn plan and first 8 posts; outreach message templates.
17. CPA partner kit (one-pager, referral link instructions, client email template).
18. Launch announcement (email + LinkedIn).

**Go-live (Launch manager + You)**
19. Go-live runbook: order of switches, checks, rollback; launch-day test sign-up with a real card and refund.

## 8. Weekly status

A scheduled task runs every Monday morning on the owner's computer *(our call: local scheduled task, not a cloud agent, because it reads the local repo)*: it reads the checklist, the decisions log and the past week's git history, and writes `launch/status/YYYY-MM-DD.md` with done this week, in progress, waiting on the owner, and next up. It changes nothing else.

## 9. Constraints

- Standing rules (from the owner): commit/push/merge only when asked, on branches; production migrations only after a dry run and a yes; no secrets typed into production sites; public material uses only the fictional demo firm; don't kill all node processes.
- The owner approves: merges and pushes, production changes, anything published or sent, any purchase or account creation, legal text, prices and offers.
- Roles must read `launch/decisions.md` before work that touches pricing, offers or positioning.

## 10. Decisions from the design review *(our calls; check while reading)*

1. **Website in Framer.** The owner briefly chose a code-built site, then settled on Framer (2026-11-17). The writer role never edits Framer itself; small browser edits by AI happen only with the owner watching and approving.
2. **Who is the launch manager, and how specialists start.** The launch manager is the owner's main session in the FirmSync folder, defined by CLAUDE.md (not an agent file). Specialists start as new sessions in the Claude desktop app (visible in the sidebar), each told to read its role file in `.claude/agents/` plus the brief. Code work gets its own worktree and branch; writing work goes into `marketing/` or `launch/` on a branch. The role files are also valid subagents, so the launch manager can run a quick Reviewer or writer pass inside its own session when a whole session isn't worth it.
3. **Weekly status is write-only and uncommitted.** The Monday task writes `launch/status/YYYY-MM-DD.md` and nothing else; it never commits (the owner commits status files with other work, or not at all). If the computer is off on Monday, that week is skipped; the launch manager writes a status on request any time.
4. **Approval rules are enforced, not just written down.** Besides CLAUDE.md, the repo's `.claude/settings.json` makes Claude Code ask the owner before `git push`, `git merge` into main, `supabase db push` against the linked project, and Vercel production commands. Role files limit tools: the Reviewer gets no edit tools; writers may edit only files in `marketing/` and `launch/`.
5. **Starting state.** No CLAUDE.md or `.claude/agents/` exist yet (both new). Developer briefs point to the project's existing design → plan → build → final review process (the superpowers skills used for every feature so far) and to `docs/superpowers/specs/2026-11-16-saas-billing-storage-design.md`. Part 1 (storage limits) is done; every checklist item starts as not started, with the Stripe account and domain marked as waiting on the owner.
6. **Reviewer pass.** Required for code touching money, sign-in, permissions, data deletion or production setup; at the launch manager's discretion for copy, styling and small config changes.

## 11. Left to the builder

- Exact wording of CLAUDE.md and the role files, within §5 and §9.
- Checklist format (a Markdown table or sections), as long as each item shows owner, dependency and status.
- The format of the website copy files and the CMS import file, as long as the owner can place them in Framer directly.
- The weekly task's exact schedule time.
