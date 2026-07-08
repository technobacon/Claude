// background.js — MV3 service worker.
//
// Responsibilities: persist entries, route messages, enforce free/paid
// gating. Every decision is delegated to the pure logic in core/recorder.js;
// this file only wires it to chrome.storage and the content scripts. The
// popup and history page never touch storage directly.

import {
  shouldCaptureField,
  makeFieldKey,
  pageKeyFromUrl,
  hostFromUrl,
  findCandidate,
  planSnapshot,
  metaOf,
  upsertMeta,
  pruneIndex,
  visibleMetas,
  searchEntries,
  normalizeSettings,
  serializeArchive,
  parseArchive,
  mergeArchives,
} from './core/recorder.js';
import {
  getIndex,
  setIndex,
  getEntry,
  getEntries,
  setEntry,
  removeEntries,
  getSettings,
  setSettings,
} from './core/storage.js';
import { isPaid, openPurchaseFlow } from './lib/payments.js';

// --- Capturing snapshots into entries ----------------------------------------

async function handleSnapshot(message) {
  const field = message.field || {};
  if (!shouldCaptureField(field)) return { ok: true, ignored: 'FIELD' };

  const settings = normalizeSettings(await getSettings());
  const host = hostFromUrl(message.url);
  if (settings.pausedHosts.includes(host)) return { ok: true, ignored: 'PAUSED' };

  const now = Date.now();
  const metas = await getIndex();
  const candidateMeta = findCandidate(
    metas,
    { fieldKey: makeFieldKey(field), pageKey: pageKeyFromUrl(message.url) },
    now,
  );
  const existing = candidateMeta ? await getEntry(candidateMeta.id) : null;

  const plan = planSnapshot(existing, message, now, Math.random());
  if (plan.action === 'ignore') return { ok: true, ignored: 'NOISE' };

  await setEntry(plan.entry);
  let index = upsertMeta(metas, metaOf(plan.entry));

  // New entries are when the archive grows: the natural moment to prune.
  if (plan.action === 'create') {
    const { keep, dropIds } = pruneIndex(index, now, settings);
    if (dropIds.length > 0) await removeEntries(dropIds);
    index = keep;
  }

  await setIndex(index);
  return { ok: true, id: plan.entry.id };
}

// --- Gating helper -----------------------------------------------------------

/** May this user open/restore this specific entry right now? */
function isAccessible(meta, metas, paid, now) {
  if (paid) return true;
  const { visible } = visibleMetas(metas, { paid, host: meta.host, now });
  return visible.some((m) => m.id === meta.id);
}

async function loadAccessibleEntry(id) {
  const [metas, paid] = await Promise.all([getIndex(), isPaid()]);
  const meta = metas.find((m) => m.id === id);
  if (!meta) return { error: 'NOT_FOUND' };
  if (!isAccessible(meta, metas, paid, Date.now())) return { error: 'LOCKED' };
  const entry = await getEntry(id);
  return entry ? { entry } : { error: 'NOT_FOUND' };
}

// --- Message router ------------------------------------------------------------

