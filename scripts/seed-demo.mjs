// Seeds a small demo course so the learner UI can be tried without an API key.
// Run: node scripts/seed-demo.mjs   (reads DATABASE_URL from .env.local)
import { readFileSync } from "fs";
import { Pool } from "pg";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const existing = (
  await pool.query("SELECT id FROM courses WHERE source_filename = 'demo'")
).rows[0];
if (existing) {
  console.log(`Demo course already seeded (course ${existing.id})`);
  await pool.end();
  process.exit(0);
}

const courseId = (
  await pool.query(
    "INSERT INTO courses (title, description, source_filename, status) VALUES ($1, $2, 'demo', 'ready') RETURNING id",
    ["Money Basics (Demo)", "Learn how money, banks and saving work."]
  )
).rows[0].id;

const mod1 = (
  await pool.query(
    "INSERT INTO modules (course_id, title, summary, position, status) VALUES ($1, $2, $3, 0, 'ready') RETURNING id",
    [courseId, "Understanding Money", "Why money exists and what it does."]
  )
).rows[0].id;

const lesson1Cards = [
  { type: "concept", title: "Before money: barter", body: "Long ago, people traded goods directly for other goods. This is called barter. If you had fish and wanted shoes, you had to find a shoemaker who wanted fish." },
  { type: "quiz_mcq", question: "What is barter?", options: ["Trading goods directly for other goods", "Buying with coins", "Saving money in a bank", "Lending money for interest"], correct_index: 0, explanation: "Barter means swapping goods or services directly, without money." },
  { type: "concept", title: "The problem with barter", body: "Barter only works if each person wants exactly what the other has. Economists call this the double coincidence of wants — and it made trade slow and difficult." },
  { type: "quiz_truefalse", statement: "Barter works easily even when the other person does not want what you have.", answer: false, explanation: "Barter needs both sides to want each other's goods — the double coincidence of wants." },
  { type: "concept", title: "Money fixes it", body: "Money is anything people widely accept as payment. With money, you can sell your fish to anyone and use the money to buy shoes from anyone." },
  { type: "quiz_fillblank", sentence: "Money acts as a medium of ___.", answer: "exchange", accepted_answers: ["exchanges"], explanation: "As a medium of exchange, money lets anyone trade with anyone." },
  { type: "recap", title: "What you learned", points: ["Barter = direct trading, slow and hard", "Money is widely accepted payment", "Money works as a medium of exchange"] },
];

const lesson2Cards = [
  { type: "concept", title: "Three jobs of money", body: "Money does three jobs: a medium of exchange (you pay with it), a store of value (you save it), and a unit of account (you price things with it)." },
  { type: "example", title: "A market day example", body: "You sell vegetables for 500 shillings (exchange), keep 200 for next week (store of value), and know a bag of rice costs 300 (unit of account)." },
  { type: "quiz_mcq", question: "Saving money for next month uses money as a…", options: ["Store of value", "Medium of exchange", "Unit of account", "Type of barter"], correct_index: 0, explanation: "Saving means money holds its value over time — a store of value." },
  { type: "quiz_truefalse", statement: "Pricing goods in one currency uses money as a unit of account.", answer: true, explanation: "A unit of account is a common measure for prices." },
  { type: "recap", title: "Key takeaways", points: ["Money = exchange + store of value + unit of account", "Each job makes trade and planning easier"] },
];

await pool.query(
  "INSERT INTO lessons (module_id, title, position, cards) VALUES ($1, $2, $3, $4)",
  [mod1, "Why money exists", 0, JSON.stringify(lesson1Cards)]
);
await pool.query(
  "INSERT INTO lessons (module_id, title, position, cards) VALUES ($1, $2, $3, $4)",
  [mod1, "The three jobs of money", 1, JSON.stringify(lesson2Cards)]
);

console.log(`Seeded demo course ${courseId}`);
await pool.end();
