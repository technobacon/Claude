// content.js — runs in every page and frame. Deliberately dumb:
// it watches editable elements, debounces, and reports raw snapshots to the
// background worker, which applies all the real rules (core/recorder.js).
//
// The one rule enforced HERE is the hard privacy floor: the value of a
// password-ish field is never even read, so it can never leave the page.
//
// MV3 content scripts cannot be ES modules, so this file is a self-contained
// IIFE with no imports.

(() => {
  'use strict';

  const DEBOUNCE_MS = 700;

  // true once the background tells us this host is paused.
  let paused = false;

  // --- field discovery --------------------------------------------------------

  const EDITABLE_SELECTOR = 'input, textarea, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';

  /** Never read the value of these. Belt half; core/recorder.js is the suspender. */
  function hardSkip(el) {
    const type = (el.type || '').toLowerCase();
    const auto = (el.getAttribute && el.getAttribute('autocomplete')) || '';
    return type === 'password' || type === 'hidden' || /password|cc-|one-time-code/i.test(auto);
  }

  /** Resolve an event target to the editable element it belongs to, or null. */
  function editableFrom(target) {
    if (!target || target.nodeType !== 1) return null;
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return target;
    // Rich editors: find the root contenteditable so one entry covers the
    // whole editor, not each inner node the caret happens to be in.
    return target.closest ? target.closest('[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]') : null;
  }

  function kindOf(el) {
    if (el.tagName === 'INPUT') return 'input';
    if (el.tagName === 'TEXTAREA') return 'textarea';
    return 'rich';
  }

  function labelTextFor(el) {
    let label = null;
    if (el.labels && el.labels.length > 0) label = el.labels[0];
    else if (el.closest) label = el.closest('label');
    const text = label ? label.textContent : '';
    return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  }

  function describe(el) {
    return {
      kind: kindOf(el),
      type: (el.type || '').toLowerCase(),
      name: el.name || el.getAttribute('name') || '',
      id: el.id || '',
      autocomplete: (el.getAttribute && el.getAttribute('autocomplete')) || '',
      placeholder: el.getAttribute ? el.getAttribute('placeholder') || '' : '',
      ariaLabel: el.getAttribute ? el.getAttribute('aria-label') || '' : '',
      labelText: labelTextFor(el),
      index: Array.prototype.indexOf.call(document.querySelectorAll(EDITABLE_SELECTOR), el),
    };
  }

  function valueOf(el) {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return el.value || '';
    return el.innerText || '';
  }

  // --- capture (debounced snapshots) -------------------------------------------

  // Element -> timer. A plain Map is fine: entries live for the page lifetime
  // and are flushed/cleared on pagehide anyway.
  const timers = new Map();

  function scheduleFlush(el) {
    clearTimeout(timers.get(el));
    timers.set(el, setTimeout(() => flush(el), DEBOUNCE_MS));
  }

  function flush(el) {
    clearTimeout(timers.get(el));
    timers.delete(el);
    if (!el.isConnected || hardSkip(el)) return;
    const text = valueOf(el);
    if (!text) return;
    try {
      chrome.runtime.sendMessage({
        type: 'SNAPSHOT',
        url: location.href,
        title: document.title,
        field: describe(el),
        text,
      });
    } catch {
      // Extension was reloaded/updated; this page's script is orphaned.
    }
  }

  function flushAll() {
    for (const el of [...timers.keys()]) flush(el);
  }

  document.addEventListener(
    'input',
    (event) => {
      if (paused) return;
      // composedPath()[0] pierces open shadow DOM (input events are composed).
      const target = event.composedPath ? event.composedPath()[0] : event.target;
      const el = editableFrom(target);
      if (!el || hardSkip(el)) return;
      scheduleFlush(el);
    },
    true,
  );

  // Don't sit on a pending snapshot when the user leaves the field or page —
  // the whole product is "we already saved it when disaster struck".
  document.addEventListener(
    'blur',
    (event) => {
      const el = editableFrom(event.composedPath ? event.composedPath()[0] : event.target);
      if (el && timers.has(el)) flush(el);
    },
    true,
  );
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAll();
  });
  window.addEventListener('pagehide', flushAll);

  // --- restore ---------------------------------------------------------------------

  /** Find the recorded field again, best signal first. */
  function locate(field) {
    const tagSel = field.kind === 'rich' ? '[contenteditable]' : field.kind;
    if (field.name) {
      const el = document.querySelector(`${tagSel}[name="${CSS.escape(field.name)}"]`);
      if (el) return el;
    }
    if (field.id) {
      const el = document.getElementById(field.id);
      if (el) return el;
    }
    const all = [...document.querySelectorAll(EDITABLE_SELECTOR)];
    if (field.placeholder) {
      const el = all.find((e) => e.getAttribute('placeholder') === field.placeholder);
      if (el) return el;
    }
    if (all[field.index] && kindOf(all[field.index]) === field.kind) return all[field.index];
    const active = editableFrom(document.activeElement);
    return active || null;
  }

  function setValue(el, text) {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      // Go through the native setter so framework-controlled inputs (React
      // et al.) see the change instead of reverting it on next render.
      const proto = el.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      el.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      selection.removeAllRanges();
      selection.addRange(range);
      // Deprecated but still the only insertion path rich editors reliably
      // treat as user input; innerText assignment is the fallback.
      if (!document.execCommand('insertText', false, text)) el.innerText = text;
    }
    el.focus();
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'RESTORE_TEXT') {
      const el = locate(message.field || {});
      // Only the frame that finds a target responds: this message goes to
      // every frame, and the first sendResponse wins. Frames that can't help
      // stay silent so they don't beat the one that can.
      if (!el || hardSkip(el)) return false;
      try {
        setValue(el, message.text);
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, reason: String(err && err.message) });
      }
      return false;
    }
    if (message.type === 'SET_PAUSED') {
      paused = Boolean(message.paused);
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });

  // Learn whether this host is paused. Fire-and-forget: recording defaults on.
  try {
    chrome.runtime.sendMessage({ type: 'PAGE_HELLO', url: location.href }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res && res.paused) paused = true;
    });
  } catch {
    /* orphaned script */
  }
})();
