// FinePrint v2 — on-device Terms of Service auditor + visual dark-pattern detector.
// Everything runs against a local Ollama server; no page text or screenshot leaves the machine.

// Extension API: `browser` (Firefox-style) or `chrome` (Chromium).
const ext = globalThis.browser ?? globalThis.chrome;

const OLLAMA = "http://localhost:11434";
// First installed model from this list is picked automatically.
const PREFERRED_MODELS = ["gemma4:e4b", "gemma4:e2b", "gemma4:latest", "gemma4", "gemma3:4b"];

const $ = (id) => document.getElementById(id);
let MODEL = null;

// ---------- helpers ----------
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function parseJsonLoose(text) {
  try { return JSON.parse(text); } catch (_) {}
  const m = String(text).match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (_) {} }
  throw new Error("Model did not return valid JSON. Try again, or switch to gemma4:e4b.");
}

const GRADE_COLORS = { A: "#22c55e", B: "#22c55e", C: "#eab308", D: "#ef4444", F: "#ef4444" };

function showError(msg) {
  $("resultArea").style.display = "none";
  $("cardsContainer").innerHTML = `<div class="card error"><strong>⚠️ </strong>${msg}</div>`;
}

const SETUP_HELP = `Can't reach Ollama on this computer.
On a Mac, in Terminal:
<code>launchctl setenv OLLAMA_ORIGINS "chrome-extension://*"</code>
then quit and reopen the Ollama app (or run <code>OLLAMA_ORIGINS="chrome-extension://*" ollama serve</code>).
Then make sure the model exists: <code>ollama pull gemma4:e4b</code>`;

// ---------- Ollama ----------
async function loadModels() {
  const badge = $("modelBadge");
  try {
    const res = await fetch(`${OLLAMA}/api/tags`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const names = ((await res.json()).models || []).map((m) => m.name);
    if (!names.length) throw new Error("no models");

    const saved = (await ext.storage.local.get("model")).model;
    const ordered = [
      ...PREFERRED_MODELS.filter((p) => names.includes(p)),
      ...names.filter((n) => !PREFERRED_MODELS.includes(n)),
    ];
    MODEL = names.includes(saved) ? saved : ordered[0];

    $("modelSelect").innerHTML = ordered
      .map((n) => `<option ${n === MODEL ? "selected" : ""}>${esc(n)}</option>`)
      .join("");
    badge.textContent = "● local";
    badge.className = "badge ok";
  } catch (e) {
    badge.textContent = "● Ollama offline";
    badge.className = "badge bad";
    showError(SETUP_HELP);
  }
}

async function askGemma(prompt, images) {
  const body = {
    model: MODEL,
    prompt,
    format: "json",
    stream: false,
    think: false, // Gemma 4 can "think"; off = much faster answers for a live demo
    options: { temperature: 0.1, num_ctx: 8192 },
  };
  if (images) body.images = images;

  let res = await fetch(`${OLLAMA}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    if (/think/i.test(errText)) {
      // older models / Ollama versions reject the think flag: retry without it
      delete body.think;
      res = await fetch(`${OLLAMA}/api/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else if (res.status === 403) {
      throw new Error(SETUP_HELP);
    } else {
      throw new Error(`Ollama error ${res.status}: ${esc(errText).slice(0, 300)}`);
    }
    if (!res.ok) throw new Error(`Ollama error ${res.status}`);
  }
  const raw = await res.json();
  const secs = (raw.total_duration || 0) / 1e9;
  const tps = raw.eval_count && raw.eval_duration ? raw.eval_count / (raw.eval_duration / 1e9) : 0;
  return { data: parseJsonLoose(raw.response), meta: `${MODEL} • ${secs.toFixed(1)}s • ${tps.toFixed(0)} tok/s • on-device` };
}

// ---------- functions injected into the web page (must be self-contained) ----------
function extractClauses() {
  // Clear highlights from a previous scan
  document.querySelectorAll("[data-fp-id]").forEach((el) => {
    el.removeAttribute("data-fp-id");
    el.style.backgroundColor = ""; el.style.borderLeft = ""; el.style.paddingLeft = "";
  });
  document.querySelectorAll(".fp-tag").forEach((t) => t.remove());

  const risky = /arbitration|third[- ]party|waive|non-refundable|perpetual|irrevocable|royalty-free|sell|share|biometric|track|location|without notice|class action|terminate|liabilit|indemn|advertis|cookie|retain|license/i;
  const els = Array.from(document.querySelectorAll("p, li, td, dd"))
    .filter((el) => el.innerText && el.innerText.trim().length > 40 && !el.querySelector("p, li"));

  // Risky-looking clauses first, then the rest, within a size budget the small model can handle.
  const sorted = [...els.filter((e) => risky.test(e.innerText)), ...els.filter((e) => !risky.test(e.innerText))];
  const out = [];
  let budget = 9000;
  for (const el of sorted) {
    const text = el.innerText.trim().replace(/\s+/g, " ").slice(0, 600);
    if (budget - text.length < 0) break;
    budget -= text.length;
    const id = out.length + 1;
    el.setAttribute("data-fp-id", String(id));
    out.push({ id, text });
    if (out.length >= 30) break;
  }
  if (!out.length) {
    out.push({ id: 0, text: document.body.innerText.replace(/\s+/g, " ").slice(0, 6000) });
  }
  return { title: document.title, clauses: out };
}

function highlightClauses(findings) {
  const colors = { high: "#ef4444", medium: "#eab308", safe: "#22c55e" };
  const bg = { high: "rgba(239,68,68,.15)", medium: "rgba(234,179,8,.15)", safe: "rgba(34,197,94,.12)" };
  for (const f of findings) {
    const el = document.querySelector(`[data-fp-id="${f.id}"]`);
    if (!el || !colors[f.severity]) continue;
    el.style.backgroundColor = bg[f.severity];
    el.style.borderLeft = `4px solid ${colors[f.severity]}`;
    el.style.paddingLeft = "8px";
    el.title = `FinePrint: ${f.plain_english || ""}`;
    const tag = document.createElement("span");
    tag.className = "fp-tag";
    tag.textContent = ` ${f.severity === "safe" ? "✅" : f.severity === "high" ? "🚩" : "⚠️"} ${f.category || ""}`;
    tag.style.cssText = `font:600 11px system-ui;color:#fff;background:${colors[f.severity]};border-radius:10px;padding:1px 7px;margin-left:6px;`;
    el.appendChild(tag);
  }
}

function scrollToClause(id) {
  const el = document.querySelector(`[data-fp-id="${id}"]`);
  if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.animate([{ outline: "3px solid #38bdf8" }, { outline: "0 solid transparent" }], 1500); }
}

