import { SUMMARY_SHOTS } from "./summary-shots";

export function SummaryExamples() {
  return (
    <div>
      <h1 className="font-display text-4xl">Summary examples</h1>
      <p className="mt-2 max-w-2xl text-muted">These are drawings of the two choices, not your live books. The first two are one page. The last three are a Summary menu.</p>
      <div className="mt-6 space-y-8">
        {SUMMARY_SHOTS.map((shot) => (
          <figure key={shot.title}>
            <figcaption className="mb-2">
              <span className="font-medium">{shot.title}.</span> <span className="text-muted">{shot.lede}</span>
            </figcaption>
            <img src={shot.src} alt={shot.title} className="w-full rounded-2xl border border-line bg-card" />
          </figure>
        ))}
      </div>
    </div>
  );
}
