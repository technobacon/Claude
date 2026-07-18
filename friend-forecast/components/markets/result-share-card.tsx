"use client";

import { useState } from "react";

export function ResultShareCard({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  async function copyCard() {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  }

  return (
    <div className="share-link" role="status" data-testid="result-share-card">
      <label htmlFor="result-card-text">Shareable result card</label>
      <textarea id="result-card-text" readOnly rows={5} value={text} />
      <div>
        <button className="ghost-button" onClick={copyCard} type="button">
          {copied ? "Copied" : "Copy result card"}
        </button>
      </div>
      <small>Only the question, final split, and outcome — no names, positions, or balances.</small>
      {copyError ? <small className="form-error" role="alert">Automatic copy was unavailable. Select the text above to copy it manually.</small> : null}
    </div>
  );
}