// ---------- 1) Terms audit (text) ----------
async function auditTerms() {
  const btn = $("scanBtn");
  const lang = $("langSelect").value;
  btn.disabled = true;
  btn.textContent = `⚡ Reading with ${MODEL}…`;
  $("cardsContainer").innerHTML = "";

  try {
    const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
    const [{ result }] = await ext.scripting.executeScript({ target: { tabId: tab.id }, func: extractClauses });
    const numbered = result.clauses.map((c) => `[${c.id}] ${c.text}`).join("\n");

    const prompt = `You are a strict consumer-rights and privacy auditor reading the Terms of Service / Privacy Policy of "${result.title}".
Read each numbered clause. Watch for negations: "we never sell data" is a PROTECTION, not a risk.

For each clause that matters, classify severity:
- "high": sells/shares personal data, forced arbitration, class-action waiver, perpetual license to user content, biometric/location tracking
- "medium": non-refundable fees, price changes without notice, vague data retention, unilateral termination
- "safe": a real protection for the user
Skip boring/neutral clauses.

Grade the whole document: A/B = user-friendly, C = mixed, D/F = harmful.
Write "summary", "category" and "plain_english" in ${lang}. Keep "plain_english" to one short sentence a teenager would understand.

Respond ONLY with JSON of this exact shape:
{"grade":"A|B|C|D|F","summary":"verdict in at most 8 words","findings":[{"id":<clause number>,"severity":"high|medium|safe","category":"2-3 words","plain_english":"..."}]}

Clauses:
${numbered}`;

    const { data, meta } = await askGemma(prompt);
    const findings = (Array.isArray(data.findings) ? data.findings : [])
      .filter((f) => ["high", "medium", "safe"].includes(f.severity))
      .map((f) => ({ ...f, id: Number(f.id) }));
    const order = { high: 0, medium: 1, safe: 2 };
    findings.sort((a, b) => order[a.severity] - order[b.severity]);

    await ext.scripting.executeScript({ target: { tabId: tab.id }, func: highlightClauses, args: [findings] });

    renderGrade("PRIVACY & FAIRNESS GRADE", data.grade, data.summary, meta);
    const icon = { high: "🔴", medium: "🟡", safe: "🟢" };
    $("cardsContainer").innerHTML =
      (findings.length ? `<div class="section">TAP A CARD TO JUMP TO THE CLAUSE</div>` : "") +
      findings.map((f) => `
        <div class="card clickable ${f.severity}" data-id="${f.id}">
          <div class="cat">${icon[f.severity]} ${esc(f.category)}</div>${esc(f.plain_english)}
        </div>`).join("");
    document.querySelectorAll(".card.clickable").forEach((card) =>
      card.addEventListener("click", () =>
        ext.scripting.executeScript({ target: { tabId: tab.id }, func: scrollToClause, args: [Number(card.dataset.id)] })));
    btn.textContent = "✅ Done — audit again";
  } catch (e) {
    showError(e.message.includes("Cannot access") ? "Chrome doesn't let extensions read this page. Open a normal website." : e.message);
    btn.textContent = "📜 Audit Terms";
  } finally {
    btn.disabled = false;
  }
}

