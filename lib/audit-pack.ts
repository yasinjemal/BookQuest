import crypto from "crypto";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { pool, tx } from "./pg";
import { authorizeStoredMembership } from "./spaces";

const REPORT_FORMAT_VERSION = "bookquest-audit-pack/1.0";
const generatedAt = () => new Date().toISOString();
const sha256 = (value: string | Uint8Array) => crypto.createHash("sha256").update(value).digest("hex");
const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

type AuditRow = {
  participation_id: string;
  learner_key: string;
  learner_name: string;
  attempt_number: number;
  participation_status: string;
  assigned_at: string;
  started_at: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  completion_decision: string | null;
  score_percent: number | null;
  evidence_hash: string | null;
  completion_event_id: string | null;
  attestation_count: number;
  approved_practical_count: number;
  credential_code: string | null;
  credential_status: string | null;
  credential_expires_at: string | null;
  credential_revoked_at: string | null;
};

type AuditContext = {
  space_id: string;
  space_name: string;
  assignment_id: string;
  assignment_version_id: string;
  assignment_version: number;
  course_id: number;
  course_title: string;
  course_version: number;
  completion_rule_version_id: string;
  completion_rule_version: number;
  completion_rule_hash: string;
  completion_rule_json: string;
  start_at: string | null;
  due_at: string | null;
  expires_at: string | null;
  attempt_policy_json: string;
};

function splitText(text: string, font: PDFFont, size: number, width: number) {
  const words = text.split(/\s+/).filter(Boolean).flatMap((word) => {
    if (font.widthOfTextAtSize(word, size) <= width) return [word];
    const chunks: string[] = [];
    let chunk = "";
    for (const character of word) {
      if (chunk && font.widthOfTextAtSize(chunk + character, size) > width) {
        chunks.push(chunk);
        chunk = character;
      } else chunk += character;
    }
    if (chunk) chunks.push(chunk);
    return chunks;
  });
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) line = candidate;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

