// Mastery grade from the end-of-game screen (S+, S, A-...). Coloured by letter
// the way the client's own grade tiers read: S gold, A green, B blue, the rest
// muted.
function gradeColor(grade: string): string {
  switch (grade[0]) {
    case "S":
      return "bg-amber-400/20 text-amber-300";
    case "A":
      return "bg-emerald-500/20 text-emerald-400";
    case "B":
      return "bg-sky-500/20 text-sky-400";
    default:
      return "bg-white/10 text-lol-text";
  }
}

export default function GradeBadge({
  grade,
  className = "",
}: {
  grade: string | null | undefined;
  className?: string;
}) {
  if (!grade) return null;
  return (
    <span
      title={`Mastery grade ${grade}`}
      data-no-translate
      className={`inline-block rounded px-1 text-[10px] font-bold leading-[15px] tabular-nums ${gradeColor(grade)} ${className}`}
    >
      {grade}
    </span>
  );
}