// ---------- 2) Visual dark-pattern scan (Gemma 4 multimodal) ----------
async function screenshotBase64() {
  const dataUrl = await ext.tabs.captureVisibleTab({ format: "jpeg", quality: 80 });
  // Downscale retina screenshots so the model answers fast.
  const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const scale = Math.min(1, 1280 / bmp.width);
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(w, h);
    canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  const canvas = Object.assign(document.createElement("canvas"), { width: w, height: h });
  canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
}

async function visionScan() {
  const btn = $("visionBtn");
  const lang = $("langSelect").value;
  btn.disabled = true;
  btn.textContent = "📸 Looking at your screen…";
  $("cardsContainer").innerHTML = "";

  try {
    const img = await screenshotBase64();
    const prompt = `This is a screenshot of a web page (cookie banner, sign-up form, checkout or settings page).
Find manipulative UI "dark patterns", for example:
- "Accept all" big and colourful while "Reject" is tiny, grey or hidden
- pre-ticked checkboxes that share data or subscribe to marketing
- confirmshaming ("No thanks, I don't like saving money")
- fake urgency / countdown timers, hidden fees, sneak-into-basket items
- tiny low-contrast legal text, trick wording, auto-renewing subscriptions
Only report what you can actually see. Write "verdict", "name" and "evidence" in ${lang}.

Respond ONLY with JSON:
{"risk":"low|medium|high","verdict":"at most 8 words","dark_patterns":[{"name":"2-4 words","evidence":"what in the screenshot shows it","severity":"high|medium"}]}`;

    const { data, meta } = await askGemma(prompt, [img]);
    const risk = String(data.risk || "medium").toLowerCase();
    const letter = { low: "A", medium: "C", high: "F" }[risk] || "C";
    renderGrade("DARK-PATTERN RISK (FROM SCREENSHOT)", letter, data.verdict, meta);

    const items = Array.isArray(data.dark_patterns) ? data.dark_patterns : [];
    $("cardsContainer").innerHTML = items.length
      ? items.map((p) => `
          <div class="card ${p.severity === "high" ? "high" : "medium"}">
            <div class="cat">${p.severity === "high" ? "🔴" : "🟡"} ${esc(p.name)}</div>${esc(p.evidence)}
          </div>`).join("")
      : `<div class="card safe">🟢 No dark patterns visible on this screen.</div>`;
    btn.textContent = "✅ Done — scan again";
  } catch (e) {
    showError(e.message);
    btn.textContent = "👁️ Scan Screen for Dark Patterns";
  } finally {
    btn.disabled = false;
  }
}

