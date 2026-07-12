"use client";

import { useState } from "react";

export function ShareLink({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
  }

  return (
    <div className="share-link" role="status">
      <label htmlFor={`share-${value.slice(-8)}`}>Share this private link</label>
      <div>
        <input id={`share-${value.slice(-8)}`} readOnly value={value} />
        <button className="ghost-button" onClick={copyLink} type="button">{copied ? "Copied" : "Copy"}</button>
      </div>
      <small>This is the only time the raw link is shown. Store it somewhere safe.</small>
    </div>
  );
}