async function handle(message, sender) {
  switch (message.type) {
    case 'SNAPSHOT':
      return handleSnapshot(message);

    case 'PAGE_HELLO': {
      const settings = normalizeSettings(await getSettings());
      return { ok: true, paused: settings.pausedHosts.includes(hostFromUrl(message.url)) };
    }

    case 'LIST': {
      const [metas, paid, settings] = await Promise.all([getIndex(), isPaid(), getSettings()]);
      const s = normalizeSettings(settings);
      const { visible, hiddenCount } = visibleMetas(metas, {
        paid,
        host: message.host || null,
        now: Date.now(),
      });
      return {
        ok: true,
        metas: visible,
        hiddenCount,
        paid,
        totalCount: metas.length,
        paused: message.host ? s.pausedHosts.includes(message.host) : false,
      };
    }

    case 'SEARCH': {
      if (!(await isPaid())) return { ok: false, reason: 'LOCKED' };
      const metas = await getIndex();
      const entries = await getEntries(metas.map((m) => m.id));
      const labelById = new Map(metas.map((m) => [m.id, m.label]));
      const hits = searchEntries(
        entries.map((e) => ({ ...e, label: labelById.get(e.id) || '' })),
        message.query,
      );
      const byId = new Map(metas.map((m) => [m.id, m]));
      return { ok: true, metas: hits.map((e) => byId.get(e.id)).filter(Boolean) };
    }

    case 'GET_ENTRY': {
      const res = await loadAccessibleEntry(message.id);
      if (res.error) return { ok: false, reason: res.error };
      return { ok: true, entry: res.entry };
    }

    case 'RESTORE': {
      const res = await loadAccessibleEntry(message.id);
      if (res.error) return { ok: false, reason: res.error };
      try {
        const reply = await chrome.tabs.sendMessage(message.tabId, {
          type: 'RESTORE_TEXT',
          field: res.entry.field,
          text: res.entry.text,
        });
        if (reply && reply.ok) return { ok: true, restored: true };
      } catch {
        // No frame took the message (page navigated away, field gone).
      }
      // Couldn't inject — hand the text back so the popup can offer copy.
      return { ok: true, restored: false, text: res.entry.text };
    }

    case 'DELETE': {
      const metas = await getIndex();
      await removeEntries([message.id]);
      await setIndex(metas.filter((m) => m.id !== message.id));
      return { ok: true };
    }

    case 'CLEAR_ALL': {
      const metas = await getIndex();
      await removeEntries(metas.map((m) => m.id));
      await setIndex([]);
      return { ok: true };
    }

    case 'TOGGLE_PAUSE': {
      const settings = normalizeSettings(await getSettings());
      const host = String(message.host || '').toLowerCase();
      if (!host) return { ok: false, reason: 'NO_HOST' };
      const paused = settings.pausedHosts.includes(host);
      settings.pausedHosts = paused
        ? settings.pausedHosts.filter((h) => h !== host)
        : [...settings.pausedHosts, host];
      await setSettings(settings);
      if (message.tabId != null) {
        try {
          await chrome.tabs.sendMessage(message.tabId, { type: 'SET_PAUSED', paused: !paused });
        } catch {
          // Tab has no content script (chrome:// page etc.); setting still saved.
        }
      }
      return { ok: true, paused: !paused };
    }

    case 'SETTINGS_GET': {
      const [settings, paid] = await Promise.all([getSettings(), isPaid()]);
      return { ok: true, settings: normalizeSettings(settings), paid };
    }

    case 'SETTINGS_SET': {
      // Retention tuning is a Pro feature; pausing sites (TOGGLE_PAUSE) is free.
      if (!(await isPaid())) return { ok: false, reason: 'LOCKED' };
      const current = normalizeSettings(await getSettings());
      const next = normalizeSettings({ ...current, ...message.settings });
      await setSettings(next);
      return { ok: true, settings: next };
    }

    case 'EXPORT': {
      if (!(await isPaid())) return { ok: false, reason: 'LOCKED' };
      const metas = await getIndex();
      const entries = await getEntries(metas.map((m) => m.id));
      return { ok: true, json: serializeArchive(entries, Date.now()) };
    }

    case 'IMPORT': {
      if (!(await isPaid())) return { ok: false, reason: 'LOCKED' };
      let incoming;
      try {
        incoming = parseArchive(message.json);
      } catch (err) {
        return { ok: false, reason: 'BAD_FILE', message: err.message };
      }
      const metas = await getIndex();
      const existing = await getEntries(metas.map((m) => m.id));
      const { merged, added, skipped } = mergeArchives(existing, incoming, Date.now(), Math.random());
      for (const entry of merged) await setEntry(entry);
      await setIndex(merged.map(metaOf));
      return { ok: true, added, skipped };
    }

    case 'PURCHASE': {
      await openPurchaseFlow();
      return { ok: true };
    }

    default:
      return { ok: false, reason: 'UNKNOWN_MESSAGE' };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handle(message, sender)
    .then(sendResponse)
    .catch((err) => {
      console.error('[Retype]', err);
      sendResponse({ ok: false, reason: 'ERROR', message: String(err && err.message) });
    });
  return true; // keep the channel open for the async response
});
