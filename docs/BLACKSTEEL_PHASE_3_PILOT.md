# Blacksteel Clothing Phase 3 pilot

**Status:** confirmed, not started  
**Partner:** Blacksteel Clothing Pilot  
**Sector and country:** clothing wholesale and retail, South Africa  
**Responsible stakeholder:** business owner  
**Planned cohort:** one administrator and three to five employees

This runbook records the agreed scope without claiming that an unobserved journey
or assessment has passed. The final source document and pilot dates are still open.

## Purpose and agreed outcome

The pilot will turn one employee-onboarding and shop-procedures document into an
assigned course. The audit pack must give the owner usable proof that employees
completed onboarding and workplace-procedures training.

The partner currently uses verbal training and WhatsApp messages. This provides no
formal training record, test, clear completion proof or simple way to issue and
verify certificates.

The pilot succeeds only when:

1. The owner uploads one real document.
2. BookQuest creates a course and the owner reviews and publishes it.
3. The owner assigns the published version to at least three employees.
4. At least three employees complete the real assignment.
5. BookQuest generates the version-bound audit pack.
6. The owner records whether the pack is acceptable, whether BookQuest is useful,
   and whether the business would pay for it.

## Agreed technical scope

- Sign-in: verified BookQuest email and password.
- Owner security: enrol authenticator MFA before the observed administrator run.
- External SSO: not required; do not create a pretend OIDC or SAML connection.
- SCIM: not required for this cohort.
- Learner devices: the employees' normal mobile phones where possible.
- Production operations: no direct database changes are allowed to complete the
  partner journey.

## Information to finish before starting

- Obtain the final onboarding/shop-procedures document and permission to use it.
- Agree the start date, completion due date and certificate expiry period.
- Measure the current process once: minutes from a ready document to an assigned
  training message, and total owner/administrator hours for a three-to-five-person
  cohort. These numbers belong in the immutable pilot baseline; do not guess them.
- Confirm at least three employee accounts and one owner account. Do not put names
  or emails in pilot observation notes; use opaque codes such as `learner-01`.
- Remove unnecessary personal, banking, health or identity-document information
  from the source before upload.

## Production execution

1. Create an organization Space for Blacksteel and add the owner plus learners.
2. Open the Space's **Pilot evidence** page and start the plan with:
   - partner display name `Blacksteel Clothing Pilot`;
   - sector `Clothing wholesale and retail, South Africa`;
   - sign-in method `BookQuest email and password`;
   - SCIM off;
   - the measured manual-process times;
   - the six success criteria above.
3. Record owner acceptance of the baseline and success criteria.
4. Start a timer. Upload the final document, generate the course, review source
   coverage and accessibility warnings, correct material issues, approve it and
   publish an immutable version. Record upload-to-assignment time and support used.
5. Create a versioned completion rule, assign the published version to at least
   three employees and record the administrator observation with **manual database
   work** left unchecked.
6. Observe at least one employee using the normal journey. Record a pseudonymous
   learner observation, time spent and support needs. At least three employees must
   complete; one observation does not replace the completion records.
7. Perform the pilot accessibility check on the full journey:
   - keyboard-only navigation with visible focus;
   - one narrow mobile viewport and an employee's normal phone;
   - one screen-reader pass covering sign-in, assignment, lesson, assessment,
     completion and certificate;
   - record every problem and a named remediation action.
8. Generate the audit pack. The owner checks the learner scope, assignment/course/
   rule versions, attempts, completion times, attestations and certificate links,
   then records acceptance or rejection against that exact pack.
9. Verify one issued credential, revoke it through the product and verify that its
   public check now reports it as revoked. Bind the decision to that credential.
10. Run and document the partner incident/restore exercise. This can be a tabletop
    for the small pilot, but it must name the scenario, owner, response, evidence,
    recovery result and follow-up actions.
11. Review every public claim against the observed results. Record the owner's
    usefulness and willingness-to-pay decision, including objections and support
    needs rather than converting uncertainty into acceptance.
12. Ask BookQuest to complete the governed pilot record. The product must refuse if
    any required evidence is missing.

## Evidence to retain

- Approved source filename and content hash, without copying confidential content
  into this repository.
- Pilot plan version and timestamps.
- Pseudonymous administrator and learner observations.
- Published course, completion-rule and assignment version IDs.
- At least three real completion events.
- Generated audit-pack ID and the owner's recorded decision.
- Credential ID plus successful pre-revocation and revoked post-revocation checks.
- Accessibility check artifact and transparent remediation list.
- Incident/restore exercise artifact.
- Sign-in/MFA test artifact.
- Marketing-claim and willingness-to-pay decisions.

## Phase 3 closure boundary

This small pilot may begin with the agreed basic accessibility approach and without
an external penetration test. That does not waive the Phase 3 release gates. Phase 3
will remain open until an independent penetration test closes material findings and
the full journey has credible WCAG 2.2 AA assistive-technology evidence. Basic pilot
testing can produce the remediation list but cannot be described as independent
certification.