async function renderAuditPdf(context: AuditContext, rows: AuditRow[], manifestHash: string) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 48;
  let page!: PDFPage;
  let y = 0;
  let pageNumber = 0;

  const newPage = (section?: string) => {
    page = pdf.addPage([pageWidth, pageHeight]);
    pageNumber += 1;
    y = pageHeight - margin;
    page.drawText("BOOKQUEST - CONTROLLED AUDIT PACK", { x: margin, y, size: 8, font: bold, color: rgb(0.20, 0.28, 0.42) });
    const pageLabel = `Page ${pageNumber}`;
    page.drawText(pageLabel, { x: pageWidth - margin - 60, y, size: 8, font: regular, color: rgb(0.35, 0.39, 0.45) });
    y -= 24;
    if (section) {
      page.drawText(section, { x: margin, y, size: 17, font: bold, color: rgb(0.08, 0.13, 0.22) });
      y -= 26;
    }
  };
  const ensure = (height: number, section?: string) => {
    if (y - height < margin + 24) newPage(section);
  };
  const line = (label: string, value: string, options?: { mono?: boolean }) => {
    const font = options?.mono ? regular : regular;
    const labelWidth = 145;
    const valueLines = splitText(value || "-", font, 9, pageWidth - margin * 2 - labelWidth);
    ensure(Math.max(18, valueLines.length * 12));
    page.drawText(label, { x: margin, y, size: 9, font: bold, color: rgb(0.25, 0.29, 0.35) });
    valueLines.forEach((valueLine, index) => page.drawText(valueLine, {
      x: margin + labelWidth, y: y - index * 12, size: 9, font, color: rgb(0.08, 0.10, 0.14),
    }));
    y -= Math.max(18, valueLines.length * 12 + 3);
  };
  const paragraph = (text: string) => {
    const lines = splitText(text, regular, 9, pageWidth - margin * 2);
    ensure(lines.length * 13 + 8);
    lines.forEach((value, index) => page.drawText(value, { x: margin, y: y - index * 13, size: 9, font: regular, color: rgb(0.16, 0.18, 0.22) }));
    y -= lines.length * 13 + 8;
  };

  newPage();
  y -= 24;
  page.drawText("Institutional completion evidence", { x: margin, y, size: 25, font: bold, color: rgb(0.06, 0.10, 0.18) });
  y -= 34;
  paragraph("This report is a scoped export of versioned assignment evidence. It records what BookQuest evaluated; it does not make a universal legal or regulatory compliance claim.");
  y -= 8;
  line("Organization", context.space_name);
  line("Course", `${context.course_title} (course ${context.course_id}, version ${context.course_version})`);
  line("Assignment", `${context.assignment_id} (version ${context.assignment_version})`);
  line("Completion rule", `Version ${context.completion_rule_version} - ${context.completion_rule_version_id}`);
  line("Generated", generatedAt());
  line("Report format", REPORT_FORMAT_VERSION);
  line("Manifest hash", manifestHash, { mono: true });
  y -= 8;
  page.drawRectangle({ x: margin, y: y - 74, width: pageWidth - margin * 2, height: 74, color: rgb(0.94, 0.96, 0.99), borderColor: rgb(0.77, 0.82, 0.90), borderWidth: 1 });
  page.drawText("Scope", { x: margin + 14, y: y - 20, size: 11, font: bold, color: rgb(0.09, 0.18, 0.32) });
  const scope = `All ${rows.length} participation attempt(s) in the selected immutable assignment version, including rule decisions, evidence hashes, attestations, practical reviews, credential state, expiry and revocation.`;
  splitText(scope, regular, 9, pageWidth - margin * 2 - 28).forEach((value, index) => page.drawText(value, { x: margin + 14, y: y - 38 - index * 12, size: 9, font: regular, color: rgb(0.14, 0.20, 0.29) }));

  newPage("Control and reconciliation summary");
  const completed = rows.filter((row) => row.completion_decision === "completed").length;
  const activeCredentials = rows.filter((row) => row.credential_status === "active").length;
  const revokedCredentials = rows.filter((row) => row.credential_status === "revoked").length;
  line("Participation attempts", String(rows.length));
  line("Completed", String(completed));
  line("Active credentials", String(activeCredentials));
  line("Revoked credentials", String(revokedCredentials));
  line("Start / due / expiry", `${context.start_at ?? "not set"} / ${context.due_at ?? "not set"} / ${context.expires_at ?? "not set"}`);
  line("Attempt policy", context.attempt_policy_json);
  line("Rule content hash", context.completion_rule_hash, { mono: true });
  y -= 8;
  paragraph("Reconciliation keys below bind each completion decision to the learner pseudonym, assignment version, course version, completion-rule version and the immutable evidence manifest stored by BookQuest.");

  newPage("Participation evidence");
  for (const [index, row] of rows.entries()) {
    ensure(176, "Participation evidence (continued)");
    page.drawRectangle({ x: margin, y: y - 20, width: pageWidth - margin * 2, height: 20, color: rgb(0.10, 0.19, 0.34) });
    page.drawText(`${index + 1}. ${row.learner_name} - attempt ${row.attempt_number}`, { x: margin + 10, y: y - 14, size: 10, font: bold, color: rgb(1, 1, 1) });
    y -= 32;
    line("Participation", row.participation_id, { mono: true });
    line("Learner key", row.learner_key, { mono: true });
    line("Status / decision", `${row.participation_status} / ${row.completion_decision ?? "not evaluated"}`);
    line("Score", row.score_percent === null ? "-" : `${row.score_percent}%`);
    line("Evidence counts", `${row.attestation_count} attestation(s); ${row.approved_practical_count} approved practical review(s)`);
    line("Completion event", row.completion_event_id ?? "-", { mono: true });
    line("Evidence hash", row.evidence_hash ?? "-", { mono: true });
    line("Credential", row.credential_code ? `${row.credential_code} - ${row.credential_status} - expires ${row.credential_expires_at ?? "never"} - revoked ${row.credential_revoked_at ?? "no"}` : "Not issued");
    y -= 9;
  }

  newPage("Interpretation and limitations");
  paragraph("A completed decision means the published completion-rule version was satisfied by evidence linked to this assignment version and exact course version at evaluation time.");
  paragraph("A revoked or expired credential must not be treated as active. Verification uses a non-enumerable private token; the display code alone cannot retrieve learner information.");
  paragraph("This report can support an organization's audit process, but acceptance for a specific purpose remains the responsibility of the named stakeholder and applicable professional or legal advisers.");
  line("Report format", REPORT_FORMAT_VERSION);
  line("Manifest hash", manifestHash, { mono: true });
  line("Rule JSON", context.completion_rule_json.replace(/,/g, ", ").replace(/:/g, ": "));

  return pdf.save();
}

function renderCsv(context: AuditContext, rows: AuditRow[]) {
  const headers = [
    "report_format_version", "space_id", "assignment_id", "assignment_version_id",
    "assignment_version", "course_id", "course_version", "completion_rule_version_id",
    "completion_rule_version", "participation_id", "learner_key", "learner_name",
    "attempt_number", "participation_status", "assigned_at", "started_at", "submitted_at",
    "completed_at", "completion_decision", "score_percent", "completion_event_id",
    "evidence_hash", "attestation_count", "approved_practical_count", "credential_code",
    "credential_status", "credential_expires_at", "credential_revoked_at",
  ];
  const output = [headers.map(csvCell).join(",")];
  for (const row of rows) {
    output.push([
      REPORT_FORMAT_VERSION, context.space_id, context.assignment_id,
      context.assignment_version_id, context.assignment_version, context.course_id,
      context.course_version, context.completion_rule_version_id,
      context.completion_rule_version, row.participation_id, row.learner_key,
      row.learner_name, row.attempt_number, row.participation_status, row.assigned_at,
      row.started_at, row.submitted_at, row.completed_at, row.completion_decision,
      row.score_percent, row.completion_event_id, row.evidence_hash,
      row.attestation_count, row.approved_practical_count, row.credential_code,
      row.credential_status, row.credential_expires_at, row.credential_revoked_at,
    ].map(csvCell).join(","));
  }
  return `${output.join("\r\n")}\r\n`;
}

