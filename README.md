# Creator OS

A single place to run the business side of being a creator: brand deals, invoices,
money, goals, ideas, and the content calendar. Everything lives in your browser —
no account, no server, no data leaving the machine.

```bash
npm install
npm run dev      # http://localhost:5180
npm run build    # static bundle in dist/
```

`dist/` is plain static files and uses hash routing, so it works from any host —
or straight off disk.

---

## What's in it

**Home** — the "what needs me today" screen. Follow-ups that are due, overdue
invoices, won deals you haven't billed yet, and what you're posting today. Under
that: earnings (switchable month / quarter / year / custom range, clickable
through to the full tab), goal pace, invoices coming due, open collabs, and your
most recent ideas.

**Outreach & Follow-ups** — the deal database. Brand, contact, date they reached
out, deliverables and quantities, ad-rights months, what you quoted vs what they
offered vs what you agreed, stage, follow-up date and notes. Sortable table on
desktop, cards on smaller screens, exportable to `.xlsx` or `.csv`.

**Invoices** — a builder with three real templates (Modern, Classic, Minimal), a
theme colour picker, and a live PDF preview that *is* the actual PDF, not a
mockup. Invoice numbers auto-increment but stay editable; GST supports none /
CGST+SGST / IGST; totals include an amount-in-words line using Indian numbering.
Everything you enter feeds the tracker: paid / pending / due-soon / overdue, with
one-click "mark paid".

**Earnings** — collected, still-owed, expenses, and actual earnings
(collected − expenses) for any period. Growth chart with a running-net line, a
where-the-money-went breakdown, and every transaction clickable for full detail.
One button records an expense (or non-invoice income like a platform payout).

**Content Planner** — kanban (Scripting → To Shoot → Editing → Published) with
drag-and-drop, plus a calendar view showing shoot / edit / post days. Each piece
holds a reference URL, the script, the caption and hashtags, and exports to a
one-page PDF.

**Ideas** — type a topic, press Enter, move on. Open one later to dump the whole
thought. Categories, search, star, and a "send to planner" button that promotes an
idea into production.

**Templates** — the replies, rate-card explainers and scripting frameworks you
rewrite too often. Categories, search, pin, copy-to-clipboard, PDF export.

**Inspiration** — creators you learn from, with a note on *what* to steal.

**Goals** — followers, earnings, content output, or anything custom. Each shows
progress against a pace marker, so "behind" means behind *for today*, not just
"not finished". Earnings and content-output goals track themselves from your
invoices and published pieces.

## How the pieces connect

```
Deal marked Closed/Delivered
        │  prompts →  Invoice (pre-filled from the deal)
        │                 │  marked paid →  Earnings
        │                 │                     │
        └─────────────────┴─────────────────────┴→  Goals (auto-tracked)

Idea  →  "Send to planner"  →  Content piece  →  Published  →  Goals
```

The point is that money never falls through a crack: a won deal that hasn't been
invoiced shows up on the home screen and in two other places until you bill it.

## Themes

Seven, switchable from the sidebar (or the "More" sheet on mobile): Light,
Charcoal, and five light pastels — Sand, Mint, Lavender, Blush, Sky. Every colour
in the UI, including buttons, charts and badges, is derived from CSS variables, so
the whole app recolours together.

## Your data

State is kept in `localStorage` under `creator-os.state.v1`, written on a short
debounce and flushed when the tab closes. That means it is fast and private, but
also that **clearing your browser data deletes it**. Settings → *Save backup
(.json)* writes a file that restores everything exactly; *Export everything
(.xlsx)* produces a nine-sheet workbook for reading elsewhere.

Settings also has *Load sample data* if you want to look around with something in
it first, and *Erase everything* to get back to empty.

## Stack

React 19 + TypeScript + Vite, Tailwind for styling, framer-motion for transitions,
Recharts for graphs, dnd-kit for the kanban, jsPDF for PDFs and SheetJS for
spreadsheets. The two heavy libraries (SheetJS, jsPDF) are dynamically imported so
they only download when you actually export something.

## Layout

```
src/
  lib/
    types.ts        every entity and the enums that describe them
    store.tsx       React context store, persistence, sample data
    selectors.ts    date ranges, the transaction ledger, "needs attention" queries
    utils.ts        dates, currency, invoice maths, goal pace
    export.ts       CSV / XLSX writers
    pdf/invoice.ts  the three invoice templates
    pdf/doc.ts      script, template and idea one-pagers
  components/       UI primitives, app shell, category controls
  pages/            one file per tab
```

## Notes

- Dates are handled in local time throughout; `toISOString()` is deliberately
  avoided for date-only values because it shifts the day across time zones.
- Opening the invoice editor creates a draft immediately so edits autosave. If you
  leave without typing anything, the draft is discarded and its invoice number is
  released, so the sequence keeps no holes.
- `₹` has no glyph in jsPDF's built-in fonts, so PDFs render it as `Rs.` rather
  than a broken character.
