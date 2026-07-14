# Phase 4 portable achievement export

**Profile:** `bookquest-open-badges-3.0-jsonld-document-v1`  
**Engineering status:** Deployed

**Engineering scope:** readable export remains unsigned; signed VC-JWT is a
separate deployed workflow

**External validation status:** Pending user acquisition
**External validation reason:** `Pending user acquisition and partner access`

## Standards decision

The selected document shape follows the final 1EdTech Open Badges 3.0
AchievementCredential JSON/JSON-LD model and its Verifiable Credentials Data
Model 2.0 context:

- specification: <https://www.imsglobal.org/spec/ob/v3p0/>
- normative schema: <https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_achievementcredential_schema.json>
- certification profile: <https://www.imsglobal.org/spec/ob/v3p0/cert/>

BookQuest validates its selected, deliberately narrow export profile locally. It
does not claim 1EdTech product certification, cryptographic issuer conformance,
or implementation of the Open Badges OAuth API.

## Privacy and evidence contract

- Export requires the authenticated learner who owns the exact current claim.
- Another learner, a Space manager, an auditor and an unknown identifier receive
  the same unavailable result.
- Learner name is excluded by default and included only by an explicit choice;
  email and internal numeric account ID are never exported.
- The document contains one claim only. Its evidence entry freezes the course,
  course version, assignment version, completion-rule version, completion
  decision, participation, credential and evidence hash.
- Superseded, revoked, expired or otherwise unreconciled evidence cannot export.
- Responses are private, `no-store`, download-only JSON-LD and identify the exact
  profile used for validation.

## Important limitation

The readable JSON-LD document has `proof=unsigned` and must not be presented as a
signed credential. Learners can separately issue a Compact JWS using the managed
RS256, public-key, status and revocation contract in
`docs/PHASE_4_OPEN_BADGE_ISSUANCE.md`.
