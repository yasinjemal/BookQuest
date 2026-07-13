import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { generateAssignmentAuditPack } from "../lib/audit-pack";
import { pool, ready } from "../lib/pg";

async function main() {
  await ready();
  const row = (await pool.query<{
    assignment_id: string;
    assignment_version_id: string;
    auditor_user_id: number;
  }>(
    `SELECT assignment.id AS assignment_id,
            completion.assignment_version_id,
            membership.user_id AS auditor_user_id
     FROM space_assignments assignment
     JOIN assignment_completion_events completion ON completion.assignment_version_id IN (
       SELECT id FROM assignment_versions WHERE assignment_id=assignment.id
     )
     JOIN space_memberships membership ON membership.space_id=assignment.space_id
     WHERE membership.role='auditor' AND membership.status='active'
       AND completion.decision='completed'
     ORDER BY completion.evaluated_at DESC LIMIT 1`
  )).rows[0];
  if (!row) throw new Error("A test assignment and active auditor are required");
  const pack = await generateAssignmentAuditPack(
    row.auditor_user_id,
    row.assignment_id,
    row.assignment_version_id
  );
  const output = path.resolve("output", "pdf");
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, "phase3-audit-pack-sample.pdf"), pack.pdf);
  await writeFile(path.join(output, "phase3-audit-pack-sample.csv"), pack.csv, "utf8");
  process.stdout.write(JSON.stringify({
    auditPackId: pack.id,
    pdf: path.join(output, "phase3-audit-pack-sample.pdf"),
    csv: path.join(output, "phase3-audit-pack-sample.csv"),
    artifactHash: pack.artifactHash,
  }));
}

main().finally(() => pool.end());