// ---------- 3) Opt-out finder ----------
// Code collects clauses + every contact (emails, links) on the page.
// Gemma only MATCHES opt-outs to contact IDs; it never writes an address itself.
// Code then verifies each quote is really on the page before showing anything.
function extractOptOutData() {
  document.querySelectorAll("[data-fp-oid]").forEach((el) => el.removeAttribute("data-fp-oid"));
  const kw = /opt[- ]?out|unsubscribe|withdraw|preference|do not sell|marketing|promotional|personali[sz]ed|object to|consent|settings|grievance|contact us|train/i;
  const els = Array.from(document.querySelectorAll("p, li, td, dd"))
    .filter((el) => el.innerText && el.innerText.trim().length > 25 && !el.querySelector("p, li") && kw.test(el.innerText));
  const clauses = [];
  let budget = 7000;
  for (const el of els) {
    const text = el.innerText.trim().replace(/\s+/g, " ").slice(0, 600);
    if (budget - text.length < 0 || clauses.length >= 25) break;
    budget -= text.length;
    const id = clauses.length + 1;
    el.setAttribute("data-fp-oid", String(id));
    clauses.push({ id, text });
  }

  const contacts = [];
  const seen = new Set();
  const add = (type, value, text) => {
    const key = type + ":" + value.toLowerCase();
    if (seen.has(key) || contacts.length >= 25) return;
    seen.add(key);
    contacts.push({ id: "C" + (contacts.length + 1), type, value, text: (text || "").trim().slice(0, 60) });
  };
  document.querySelectorAll('a[href^="mailto:"]').forEach((a) =>
    add("email", decodeURIComponent(a.getAttribute("href").slice(7).split("?")[0]), a.innerText));
  (document.body.innerText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).forEach((e) => add("email", e, ""));
  const linkKw = /setting|preferenc|unsubscribe|opt|privacy|do-?not-?sell|consent|choices|ads|grievance|request/i;
  document.querySelectorAll("a[href]").forEach((a) => {
    if (!/^https?:/i.test(a.href)) return;
    if (linkKw.test(a.innerText) || linkKw.test(a.getAttribute("href"))) add("link", a.href, a.innerText);
  });
  return { title: document.title, url: location.href, clauses, contacts };
}

function scrollToOptClause(id) {
  const el = document.querySelector(`[data-fp-oid="${id}"]`);
  if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.animate([{ outline: "3px solid #22c55e" }, { outline: "0 solid transparent" }], 1500); }
}

