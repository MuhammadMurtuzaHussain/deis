// The author credit in every footer: who built Deis, linked to their GitHub.

export const AUTHOR = { name: "Muhammad Murtuza Hussain", url: "https://github.com/MuhammadMurtuzaHussain" } as const;

export function Credit({ className = "" }: { className?: string }) {
  return (
    <p className={`text-caption text-ink-3 ${className}`}>
      Built in Galway by{" "}
      <a href={AUTHOR.url} target="_blank" rel="noreferrer noopener" className="font-medium text-ink-2 underline underline-offset-2 hover:text-ink">
        {AUTHOR.name}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>{" "}
      for the DEV Hacktoberfest challenge.
    </p>
  );
}
