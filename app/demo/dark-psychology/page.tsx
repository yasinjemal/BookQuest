import Link from "next/link";
import AppIcon from "@/components/AppIcon";
import CourseAppearanceFrame from "@/components/CourseAppearanceFrame";
import CourseWorld from "@/components/CourseWorld";
import ReadingCanvas from "@/components/ReadingCanvas";
import type { CourseAppearance } from "@/lib/course-appearance";
import styles from "./DarkPsychologyDemo.module.css";

const appearance: CourseAppearance = {
  template: "shadow-files",
  worldTheme: "shadow",
  typography: "modern",
  surface: "noir",
  accent: "crimson",
  atmosphere: "full",
  readingWidth: "focused",
};

const lessonMoments = [
  { label: "Enter the case", state: "complete" },
  { label: "Spot the pattern", state: "current" },
  { label: "Test the signal", state: "upcoming" },
  { label: "Write your defence", state: "upcoming" },
] as const;

const lockedFiles = [
  { code: "02", title: "The Reciprocity Trap", hint: "When a gift quietly becomes a debt." },
  { code: "03", title: "Manufactured Urgency", hint: "Why pressure tries to borrow your thinking time." },
  { code: "04", title: "Social Proof Under Pressure", hint: "When the crowd becomes part of the argument." },
] as const;