// Is `quote` really inside `source`? Exact match after normalising, or ≥85% of its words in order-insensitive overlap.
function quoteIsOnPage(quote, source) {
  const norm = (s) => String(s || "").toLowerCase().replace(/[“”"'‘’]/g, "").replace(/[^\p{L}\p{N}@.\s]/gu, " ").replace(/\s+/g, " ").trim();
  const q = norm(quote), src = norm(source);
  if (q.length < 8) return false;
  if (src.includes(q)) return true;
  const words = q.split(" ").filter((w) => w.length > 2);
  const srcWords = new Set(src.split(" "));
  return words.length >= 4 && words.filter((w) => srcWords.has(w)).length / words.length >= 0.85;
}

function buildOptOutEmail(items, pageUrl, siteTitle) {
  const lines = items.map((o, i) => `${i + 1}. ${o.what}\n   Your policy says: "${o.quote}"`).join("\n");
  const subject = items.length === 1 ? `Opt-out request: ${items[0].what}` : `Opt-out request (${items.length} items)`;
  const body =
`Hello,

I am a user of ${String(siteTitle || "your service").split(/\s[—–|-]\s|\s\|\s/)[0]}. Your privacy policy / terms (${pageUrl}) allow users to opt out. Please opt me out of:

${lines}

My account email: [your email]
My name: [your name]

Please confirm in writing once this has been done. Thank you.`;
  return { subject, body };
}
let LAST_OPTOUTS = null;

async function findOptOuts() {
  const btn = $("optoutBtn");
  const lang = $("langSelect").value;
  btn.disabled = true;
  btn.textContent = `🔎 Finding opt-outs with ${MODEL}…`;
  $("cardsContainer").innerHTML = "";

  try {
    const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
    const [{ result }] = await ext.scripting.executeScript({ target: { tabId: tab.id }, func: extractOptOutData });
    if (!result.clauses.length) throw new Error("No opt-out or privacy-choice wording found on this page. Open the site's Privacy Policy and try again.");

    const prompt = `You help users exercise opt-out choices that a website's own policy offers.
Below are numbered clauses from "${result.title}" and a list of contacts (emails/links) found on the page.

Find every opt-out the text explicitly offers (e.g. marketing emails, personalised ads, sharing/selling data to partners, cookies, use of content for AI training, data deletion).
Rules:
- Only include opt-outs the clauses actually offer. Never invent one.
- "quote": copy the key sentence EXACTLY from the clause, word for word, in its original language. Do not translate or paraphrase it.
- "contact_id": the ID from the contacts list that the clause tells users to use, or null if the clause gives no contact. Never write an address yourself.
- "grievance_contact_id": the contact ID of a grievance officer / privacy officer / DPO if one is listed, else null.
- Write "what" (2-5 words) and "how" (one short sentence) in ${lang}.

Respond ONLY with JSON:
{"opt_outs":[{"what":"...","clause_id":<number>,"quote":"...","contact_id":"C1"|null,"how":"..."}],"grievance_contact_id":"C2"|null}

Clauses:
${result.clauses.map((c) => `[${c.id}] ${c.text}`).join("\n")}

Contacts:
${result.contacts.map((c) => `[${c.id}] ${c.type}: ${c.value}${c.text ? ` (link text: "${c.text}")` : ""}`).join("\n") || "(none found)"}`;

    const { data, meta } = await askGemma(prompt);
    const byId = Object.fromEntries(result.contacts.map((c) => [c.id, c]));
    const clauseText = Object.fromEntries(result.clauses.map((c) => [c.id, c.text]));
    const raw = Array.isArray(data.opt_outs) ? data.opt_outs : [];

    // Verify: quote must be in that clause, contact must be one we found on the page.
    const verified = [];
    for (const o of raw) {
      const id = Number(o.clause_id);
      if (!quoteIsOnPage(o.quote, clauseText[id])) continue;
      const contact = o.contact_id && byId[o.contact_id] ? byId[o.contact_id] : null;
      verified.push({ what: o.what || "Opt-out", how: o.how || "", quote: o.quote, clause_id: id, contact });
    }
    const removed = raw.length - verified.length;
    const grievance = byId[data.grievance_contact_id] && byId[data.grievance_contact_id].type === "email" ? byId[data.grievance_contact_id] : null;
    LAST_OPTOUTS = { tabId: tab.id, url: result.url, title: result.title, items: verified, grievance };

    renderOptOuts(meta, removed);
    btn.textContent = "✅ Done — find again";
  } catch (e) {
    showError(e.message);
    btn.textContent = "🚪 Find My Opt-Outs";
  } finally {
    btn.disabled = false;
  }
}

function renderOptOuts(meta, removed) {
  const { items, grievance } = LAST_OPTOUTS;
  $("resultArea").style.display = "block";
  $("resultArea").style.borderColor = "#22c55e";
  $("resultLabel").textContent = "OPT-OUTS THIS POLICY OFFERS YOU";
  $("gradeText").style.color = "#22c55e";
  $("gradeText").textContent = String(items.length);
  $("summaryText").textContent = items.length ? "Every one verified against the page text" : "No verifiable opt-outs found";
  $("metaText").textContent = meta + (removed > 0 ? ` • ${removed} unverified suggestion${removed > 1 ? "s" : ""} removed` : "");

  const cards = items.map((o, i) => {
    let action;
    if (o.contact?.type === "email") {
      action = `<button class="mini" data-act="email" data-i="${i}">✉️ Email ${esc(o.contact.value)}</button><button class="mini ghost" data-act="copy" data-i="${i}">📋 Copy</button>`;
    } else if (o.contact?.type === "link") {
      action = `<button class="mini" data-act="link" data-i="${i}">⚙️ Open ${esc(o.contact.text || "settings page")}</button>`;
    } else if (grievance) {
      action = `<div class="note">No contact given for this one. Ask the grievance officer:</div><button class="mini" data-act="grievance" data-i="${i}">✉️ Email ${esc(grievance.value)}</button><button class="mini ghost" data-act="copy" data-i="${i}">📋 Copy</button>`;
    } else {
      action = `<div class="note">The policy gives no contact for this. Look for "Contact us" or the Grievance Officer on the site.</div><button class="mini ghost" data-act="copy" data-i="${i}">📋 Copy request</button>`;
    }
    return `<div class="card safe">
      <div class="cat clickable-q" data-clause="${o.clause_id}">🚪 ${esc(o.what)} <span class="verified">✓ verified</span></div>
      ${esc(o.how)}
      <div class="quote">“${esc(o.quote)}”</div>
      <div class="actions">${action}</div>
    </div>`;
  }).join("");

  const emailTargets = new Set(items.map((o) => (o.contact?.type === "email" ? o.contact.value : o.contact ? null : grievance?.value)).filter(Boolean));
  const linkCount = items.filter((o) => o.contact?.type === "link").length;
  const parts = [];
  if (emailTargets.size) parts.push(`${emailTargets.size} email${emailTargets.size > 1 ? "s" : ""}`);
  if (linkCount) parts.push(`${linkCount} settings page${linkCount > 1 ? "s" : ""}`);
  const allBtn = items.length > 1 && parts.length
    ? `<button id="allBtn" class="btn" style="width:100%;margin-top:10px;background:#16a34a">✉️ Opt out of everything (${parts.join(" + ")})</button>`
    : "";
  $("cardsContainer").innerHTML = (items.length ? `<div class="section">TAP A TITLE TO SEE THE CLAUSE • EMAILS OPEN IN YOUR MAIL APP, NOTHING IS SENT AUTOMATICALLY</div>` : "") + cards + allBtn;

  document.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => handleOptOutAction(b.dataset.act, Number(b.dataset.i), b)));
  document.querySelectorAll(".clickable-q").forEach((el) => el.addEventListener("click", () =>
    ext.scripting.executeScript({ target: { tabId: LAST_OPTOUTS.tabId }, func: scrollToOptClause, args: [Number(el.dataset.clause)] })));
  if ($("allBtn")) $("allBtn").addEventListener("click", optOutAll);
}

