# Retype — FAQ

Honest answers to the questions a tool like this *should* be asked. Retype
records what you type so you can get it back — which means it deserves your
skepticism until it earns your trust. Here's how to verify every claim
yourself instead of taking our word for it.

---

### How do I know my text won't be leaked?

Because there is nowhere for it to go. Retype has **no server**. Not "we
don't look at your data" — there is no backend, no account system, no sync
service, no analytics endpoint. The extension contains no code that
transmits your text anywhere, and its manifest requests no access to any
remote origin of ours.

Don't take that on faith — verify it (next question).

### How do I know it's actually local-only?

Three checks anyone can do, no programming required:

1. **Watch the network.** Open DevTools (F12) → Network tab on any page,
   type into a form, and watch. Retype produces zero network requests. You
   can also inspect the extension's own service worker the same way
   (`chrome://extensions` → Retype → "service worker").
2. **Pull the plug.** Disconnect from the internet entirely. Retype keeps
   recording and restoring exactly the same. A cloud tool can't do that.
3. **Read the code.** Retype ships unminified and unobfuscated — what you
   install is human-readable source. Search it for `fetch`, `XMLHttpRequest`
   or `WebSocket`: the only network-touching code you'll find is the
   clearly-marked payment seam (`src/lib/payments.js`), which handles the
   one-time purchase and never touches your recorded text.

Your text lives in `chrome.storage.local` — the same place other
extensions keep their settings — on your disk, in your browser profile.

### Isn't this just a keylogger?

A keylogger has two defining properties: it hides from you, and it sends
your keystrokes to someone else. Retype does the opposite of both. It shows
you everything it has recorded (that's the product), lets you delete any of
it or all of it, lets you pause it per site, and has no ability to transmit
anything. The recording exists solely so *you* can recover *your own* work
on *your own* machine.

### What about my passwords and credit cards?

Never recorded — enforced twice, at two different layers:

1. The page script **never reads the value of a password field at all**.
   The check happens before the value is touched, so a password can't even
   transit the extension's internal messaging.
2. Independently, the storage logic refuses fields that look sensitive from
   their attributes or labels: credit card numbers, CVV/CVC, social
   security numbers, PINs, one-time codes, IBANs and similar.

That second layer is pure, testable logic (`isSensitiveField` in
`src/core/recorder.js`) with automated tests, so it can't silently regress.

### Why does Chrome warn that Retype can "read and change all your data on all websites"?

That's Chrome's blanket wording for any extension with a content script on
all sites — and recording your typing anywhere requires exactly that. The
warning describes what the extension *could* do, not what it does. What
Retype's content script actually does is: watch typing in editable fields,
report it to local storage, and put text back when you click Insert. It's
a few hundred readable lines — `src/content.js` — and you can audit all of
them.

### What if someone else uses my computer?

Retype's archive is exactly as private as the rest of your browser profile
— your history, cookies, saved logins and autofill. Anyone who can open
your profile could read it, so the same hygiene applies: separate OS user
accounts and a locked screen. Beyond that, you can pause recording on
sensitive sites, shorten retention so old text expires quickly, delete
individual entries, or wipe everything with one click ("Delete all recorded
text" on the history page).

### Does Retype sync between my computers?

No — deliberately. Sync means your text leaving the machine, and "never
leaves the machine" is the product's core promise. If you need to move your
archive, Pro's export gives you a plain JSON file that *you* carry across
(and import on the other side). You stay the courier.

### Will it slow down my browsing?

No. Retype does nothing until you type, waits for a pause in your typing
(700 ms) before saving, and each save writes only the one entry being
typed — never the whole archive. There are no timers, no polling, no
background scanning.

### Does it work in Incognito?

Only if you explicitly allow it (`chrome://extensions` → Retype → "Allow in
Incognito") — Chrome disables extensions there by default. If you do enable
it, remember recordings are kept even though the browsing session is
ephemeral; most people should leave it off.

### How long is my text kept?

By default: 30 days or 2,000 entries, whichever limit hits first — old
entries are pruned automatically. Pro users can tune both (1–365 days, up
to 20,000 entries). Deleting is immediate and permanent; there's no trash,
no server copy, no "soft delete".

### What happens when I uninstall?

Chrome deletes the extension's local storage with it. Everything Retype
ever recorded is gone. (If you want to keep the archive, export first.)

### What do you get when I pay?

A yes/no flag. The one-time purchase runs through ExtensionPay/Stripe in a
checkout window; card details go to Stripe, never to the extension. Retype
stores only "this install is Pro". No account, no email requirement, no
license server phoning home on every use.

### Why should I trust you rather than a big company?

You shouldn't trust anyone — that's the point of the architecture. With a
cloud tool, privacy is a policy: words that can change. With Retype,
privacy is a property: there is no server to breach, no database to leak,
no company to be acquired along with your data. The strongest privacy
guarantee software can make is *architectural inability to betray you*,
and that's the one Retype makes. Verify it with the three checks above.