export async function generateAssignmentAuditPack(
  actorUserId: number,
  assignmentId: string,
  assignmentVersionId?: string
) {
  return tx(async (client) => {
    const context = (await client.query<AuditContext>(
      `SELECT assignment.space_id, space.name AS space_name, assignment.id AS assignment_id,
              version.id AS assignment_version_id, version.version AS assignment_version,
              assignment.course_id, course.title AS course_title, version.course_version,
              rule.id AS completion_rule_version_id, rule.version AS completion_rule_version,
              rule.content_hash AS completion_rule_hash, rule.rule_json AS completion_rule_json,
              version.start_at, version.due_at, version.expires_at, version.attempt_policy_json
       FROM space_assignments assignment
       JOIN spaces space ON space.id=assignment.space_id
       JOIN courses course ON course.id=assignment.course_id
       JOIN assignment_versions version ON version.assignment_id=assignment.id
        AND version.id=COALESCE($2,assignment.current_version_id)
       JOIN completion_rule_versions rule ON rule.id=version.completion_rule_version_id
       WHERE assignment.id=$1`,
      [assignmentId, assignmentVersionId ?? null]
    )).rows[0];
    if (!context) throw new Error("Assignment not found");
    await authorizeStoredMembership(actorUserId, context.space_id, "evidence.export", client);
    const rows = (await client.query<AuditRow>(
      `SELECT participation.id AS participation_id,
              COALESCE(completion.learner_key, identity.learner_key, 'membership:' || membership.id) AS learner_key,
              users.name AS learner_name, participation.attempt_number,
              participation.status AS participation_status, participation.assigned_at,
              participation.started_at, participation.submitted_at, participation.completed_at,
              completion.decision AS completion_decision, completion.score_percent,
              completion.evidence_hash, completion.id AS completion_event_id,
              (SELECT COUNT(*)::int FROM attestation_events attestation
               WHERE attestation.participation_id=participation.id AND attestation.accepted=1) AS attestation_count,
              (SELECT COUNT(*)::int FROM practical_task_reviews review
               JOIN practical_task_submissions submission ON submission.id=review.submission_id
               WHERE submission.participation_id=participation.id AND review.decision='approved') AS approved_practical_count,
              credential.display_code AS credential_code, credential.status AS credential_status,
              credential.expires_at AS credential_expires_at,
              credential.revoked_at AS credential_revoked_at
       FROM assignment_participations participation
       JOIN space_memberships membership ON membership.id=participation.membership_id
       JOIN users ON users.id=membership.user_id
       LEFT JOIN learning_identities identity ON identity.user_id=users.id
       LEFT JOIN LATERAL (
         SELECT * FROM assignment_completion_events event
         WHERE event.participation_id=participation.id
         ORDER BY event.evaluated_at DESC, event.id DESC LIMIT 1
       ) completion ON true
       LEFT JOIN credential_records credential ON credential.completion_event_id=completion.id
       WHERE participation.assignment_version_id=$1
       ORDER BY users.name, participation.attempt_number`,
      [context.assignment_version_id]
    )).rows;
    const scope = {
      assignmentId: context.assignment_id,
      assignmentVersionId: context.assignment_version_id,
      courseId: context.course_id,
      courseVersion: context.course_version,
      completionRuleVersionId: context.completion_rule_version_id,
      includes: ["attempts", "attestations", "practical_reviews", "completion_decisions", "credential_lifecycle"],
    };
    const manifest = {
      reportFormatVersion: REPORT_FORMAT_VERSION,
      generatedAt: generatedAt(),
      scope,
      participationCount: rows.length,
      completionEventIds: rows.map((row) => row.completion_event_id).filter(Boolean),
      evidenceHashes: rows.map((row) => row.evidence_hash).filter(Boolean),
    };
    const manifestHash = sha256(JSON.stringify(manifest));
    const csv = renderCsv(context, rows);
    const pdf = await renderAuditPdf(context, rows, manifestHash);
    const artifactHash = sha256(JSON.stringify({ manifestHash, csvHash: sha256(csv), pdfHash: sha256(pdf) }));
    const pack = (await client.query<{ id: string }>(
      `INSERT INTO audit_packs
        (space_id,assignment_version_id,report_format_version,scope_json,
         manifest_json,artifact_hash,created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [context.space_id, context.assignment_version_id, REPORT_FORMAT_VERSION,
       JSON.stringify(scope), JSON.stringify({ ...manifest, manifestHash }), artifactHash,
       actorUserId]
    )).rows[0];
    return {
      id: pack.id,
      reportFormatVersion: REPORT_FORMAT_VERSION,
      manifest: { ...manifest, manifestHash },
      artifactHash,
      csv,
      pdf,
    };
  });
}

export async function getAuditPackRecord(actorUserId: number, auditPackId: string) {
  const record = (await pool.query<{
    id: string; space_id: string; assignment_version_id: string; report_format_version: string;
    scope_json: string; manifest_json: string; artifact_hash: string; status: string; created_at: string;
  }>("SELECT * FROM audit_packs WHERE id=$1", [auditPackId])).rows[0];
  if (!record) return null;
  await authorizeStoredMembership(actorUserId, record.space_id, "audit.read", pool);
  return record;
}