export default function DarkPsychologyDemoPage() {
  return (
    <CourseAppearanceFrame appearance={appearance} className={styles.frame}>
      <main className={styles.page}>
        <header className={styles.topbar}>
          <Link href="/demo" className={styles.exitLink} aria-label="Return to the BookQuest demo">
            <span aria-hidden="true">←</span>
            <span className={styles.exitCopy}>Exit case room</span>
          </Link>
          <div className={styles.brandLine}>
            <span className={styles.brandMark} aria-hidden="true">BQ</span>
            <span><strong>BookQuest</strong><small>Immersive lesson world</small></span>
          </div>
          <div className={styles.progressBlock}>
            <div><span>Case file 01</span><span>32%</span></div>
            <div className={styles.progressTrack} role="progressbar" aria-label="Lesson progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={32}>
              <span />
            </div>
          </div>
        </header>

        <section className={styles.hero} aria-labelledby="dark-psychology-title">
          <CourseWorld
            seed="dark-psychology:architecture-of-influence"
            title="The Architecture of Influence"
            theme="shadow"
            accent="#E0526F"
            progress={32}
            mood="dusk"
            className={styles.heroWorld}
          />
          <div className={styles.heroVeil} aria-hidden="true" />
          <div className={styles.heroContent}>
            <p className={styles.clearance}><span aria-hidden="true" /> Restricted study · Learner cleared</p>
            <p className={styles.kicker}>Dark Psychology · Defensive awareness</p>
            <h1 id="dark-psychology-title">The Architecture <span>of Influence</span></h1>
            <p className={styles.heroSummary}>Learn to notice the moment a conversation stops informing you and starts narrowing your freedom to choose.</p>
            <div className={styles.heroMeta} aria-label="Lesson details">
              <span><AppIcon name="clock" className="h-4 w-4" />8 min</span>
              <span><AppIcon name="shield" className="h-4 w-4" />Self-protection</span>
              <span><AppIcon name="bookmark" className="h-4 w-4" />Case 01 of 06</span>
            </div>
          </div>
          <aside className={styles.caseStamp} aria-label="Case file number 01">
            <span>Case</span>
            <strong>01</strong>
            <small>Observe · Pause · Verify</small>
          </aside>
        </section>

        <div className={styles.lessonGrid}>
          <aside className={styles.caseNav} aria-label="Lesson moments">
            <p className={styles.sideLabel}>Inside this file</p>
            <ol>
              {lessonMoments.map((moment, index) => (
                <li key={moment.label} data-state={moment.state} aria-current={moment.state === "current" ? "step" : undefined}>
                  <span className={styles.stepMarker}>{moment.state === "complete" ? <AppIcon name="check" className="h-3.5 w-3.5" /> : String(index + 1).padStart(2, "0")}</span>
                  <span>{moment.label}</span>
                </li>
              ))}
            </ol>
            <div className={styles.clearanceCard}>
              <AppIcon name="shield" className="h-5 w-5" />
              <p><strong>Ethical lens active</strong><span>Recognition, boundaries, and self-protection only.</span></p>
            </div>
          </aside>

          <article className={styles.readingColumn}>
            <div className={styles.chapterMarker}>
              <span>01 / Pattern recognition</span>
              <span className={styles.liveDot}>Live observation</span>
            </div>

            <ReadingCanvas variant="editorial" label="Key idea" title="Influence hides in the shrinking of options" icon="bookmark">
              <p className="reading">Healthy persuasion leaves room for questions, time, and a genuine no. Manipulative pressure does the opposite: it quietly reduces the choices you can see until one outcome feels inevitable.</p>
              <blockquote className={styles.pullQuote}>
                <span aria-hidden="true">“</span>
                <p>The signal is not that someone wants something. The signal is that your freedom to consider it begins to disappear.</p>
              </blockquote>
              <p className="reading">Your first defence is not a clever comeback. It is noticing the change in pace: the rushed answer, the missing alternative, the guilt attached to hesitation. Once you can name that shift, you can create distance from it.</p>
            </ReadingCanvas>

            <section className={styles.signalSection} aria-labelledby="signals-heading">
              <div className={styles.sectionHeading}>
                <p>Field signals</p>
                <h2 id="signals-heading">Three changes worth noticing</h2>
              </div>
              <div className={styles.signalGrid}>
                <article><span>01</span><h3>Time contracts</h3><p>You are pushed to decide before you can check the facts.</p></article>
                <article><span>02</span><h3>Questions become disloyal</h3><p>Normal doubt is reframed as weakness, mistrust, or ingratitude.</p></article>
                <article><span>03</span><h3>One option dominates</h3><p>Alternatives are hidden, mocked, or made to feel impossibly costly.</p></article>
              </div>
            </section>

            <aside className={styles.ethicsNote}>
              <span className={styles.ethicsIcon}><AppIcon name="shield" className="h-5 w-5" /></span>
              <div><p>Ethical boundary</p><h2>This course teaches recognition—not coercion.</h2><span>Examples are designed to help learners protect their autonomy. They do not provide scripts for manipulating someone else.</span></div>
            </aside>

            <nav className={styles.lessonActions} aria-label="Lesson navigation">
              <button type="button" className={styles.quietAction}>Save observation</button>
              <button type="button" className={styles.primaryAction}>Test the signal <AppIcon name="arrow" className="h-4 w-4" /></button>
            </nav>
          </article>

          <aside className={styles.fieldNotes} aria-label="Field notes">
            <p className={styles.sideLabel}>Field note 01-A</p>
            <h2>Use the pause.</h2>
            <p>A simple delay restores options. Try: “I don’t decide under time pressure. I’ll come back to you.”</p>
            <div className={styles.noteRule} />
            <dl>
              <div><dt>Notice</dt><dd>The sudden rush</dd></div>
              <div><dt>Name</dt><dd>Pressure, not urgency</dd></div>
              <div><dt>Next move</dt><dd>Create time</dd></div>
            </dl>
            <span className={styles.fileCode}>BQ–OBS–001</span>
          </aside>
        </div>

        <section className={styles.vault} aria-labelledby="vault-heading">
          <div className={styles.vaultHeading}>
            <div><p>Beyond this lesson</p><h2 id="vault-heading">The next case files are sealed.</h2></div>
            <span><AppIcon name="lock" className="h-4 w-4" />Clearance rises with progress</span>
          </div>
          <div className={styles.lockedGrid}>
            {lockedFiles.map((file) => (
              <article key={file.code} className={styles.lockedFile} aria-label={`${file.title}, restricted lesson`}>
                <div className={styles.lockTopline}><span>Restricted lesson</span><span>File {file.code}</span></div>
                <div className={styles.lockEmblem}><AppIcon name="lock" className="h-5 w-5" /></div>
                <h3><span aria-hidden="true">{file.title}</span><span className="screen-reader-text">{file.title}</span></h3>
                <p>{file.hint}</p>
                <div className={styles.clearanceTrack}><span /></div>
                <small>Complete case {String(Number(file.code) - 1).padStart(2, "0")} to request access</small>
              </article>
            ))}
          </div>
        </section>

        <footer className={styles.footer}>
          <span>BookQuest · Immersive lesson worlds</span>
          <span>This is a reviewable product concept using the real theme system.</span>
        </footer>
      </main>
    </CourseAppearanceFrame>
  );
}
