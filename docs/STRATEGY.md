# Platform Strategy — The Moats

> Why these four: **algorithms alone can be copied; data flywheels, trust layers
> and distribution cannot.** Every idea below gets stronger with each learner,
> creating an asset competitors cannot rebuild by copying code. Our seed
> advantage: we are the only platform that BOTH generates courses from any
> document AND tracks concept-level answers — so we can instrument learning at
> the atom level, from day one, across every subject.

## 1. The Learning Genome 🧬 — the data moat

**What:** A global concept graph across all courses, calibrated by every
answer from every learner.

- Normalize concept tags across courses ("compound interest" in course A = course B)
- Learn prerequisite edges (learners who fail X usually also fail Y → Y before X)
- Item Response Theory on questions: measure real difficulty & discrimination
  from answer data; auto-retire confusing questions; auto-regenerate better ones
- Enables: placement tests ("you already know 60% of this book — start at
  Unit 4"), adaptive paths, cross-course recommendations

**Moat mechanics:** every new learner calibrates the graph further. A
competitor who copies the code starts with an empty brain.

**Foundation to build FIRST (cheap, compounds daily, cannot be backfilled):**
an append-only `answers` ledger — every quiz answer with user, course, lesson,
card index, concept, correct, latency, timestamp. Start logging before
building any feature on top.

## 2. Skill Passport + Employer API 🛂 — the dependence layer

**What:** Aggregate a learner's mastery + certificates into a portable,
verifiable competency profile. Expose an **employer verification API**:
"show me this candidate's evidenced skills."

- Profile: concepts mastered, evidence volume (n answers over m months),
  certificates with scores
- Public verify link (extends the existing `/cert/[id]` pattern)
- Employer accounts: search/verify candidates, request skill checks
- Anti-cheat matters at this stage: timed questions, fresh AI questions at
  verification time (can't memorize), consistency signals

**Moat mechanics:** trust accumulates. Once employers verify through us,
learners must learn through us — two-sided lock-in. In markets where degree
signals are weak, being the skills-verification layer is the "industry
depends on us" position.

## 3. Compliance Training Engine 🏭 — the B2B money machine

**What:** Organizations upload their own SOPs / safety manuals / policy docs →
auto-generated training → assign to staff → **exportable audit report** (who
was trained on what, when, with mastery evidence).

- Org accounts (extends classrooms: an org = classrooms + billing + branding)
- Mandatory-training industries: banking, health, mining, manufacturing, NGOs
- The audit trail is the product: regulators ask "prove your staff was
  trained" — we answer with evidence, timestamped
- Pricing: per-seat monthly; orgs don't churn from their own audit history

**Moat mechanics:** revenue + workflow lock-in. "Compliance-grade training
from your own documents in one hour" has no African SME competitor.

## 4. WhatsApp Learning Delivery 📱 — the distribution moat

**What:** Lessons and quizzes delivered through WhatsApp (Business API). No
app install, works on the cheapest phones, familiar to every learner.

- Daily lesson drip + quiz replies + streak nudges in chat
- Our content is *born* chat-sized (cards) — competitors' long-form courses
  structurally cannot follow us here
- Also the growth channel: shareable class codes and challenge links in chat

## Build order

**3 → 2 → 1 → 4**, with one exception: the **answers ledger (from #1) is
built immediately** — it costs almost nothing and its data compounds from the
first day, feeding all four.

| Phase | Ships | Revenue impact |
|---|---|---|
| 0 (now) | Answers ledger logging | none yet — data asset |
| 1 | Org accounts + audit reports (compliance) | B2B seats |
| 2 | Skill Passport + employer verify API | employer fees, learner premium |
| 3 | Genome features: placement, IRT calibration, adaptive paths | retention/premium |
| 4 | WhatsApp delivery | growth engine |
