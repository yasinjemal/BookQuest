export type OutputMode = "book" | "course" | "summary" | "both";

export interface CreationOutputPlan {
  output: OutputMode;
  wantsBook: boolean;
  wantsCourse: boolean;
  wantsSummary: boolean;
  courseUsesAi: boolean;
  requiresAi: boolean;
  creditsRequired: number;
}

export function resolveCreationOutput(
  value: FormDataEntryValue | string | null,
  generateRequested: boolean
): CreationOutputPlan | null {
  const output = value === null ? "course" : String(value);
  if (output !== "book" && output !== "course" && output !== "summary" && output !== "both") {
    return null;
  }

  const wantsBook = output === "book";
  const wantsCourse = output === "course" || output === "both";
  const wantsSummary = output === "summary" || output === "both";
  const courseUsesAi = wantsCourse && (output === "both" || generateRequested);
  const requiresAi = wantsSummary || courseUsesAi;

  return {
    output,
    wantsBook,
    wantsCourse,
    wantsSummary,
    courseUsesAi,
    requiresAi,
    creditsRequired: (wantsSummary ? 1 : 0) + (courseUsesAi ? 1 : 0),
  };
}
