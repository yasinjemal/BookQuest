# BookQuest 📖→🎮

Turn any book or document (PDF, DOCX, Markdown, TXT) into a bite-size,
game-like course — Duolingo/Sololearn style. Mobile-first PWA that works
offline once a course is generated. Built as a personal learning tool with a
long-term vision of an empowering learning platform for African learners.

## How it works

1. **Upload** a document on the home screen.
2. The app extracts the text and splits it into chapters.
3. **Claude** designs a course outline, then writes lessons module by module:
   short concept cards, examples, and quizzes (multiple choice, true/false,
   fill-in-the-blank), ending with a recap.
4. **Learn** on a Duolingo-style path: earn XP, keep a daily streak, and
   questions you miss come back in the **Review** tab with spaced repetition.

## Setup

1. Install dependencies: `npm install`
2. Create an API key at https://console.anthropic.com and paste it into
   `.env.local`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
3. Start the app: `npm run dev` → open http://localhost:3000
4. (Optional) Seed a demo course without an API key:
   `node scripts/seed-demo.mjs`

Generation cost: roughly $0.50–$3 per full book with Claude Opus 4.8.
To cut costs ~3–5x, change `MODEL` in `lib/generator.ts` to `claude-sonnet-5`.

## Tech

- Next.js 15 (App Router) + TypeScript + Tailwind CSS 4
- SQLite (`better-sqlite3`) — all data stays on your machine in `data/`
- `@anthropic-ai/sdk` with structured outputs (`zodOutputFormat` +
  `messages.parse`) so course JSON always matches the Zod schemas in
  `lib/schemas.ts`
- Hand-rolled service worker (`public/sw.js`): network-first for API data,
  stale-while-revalidate for the app shell → learning works offline

## Key files

| File | Purpose |
|---|---|
| `lib/schemas.ts` | Zod schemas for cards/lessons/outline (shared by generator & UI) |
| `lib/extract.ts` | PDF/DOCX/MD text extraction + chapter splitting |
| `lib/generator.ts` | Claude pipeline: outline call → per-module lesson calls |
| `lib/db.ts` | SQLite schema + queries (progress, XP, streak, spaced repetition) |
| `app/course/[id]/page.tsx` | Duolingo-style lesson path |
| `app/lesson/[id]/page.tsx` | Card-by-card lesson player |
| `app/review/page.tsx` | Spaced-repetition review session |
