"use client";

import { RotateCcw } from "lucide-react";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="error-page">
      <div className="error-mark" aria-hidden="true">P</div>
      <p className="eyebrow">Bullproof</p>
      <h1>The market desk hit a snag.</h1>
      <p>Nothing was traded or changed. Try loading the research dashboard again.</p>
      <button className="primary-button" type="button" onClick={reset}>
        <RotateCcw size={16} /> Try again
      </button>
    </main>
  );
}
