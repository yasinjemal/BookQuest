export interface SolutionContent {
  slug: string;
  eyebrow: string;
  title: string;
  description: string;
  lead: string;
  problem: string;
  benefits: Array<{ title: string; body: string }>;
  steps: Array<{ title: string; body: string }>;
  proof: string[];
  faq: Array<{ question: string; answer: string }>;
}

export const SOLUTIONS: SolutionContent[] = [
  {
    slug: "pdf-to-course",
    eyebrow: "PDF to course",
    title: "Turn a PDF into an interactive course you can edit.",
    description: "Convert a PDF into editable lessons, quizzes, source-linked learning activities, and a course you can publish, assign, and improve.",
    lead: "Move from a document people skim to a guided learning path they can complete. BookQuest keeps the source close while you review and shape every lesson.",
    problem: "Important knowledge often stays trapped inside long PDFs. Readers lose their place, managers cannot see understanding, and creators must rebuild the same material by hand in a separate course tool.",
    benefits: [
      { title: "Start with the document", body: "Upload a PDF and preserve it as the source behind the course instead of beginning with an empty canvas." },
      { title: "Edit before publishing", body: "Review the structure, rewrite lessons, adjust activities, and decide what is ready for learners." },
      { title: "Keep evidence visible", body: "Connect learning blocks back to the relevant source sections so reviewers can check what supports the material." },
    ],
    steps: [
      { title: "Upload", body: "Add the PDF to a private workspace." },
      { title: "Draft", body: "Create manually or use an optional AI-assisted draft." },
      { title: "Review", body: "Edit lessons, activities, source links, and course appearance." },
      { title: "Publish", body: "Share publicly or deliver the reviewed course to learners." },
    ],
    proof: ["PDF, DOCX, PPTX, Markdown, and text inputs", "Editable lessons and learning blocks", "Source reading and block-level traceability", "Public course pages and controlled team delivery"],
    faq: [
      { question: "Does BookQuest publish the PDF automatically?", answer: "No. The course remains a draft until a creator reviews and publishes it." },
      { question: "Can I change the generated lessons?", answer: "Yes. Course structure, lesson content, activities, appearance, and source links remain editable." },
      { question: "Can learners still see the source?", answer: "Course creators can keep source material available through the course reader and attach supporting source references to course blocks." },
    ],
  },
  {
    slug: "ai-course-generator",
    eyebrow: "AI course generator",
    title: "Use AI for the first draft, without handing over authorship.",
    description: "Generate an editable course draft from trusted documents, then review the lessons, quizzes, source support, and learner journey before publishing.",
    lead: "BookQuest uses AI as an optional drafting tool. Your source remains the reference, your course remains editable, and a human remains responsible for what learners receive.",
    problem: "A fast AI draft is not automatically a trustworthy course. Generic generation can lose the source context, invent details, or create activities that do not match the real learning need.",
    benefits: [
      { title: "Ground the draft", body: "Begin with materials you trust rather than a one-line prompt detached from the subject." },
      { title: "See what needs review", body: "Use source links and quality checks to identify unsupported or incomplete learning blocks." },
      { title: "Remain the author", body: "Edit, regenerate selectively, preview, and approve the version that will be published." },
    ],
    steps: [
      { title: "Choose the source", body: "Upload a document or work from a saved source in Studio." },
      { title: "Generate a draft", body: "Use an available configured AI provider to propose course structure and content." },
      { title: "Check against evidence", body: "Review lesson quality, accessibility metadata, and source support." },
      { title: "Approve the release", body: "Publish only the course version you are prepared to stand behind." },
    ],
    proof: ["Optional AI-assisted generation", "Manual source-only drafting when AI is unavailable", "Course-version review lifecycle", "Unsupported-block and accessibility checks"],
    faq: [
      { question: "Is AI required to create a course?", answer: "No. You can create and edit a source-only course manually when AI is disabled or not appropriate." },
      { question: "Does BookQuest guarantee AI output is correct?", answer: "No. AI output must be reviewed. BookQuest provides editing, source traceability, and quality signals to support that review." },
      { question: "Who is the course author?", answer: "The creator who reviews and publishes the course remains responsible for the final learning material." },
    ],
  },
  {
    slug: "employee-training",
    eyebrow: "Employee training",
    title: "Turn company knowledge into training people can complete.",
    description: "Create employee training from manuals, SOPs, onboarding documents, and internal guides with assignments, progress, teams, and completion evidence.",
    lead: "Give teams a clear path through the documents that already define how work should be done, while keeping delivery and evidence connected to the reviewed version.",
    problem: "Sending a handbook or procedure does not show whether it was understood. Training teams often rebuild internal knowledge manually and then track delivery in disconnected spreadsheets.",
    benefits: [
      { title: "Reuse trusted knowledge", body: "Build from existing manuals, procedures, onboarding packs, and internal guides." },
      { title: "Deliver by team", body: "Use spaces, roles, teams, invitations, and assignments to control who receives training." },
      { title: "See the learning record", body: "Track participation, completion rules, course versions, and evidence from one institutional view." },
    ],
    steps: [
      { title: "Organize", body: "Create a space and define the people responsible for training." },
      { title: "Build", body: "Turn approved internal material into an editable course." },
      { title: "Assign", body: "Deliver the course to the relevant team with the right completion rule." },
      { title: "Review", body: "Use progress and audit information to follow delivery and improve the course." },
    ],
    proof: ["Role-based spaces and teams", "Bulk invitations and assignments", "Versioned completion rules", "Institutional dashboards and audit exports"],
    faq: [
      { question: "Can different teams receive different training?", answer: "Yes. Organizations can use spaces, teams, memberships, and assignments to scope delivery." },
      { question: "Can we update a course later?", answer: "Yes. Draft and published versions are kept separate so changes can be reviewed before a new release." },
      { question: "Does BookQuest replace every HR system?", answer: "No. BookQuest focuses on building, delivering, and evidencing learning from trusted source material, with integration options for wider workflows." },
    ],
  },
  {
    slug: "compliance-training",
    eyebrow: "Compliance training",
    title: "Create policy training with a reviewable evidence trail.",
    description: "Turn policies and controlled documents into versioned training with source traceability, assignments, completion rules, and verifiable credentials.",
    lead: "BookQuest helps organizations connect what was taught, which source supported it, which version was assigned, and what evidence was recorded—without claiming that software alone creates compliance.",
    problem: "Policy acknowledgements can show that someone clicked a button, but they often do not preserve what was taught or which reviewed policy version supported the training.",
    benefits: [
      { title: "Trace content to policy", body: "Keep the source and its supporting sections close to the learning material during review." },
      { title: "Version the decision", body: "Separate drafts from published releases and preserve the course and completion rule used for an assignment." },
      { title: "Export defensible records", body: "Produce scoped audit information and verify issued learning evidence without exposing private learner data." },
    ],
    steps: [
      { title: "Select the controlled source", body: "Begin with the approved policy, procedure, or standard used by the organization." },
      { title: "Design the learning check", body: "Review course blocks and assessments for the real knowledge employees must demonstrate." },
      { title: "Assign a fixed release", body: "Connect the reviewed course version and completion rule to the learner assignment." },
      { title: "Retain scoped evidence", body: "Use participation, completion, credential, and audit records according to organizational policy." },
    ],
    proof: ["Immutable course and evidence versions", "Evidence hashes and opaque verification", "Completion-rule snapshots", "Scoped audit packs and legal-hold controls"],
    faq: [
      { question: "Does BookQuest certify that our organization is compliant?", answer: "No. Compliance depends on law, policy, deployment, governance, and professional assessment. BookQuest provides training and evidence controls that can support that work." },
      { question: "Can a credential be revoked or expire?", answer: "The credential verification model supports current, expired, and revoked states through opaque public verification." },
      { question: "Can auditors access everything?", answer: "No. Auditor access is designed to be read-only and scoped to the organization and evidence they are authorized to inspect." },
    ],
  },
  {
    slug: "course-creators",
    eyebrow: "For course creators",
    title: "Build a course from your expertise, not from a blank page.",
    description: "Create, edit, publish, and share interactive courses from books, notes, guides, and presentations with a public creator profile and course analytics.",
    lead: "Turn material you already know and trust into a clear learner journey, then publish it under your own creator profile.",
    problem: "Course creation tools often force experts to copy content slide by slide, while generic AI tools produce material that is difficult to verify or meaningfully revise.",
    benefits: [
      { title: "Move faster", body: "Begin from your existing material and use an optional assisted draft to reduce repetitive setup." },
      { title: "Make it yours", body: "Edit the course structure, lesson blocks, assessments, appearance, and public presentation." },
      { title: "Grow a public library", body: "Publish courses with public preview pages, a creator profile, sharing, and creator analytics." },
    ],
    steps: [
      { title: "Bring your material", body: "Upload a book, guide, presentation, notes, or text source." },
      { title: "Shape the experience", body: "Use Studio to edit the learning path and choose its visual world." },
      { title: "Review the details", body: "Check the learner preview, activities, source support, and publication readiness." },
      { title: "Share your library", body: "Publish a public course and connect it to your creator profile." },
    ],
    proof: ["Creator profiles and public course pages", "Course appearance controls", "View, share, enrolment, and completion analytics", "Portable course archives and QTI assessment exchange"],
    faq: [
      { question: "Can I publish a course publicly?", answer: "Yes. Ready courses can receive a public course address and appear on a public creator profile when the creator enables it." },
      { question: "Can I see whether people use my course?", answer: "Creator analytics include views, shares, enrolments, starts, completions, and source-reader opens." },
      { question: "Can I export my work?", answer: "BookQuest supports portable course archives and compatible QTI assessment import and export." },
    ],
  },
  {
    slug: "offline-learning",
    eyebrow: "Offline learning",
    title: "Keep learning moving when the connection does not.",
    description: "Prepare courses for offline study, preserve learner progress locally, and synchronize supported learning activity when connectivity returns.",
    lead: "BookQuest is designed for learners who cannot assume a perfect connection. Supported course content can be prepared in advance, and queued activity can be synchronized after reconnection.",
    problem: "A connection drop should not force a learner to restart a lesson or lose work. In low-connectivity settings, online-only delivery excludes people from otherwise useful training.",
    benefits: [
      { title: "Prepare before disconnecting", body: "Supported course packages can be cached while the learner has a connection." },
      { title: "Protect progress", body: "Offline-aware learning controls preserve supported activity locally rather than silently discarding it." },
      { title: "Synchronize carefully", body: "Queued answers and progress can be sent when connectivity returns, with visible synchronization status." },
    ],
    steps: [
      { title: "Open the course online", body: "The learner signs in and prepares the supported course for offline use." },
      { title: "Continue learning", body: "Cached lessons remain available when the connection becomes unreliable." },
      { title: "Queue supported work", body: "Eligible progress and answers are retained locally until they can be delivered." },
      { title: "Reconnect and sync", body: "BookQuest reports synchronization state as queued work reaches the server." },
    ],
    proof: ["Installable progressive web app", "Per-course offline packages", "Account-scoped answer outbox", "Visible online, queued, syncing, and blocked states"],
    faq: [
      { question: "Does every feature work offline?", answer: "No. Course generation, publishing, administration, and some interactive features still require a connection. Offline support is scoped to prepared learning experiences." },
      { question: "Is offline work stored on the device?", answer: "Supported cached content and queued activity are stored locally and scoped to the signed-in account until synchronization or removal." },
      { question: "Will a learner see whether work has synchronized?", answer: "Yes. The application exposes synchronization states instead of presenting queued work as already delivered." },
    ],
  },
];

export const SOLUTION_BY_SLUG = new Map(SOLUTIONS.map((solution) => [solution.slug, solution]));

