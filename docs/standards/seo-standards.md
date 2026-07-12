# SEO & AI Search Rulebook — Axon Tickets

**Who reads this:** the `seo-auditor` agent (release checks + scheduled audits), plus the frontend and devops reviewers for their overlapping checks.
**Plain-English goal:** when someone — or someone's AI assistant — looks for events in the Philippines, Axon Tickets events show up, with the right date, venue, and price. And the test site never shows up anywhere.

---

## Known gaps (recorded 2026-07-07, before gate system existed)

- ❌ Production serves **no `robots.txt`** (returns the 404 page)
- ❌ Production serves **no `sitemap.xml`**
- ❌ No `metadataBase` / canonical URL configuration in `apps/web/src/app/layout.tsx`
- ❌ No `llms.txt`
- ❌ No JSON-LD Event structured data on event pages
- ⚠️ UAT is currently unreachable to crawlers only because of a Vercel redirect — protection by accident, not by design

These are the first items to fix when SEO work begins.

## Hard rules

1. **Prod `robots.txt`** (via App Router `robots.ts`): allow all major crawlers **and** AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot, Bingbot); disallow `/admin`, `/api`, `/auth`, `/account`, `/checkout`.
   *Policy decision (needs one-time sign-off in the ledger): AI crawlers allowed on prod — distribution upside outweighs training-data concerns for a ticketing platform.*
2. **UAT blocks everything:** robots disallow-all + `noindex` meta/header, driven by `NEXT_PUBLIC_APP_ENV` — deliberate, not reliant on Vercel redirects.
3. **Sitemap** (`sitemap.ts`): all published event pages + key public pages, regenerated per request so new events appear without redeploys.
4. **Event pages ship JSON-LD `schema.org/Event`** — `name`, `startDate`, `endDate`, `location` (venue, address, city), `offers` (`price` in PHP, `priceCurrency: "PHP"`, `availability`), `image`, `organizer`. Validate against Google's Rich Results rules.
5. **Server-rendered public content** — AI crawlers run no JavaScript. If it matters, it's in the HTML.
6. **Canonical URLs:** set `metadataBase` to `https://axontickets.online`; every public page gets a canonical; UAT never emits prod canonicals... and never gets indexed anyway (rule 2).

## Content & structure rules

7. Key facts in plain text on the page — date, venue, city, price visible as text, not only inside interactive widgets.
8. One `<h1>` = event title; sensible heading tree.
9. Stable slugs; renames ship 301s.
10. `llms.txt` at the site root: short markdown description of what Axon Tickets is, what's on the site, and where the event listings live.
11. OG + Twitter cards per event (dynamic title/description/image), not just the site-wide defaults.

## Monitoring loop (scheduled — the "AI visibility check" watcher)

Run monthly (or after major releases):

1. **Fetch-as-bot test:** request 3 live event pages with GPTBot and PerplexityBot user agents — confirm 200 + full content in HTML.
2. **Rich results validation** on 3 event pages.
3. **UAT leak check:** confirm UAT still blocks all crawlers; search `site:uat.axontickets.online` — must return nothing.
4. **AI citation check:** ask AI search engines 3–5 real buyer questions ("events in Davao this month", "how to buy tickets for <live event>") and record whether Axon Tickets is cited. Log the citation rate over time in `docs/signoffs/seo-visibility-log.md`.
5. **Sitemap freshness:** confirm newest published event appears in `sitemap.xml`.

## What the auditor checks, in order

1. robots.txt correct per environment?
2. Sitemap present, fresh, and valid?
3. JSON-LD complete and valid on event pages?
4. Full content server-rendered for bot user agents?
5. Canonicals + metadataBase correct?
6. UAT invisible (robots + noindex + search check)?
7. llms.txt present and current?
8. Citation-rate trend recorded?