function openMail(to, subject, body, btn) {
  const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  if (url.length > 1900) { // mail apps truncate long mailto links: copy instead
    navigator.clipboard.writeText(`To: ${to}\nSubject: ${subject}\n\n${body}`);
    if (btn) btn.textContent = "📋 Too long for a link — copied, paste into your email";
    return;
  }
  Promise.resolve()
    .then(() => ext.tabs.create({ url }))
    .catch(() => {
      if (!window.open(url)) {
        navigator.clipboard.writeText(`To: ${to}\nSubject: ${subject}\n\n${body}`);
        if (btn) btn.textContent = "📋 Copied — paste into your email";
      }
    });
}

function handleOptOutAction(act, i, btn) {
  const { items, grievance, url, title } = LAST_OPTOUTS;
  const o = items[i];
  const { subject, body } = buildOptOutEmail([o], url, title);
  if (act === "email") openMail(o.contact.value, subject, body, btn);
  else if (act === "grievance") openMail(grievance.value, subject, body, btn);
  else if (act === "link") ext.tabs.create({ url: o.contact.value });
  else if (act === "copy") {
    const to = o.contact?.type === "email" ? o.contact.value : grievance?.value || "";
    navigator.clipboard.writeText(`${to ? `To: ${to}\n` : ""}Subject: ${subject}\n\n${body}`);
    btn.textContent = "✅ Copied";
  }
}

function optOutAll() {
  const { items, grievance, url, title } = LAST_OPTOUTS;
  // Group requests by the address they should go to; links are opened as tabs.
  const groups = {};
  for (const o of items) {
    if (o.contact?.type === "link") { ext.tabs.create({ url: o.contact.value, active: false }); continue; }
    const to = o.contact?.type === "email" ? o.contact.value : grievance?.value;
    if (!to) continue;
    (groups[to] = groups[to] || []).push(o);
  }
  for (const [to, list] of Object.entries(groups)) {
    const { subject, body } = buildOptOutEmail(list, url, title);
    openMail(to, subject, body, $("allBtn"));
  }
}

function renderGrade(label, grade, summary, meta) {
  const g = String(grade || "C").trim().toUpperCase()[0];
  const color = GRADE_COLORS[g] || "#eab308";
  $("resultArea").style.display = "block";
  $("resultArea").style.borderColor = color;
  $("resultLabel").textContent = label;
  $("gradeText").style.color = color;
  $("gradeText").textContent = g;
  $("summaryText").textContent = summary || "Audit complete";
  $("metaText").textContent = meta;
}

// ---------- wire up ----------
$("scanBtn").addEventListener("click", () => (MODEL ? auditTerms() : showError(SETUP_HELP)));
$("visionBtn").addEventListener("click", () => (MODEL ? visionScan() : showError(SETUP_HELP)));
$("optoutBtn").addEventListener("click", () => (MODEL ? findOptOuts() : showError(SETUP_HELP)));
$("modelSelect").addEventListener("change", (e) => { MODEL = e.target.value; ext.storage.local.set({ model: MODEL }); });
$("langSelect").addEventListener("change", (e) => ext.storage.local.set({ lang: e.target.value }));
ext.storage.local.get("lang").then(({ lang }) => { if (lang) $("langSelect").value = lang; });
loadModels();
