"use client";

import { useId, useRef, useState } from "react";

export function MarketShareLink({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  async function copyLink() {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setCopyError(false);
    } catch {
      inputRef.current?.select();
      setCopyError(true);
    }
  }

  return (
    <div className="share-link market-share-link" role="status">
      <label htmlFor={inputId}>Share with existing group members</label>
      <div>
        <input id={inputId} ref={inputRef} readOnly value={value} />
        <button className="ghost-button" onClick={copyLink} type="button">{copied ? "Copied" : "Copy"}</button>
      </div>
      <small>This private market link opens only for members of this group.</small>
      {copyError ? <small className="form-error" role="alert">Automatic copy was unavailable. The link is selected so you can copy it manually.</small> : null}
    </div>
  );
}
