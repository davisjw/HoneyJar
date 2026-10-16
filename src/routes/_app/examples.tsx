import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/examples")({
  component: ExamplesPage,
});

const SHOTS = [
  ["summary-year.png", "This year only", "One page. One column per open jar. Nothing is added into a single profit."],
  ["summary-both.png", "October beside the year", "The same page, with this month next to the year."],
  ["summary-overview.png", "Summary menu, Overview", "A short menu. This is the first page."],
  ["summary-cash.png", "Summary menu, Cash", "Where the money sits. Only household cash is inside net worth."],
  ["summary-taxes.png", "Summary menu, Taxes", "Schedule C, E, and D, then the household worksheet."],
];

function ExamplesPage() {
  return (
    <div>
      <h1 className="font-display text-4xl">Summary examples</h1>
      <p className="mt-2 max-w-2xl text-muted">These are drawings of the two choices, not your live books. The first two are one page. The last three are a Summary menu.</p>
      <div className="mt-6 space-y-8">
        {SHOTS.map(([file, title, lede]) => (
          <figure key={file}>
            <figcaption className="mb-2">
              <span className="font-medium">{title}.</span> <span className="text-muted">{lede}</span>
            </figcaption>
            <img src={`/summary-examples/${file}`} alt={title} className="w-full rounded-2xl border border-line" />
          </figure>
        ))}
      </div>
    </div>
  );
}
