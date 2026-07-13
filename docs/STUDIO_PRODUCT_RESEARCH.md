# Studio product research and authoring standard

Date: 2026-07-13

## Product decision

BookQuest Studio is organized around the job an owner is trying to finish:

1. Read the uploaded source.
2. Shape one lesson at a time.
3. Check the learner experience.
4. Resolve quality issues.
5. Review and publish an immutable version.

Advanced controls stay beside the object they affect. The default screen therefore shows the course outline, the selected lesson, and the source reader instead of a dashboard of unrelated settings.

## Primary-product findings

- Articulate Rise uses modular blocks that authors stack and arrange, offers templates, supports document-assisted creation, in-context review, and reusable blocks. BookQuest follows the same low-floor block principle while retaining its stricter source traceability and version controls.
- Adobe Captivate treats preview as a publishing safeguard and exposes desktop, tablet, and mobile form factors. BookQuest now renders the real learner components in phone, desktop, and offline modes instead of showing a JSON-like approximation.
- Moodle makes the course hierarchy explicit through sections, activities, and resources. BookQuest keeps modules and lessons continuously visible in the outline while limiting the canvas to one lesson at a time.
- Notion makes block insertion searchable and keeps duplicate, delete, and rearrange operations next to each block. BookQuest now uses a searchable, categorized block library and contextual block actions.

Primary references:

- https://www.articulate.com/360/rise/
- https://helpx.adobe.com/captivate/help/preview-projects-adobe-captivate.html
- https://docs.moodle.org/502/en/course_homepage
- https://www.notion.com/help/guides/writing-and-editing-basics

## Studio production standard

Every authoring release must preserve these capabilities:

- Searchable block insertion with plain-language descriptions.
- One visible lesson canvas with an always-available course outline.
- Uploaded-source reading inside Studio, including section search.
- Source links that identify both the version and the cited section.
- Structured controls for lists, answer choices, rubrics, and survey questions.
- Automatic saving, an explicit save state, conflict detection, and local undo before save.
- Duplicate, delete, and ordered movement for blocks.
- A preview rendered by the same components learners receive.
- Phone, desktop, and offline preview modes.
- Inline accessibility and source-coverage checks.
- A release desk that explains the draft, review, approval, and publish sequence.
- Published versions remain immutable; changes branch into a new draft.

## Known boundary

The source reader displays the normalized, extracted document used to generate and verify the course. BookQuest does not currently retain the original uploaded binary because serverless local storage is not durable. A future binary-fidelity viewer must use encrypted object storage, malware scanning, signed URLs, regional retention controls, and deletion synchronization; it must not store large files on the application filesystem.
