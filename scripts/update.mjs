// Intelligence Engine: India desk updater.
// Runs on a schedule on GitHub Actions. Reads RSS feeds from twelve outlets on six continents
// (plus two Indian outlets for the Inside India desk). A fast model filters headlines and matches
// follow-ups to known stories; Opus writes the analysis for each new story; Sonnet handles story
// threads and summaries. Results are saved to data/ for the website.
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";

const REGION = "India";
const SCHEMA = 4;                              // v4: follow-ups merge into one developing story                              // bump to re-analyse everything under new rules
const OUTLET_INFO = {
  bbc:        { name: "BBC News",     region: "Europe" },
  guardian:   { name: "The Guardian", region: "Europe" },
  npr:        { name: "NPR",          region: "North America" },
  aljazeera:  { name: "Al Jazeera",   region: "Asia" },
  mercopress: { name: "MercoPress",   region: "South America" },
  abc:        { name: "ABC News",     region: "Australia" },
  nyt:        { name: "The New York Times", region: "North America" },
  cnbc:       { name: "CNBC",         region: "North America" },
  cbs:        { name: "CBS News",     region: "North America" },
  dw:         { name: "DW",           region: "Europe" },
  france24:   { name: "France 24",    region: "Europe" },
  africanews: { name: "Africanews",   region: "Africa" },
  scmp:       { name: "South China Morning Post", region: "Asia" },
  thehindu:   { name: "The Hindu",    region: "India" },
  mint:       { name: "Mint",         region: "India" }
};
const OUTLETS = Object.fromEntries(Object.entries(OUTLET_INFO).map(([id, o]) => [id, o.name]));
const SINCE = "2026-10-02";                    // ignore stories published before this date
const GLOBAL_FEEDS = [
  { src: "bbc", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { src: "bbc", url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
  { src: "bbc", url: "https://feeds.bbci.co.uk/news/technology/rss.xml" },
  { src: "bbc", url: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml" },
  { src: "bbc", url: "https://feeds.bbci.co.uk/news/world/asia/india/rss.xml" },
  { src: "bbc", url: "https://feeds.bbci.co.uk/news/world/asia/rss.xml" },
  { src: "guardian", url: "https://www.theguardian.com/world/rss" },
  { src: "guardian", url: "https://www.theguardian.com/world/india/rss" },
  { src: "guardian", url: "https://www.theguardian.com/uk/business/rss" },
  { src: "guardian", url: "https://www.theguardian.com/uk/technology/rss" },
  { src: "guardian", url: "https://www.theguardian.com/environment/rss" },
  { src: "guardian", url: "https://www.theguardian.com/world/middleeast/rss" },
  { src: "guardian", url: "https://www.theguardian.com/global-development/rss" },
  { src: "npr", url: "https://feeds.npr.org/1004/rss.xml" },
  { src: "npr", url: "https://feeds.npr.org/1006/rss.xml" },
  { src: "npr", url: "https://feeds.npr.org/1017/rss.xml" },
  { src: "npr", url: "https://feeds.npr.org/1019/rss.xml" },
  { src: "aljazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { src: "mercopress", url: "https://en.mercopress.com/rss" },
  { src: "mercopress", url: "https://en.mercopress.com/rss/energy" },
  { src: "mercopress", url: "https://en.mercopress.com/rss/agriculture" },
  { src: "abc", url: "https://www.abc.net.au/news/feed/10719986/rss.xml" },
  { src: "abc", url: "https://www.abc.net.au/news/feed/104217382/rss.xml" },
  { src: "abc", url: "https://www.abc.net.au/news/feed/104217374/rss.xml" },
  // Added Oct 2026: more US and European coverage, plus Africa and a second Asian outlet
  { src: "nyt", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml" },
  { src: "nyt", url: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml" },
  { src: "nyt", url: "https://rss.nytimes.com/services/xml/rss/nyt/Economy.xml" },
  { src: "nyt", url: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml" },
  { src: "nyt", url: "https://rss.nytimes.com/services/xml/rss/nyt/Climate.xml" },
  { src: "cnbc", url: "https://www.cnbc.com/id/100727362/device/rss/rss.html" },
  { src: "cnbc", url: "https://www.cnbc.com/id/20910258/device/rss/rss.html" },
  { src: "cnbc", url: "https://www.cnbc.com/id/19854910/device/rss/rss.html" },
  { src: "cbs", url: "https://www.cbsnews.com/latest/rss/world" },
  { src: "cbs", url: "https://www.cbsnews.com/latest/rss/moneywatch" },
  { src: "dw", url: "https://rss.dw.com/rdf/rss-en-world" },
  { src: "dw", url: "https://rss.dw.com/rdf/rss-en-bus" },
  { src: "dw", url: "https://rss.dw.com/rdf/rss-en-sci" },
  { src: "france24", url: "https://www.france24.com/en/rss" },
  { src: "france24", url: "https://www.france24.com/en/europe/rss" },
  { src: "france24", url: "https://www.france24.com/en/business-tech/rss" },
  { src: "africanews", url: "https://www.africanews.com/feed/rss" },
  { src: "africanews", url: "https://www.africanews.com/business/feed/rss" },
  { src: "scmp", url: "https://www.scmp.com/rss/91/feed" },
  { src: "scmp", url: "https://www.scmp.com/rss/4/feed" },
  { src: "scmp", url: "https://www.scmp.com/rss/92/feed" }
];
const INDIA_FEEDS = [
  { src: "thehindu", url: "https://www.thehindu.com/news/national/feeder/default.rss" },
  { src: "thehindu", url: "https://www.thehindu.com/business/feeder/default.rss" },
  { src: "thehindu", url: "https://www.thehindu.com/business/Economy/feeder/default.rss" },
  { src: "thehindu", url: "https://www.thehindu.com/business/Industry/feeder/default.rss" },
  { src: "thehindu", url: "https://www.thehindu.com/business/agri-business/feeder/default.rss" },
  { src: "thehindu", url: "https://www.thehindu.com/sci-tech/technology/feeder/default.rss" },
  { src: "mint", url: "https://www.livemint.com/rss/news" },
  { src: "mint", url: "https://www.livemint.com/rss/economy" },
  { src: "mint", url: "https://www.livemint.com/rss/politics" },
  { src: "mint", url: "https://www.livemint.com/rss/industry" },
  { src: "mint", url: "https://www.livemint.com/rss/companies" },
  { src: "mint", url: "https://www.livemint.com/rss/technology" }
];
const DESKS = [
  { id: "global",   mode: "global",   feeds: GLOBAL_FEEDS, data: "data/india.json",          seen: "data/seen.json",          rejected: "data/rejected.json",          threads: "data/threads-global.json",   archive: "data/archive/global" },
  { id: "domestic", mode: "domestic", feeds: INDIA_FEEDS,  data: "data/india-domestic.json", seen: "data/seen-domestic.json", rejected: "data/rejected-domestic.json", threads: "data/threads-domestic.json", archive: "data/archive/domestic" }
];
// One model per job. The first name is used; the second is a fallback if the first is unavailable.
const MODELS = {
  filter:   [process.env.FILTER_MODEL   || "claude-haiku-5-5",  "claude-sonnet-5-5"],  // keep/reject + same-story matching (high volume)
  analysis: [process.env.ANALYSIS_MODEL || "claude-opus-5-5",   "claude-sonnet-5-5"],  // why it matters + implications for kept stories
  threads:  [process.env.THREAD_MODEL   || "claude-sonnet-5-5", "claude-haiku-5-5"]    // story threads and "How we got here"
};
let usage = {};   // job -> { model, calls, inputTokens, outputTokens }
const SECTORS = [
  { id: "energy",        name: "Energy" },
  { id: "logistics",     name: "Logistics & Shipping" },
  { id: "economy",       name: "Economy & Trade" },
  { id: "technology",    name: "Technology" },
  { id: "manufacturing", name: "Manufacturing" },
  { id: "environment",   name: "Environment & Climate" },
  { id: "agriculture",   name: "Agriculture & Food" },
  { id: "governance",    name: "Policy & Governance" }
];
const MAX_REJECTED = 150;                      // audit trail of what the filter discarded, per desk
const BATCH = 25;              // headlines per filter request (kept new stories from a batch go to one analysis request)
const MAX_NEW_PER_RUN = { global: 300, domestic: 150 };   // the rest wait for the next run
const MATCH_WINDOW_DAYS = 4;   // how far back to look for the same event
const RECENT_DAYS = 60;        // the site's main file holds the last 60 days; everything is kept in monthly archive files
const THREAD_BATCH = 20;       // stories per thread-assignment request
const THREAD_ACTIVE_DAYS = 120;// threads offered for new stories to join
const SUMMARY_LIMIT = 25;      // "How we got here" summaries refreshed per desk per run
const MAX_SEEN = 3000;

/* ---------- helpers ---------- */
async function readJson(path, fallback) {
  try { return JSON.parse(await fs.readFile(path, "utf8")); } catch { return fallback; }
}
function decode(s) {
  return String(s || "")
    .replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&amp;/g, "&").trim();
}
function tag(block, name) {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(block);
  return m ? decode(m[1].trim()) : "";
}
// The publisher's summary is the FIRST paragraph of the feed description (e.g. the Guardian's subtitle);
// later paragraphs are the article body, which we don't use.
export function firstParagraph(html) {
  const parts = String(html || "").split(/<\/p>|<br\s*\/?>|\n\s*\n/i);
  for (const p of parts) { const t = plain(p); if (t.length >= 20) return t; }
  return plain(html);
}
// The opening paragraph the publisher includes in its feed (after the subtitle), if any.
export function feedLede(html) {
  const parts = String(html || "").split(/<\/p>|<br\s*\/?>|\n\s*\n/i).map(p => plain(p)).filter(t => t.length >= 20);
  const second = parts[1] || "";
  if (!second || /^continue reading|^read more/i.test(second)) return "";
  return trimSentence(second.replace(/\s*(continue reading|read more)\W*$/i, ""), 420);
}
export function trimSentence(text, max = 320) {
  const t = String(text || "").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max), m = cut.match(/^[\s\S]*[.!?]["'’”)]?(?=\s|$)/);
  if (m && m[0].length >= 30) return m[0];
  return cut.replace(/\s+\S*$/, "") + "…";
}
const SUMMARY_V = 3;   // v3: subtitle and opening paragraph stored separately; entities fixed   // bump to re-derive stored publisher summaries
function plain(s) { return decode(String(s || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 400); }
// Skip formats that duplicate an article or aren't reporting: videos, live blogs, opinion, sport, podcasts.
function skip(title, link) {
  if (/^(watch|listen|video)\s*:/i.test(title)) return true;
  if (/– as it happened$|- as it happened$/i.test(title)) return true;
  // newsletters, briefings, podcasts and round-ups summarise other reports rather than reporting news
  if (/^((monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|evening|weekend|first edition|business today)\b[^:]{0,20})?\s*briefing\s*:/i.test(title)) return true;
  if (/^(first edition|the long read|today in focus|business live|newsletter)\b|\b(podcast|quiz|in (\d+ )?(photos|pictures))\b|[–-] live$/i.test(title)) return true;
  if (/\/series\/|\/info\/|\/newsletters?\//.test(link)) return true;
  // single-stock and market-ticker items (common on business sites) edge towards stock tips
  if (/\b(share price|shares (jump|surge|fall|slump|rise|tank|rally)|stocks? to (buy|watch)|buy or sell|target price|sensex|nifty|stock market today|ipo (gmp|allotment|subscription)|q[1-4] results?:)\b/i.test(title)) return true;
  if (/\/market\/stock-market-news\/|\/market\/live-blog\/|\/astrology\/|\/horoscope/.test(link)) return true;
  return /\/sport\/|\/sports\/|\/live\/|\/liveblog\/|\/videos?\/|\/program\/|\/gallery\/|\/podcasts?\/|\/opinions?\/|\/commentisfree\/|\/audio\/|\/football\/|\/lifeandstyle\/|\/culture\/|\/tv-and-radio\/|\/music\/|\/film\/|\/books\//.test(link);
}
// Publisher-supplied thumbnail from the feed item (linked, not copied). Prefers the widest rendition.
function unescapeHtml(s) { return String(s || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, "&"); }
function attr(a, name) { const m = new RegExp(`\\b${name}=["']([^"']+)["']`).exec(a); return m ? m[1] : ""; }
// Tracking pixels and spacers that some feeds embed to count readers.
export function isJunkImage(u) { return /pixel|tracking|beacon|spacer|1x1|blank\.(gif|png)|feeds\.feedburner/i.test(String(u || "")); }
export function imageOf(block) {
  const cands = [];
  for (const m of block.matchAll(/<media:(?:content|thumbnail)\b([^>]*)>/g)) {
    const a = m[1], url = attr(a, "url"), medium = attr(a, "medium"), type = attr(a, "type");
    const w = +(attr(a, "width") || 0);
    if (!url || (medium && medium !== "image") || (type && !/^image\//.test(type)) || isJunkImage(url) || (w && w < 100)) continue;
    cands.push({ url, w });
  }
  for (const m of block.matchAll(/<enclosure\b([^>]*)>/g)) {
    const url = attr(m[1], "url"), type = attr(m[1], "type");
    if (url && /^image\//.test(type)) cands.push({ url, w: 0 });
  }
  if (!cands.length) {
    const html = unescapeHtml(block.replace(/<!\[CDATA\[|\]\]>/g, ""));
    for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)) {
      const tag = m[0], wm = /\bwidth=["']?(\d+)/i.exec(tag);
      if (isJunkImage(m[1]) || (wm && +wm[1] < 100)) continue;
      cands.push({ url: m[1], w: 0 }); break;
    }
  }
  cands.sort((x, y) => y.w - x.w);
  let u = cands[0] && unescapeHtml(cands[0].url);
  if (!u) return null;
  if (u.startsWith("//")) u = "https:" + u;
  if (!/^https:\/\//.test(u)) return null;
  const out = { image: u };
  // BBC's image service serves the same picture at larger widths; the site falls back to the original if this fails.
  let big = u.replace(/(ichef\.bbci\.co\.uk\/(?:ace|news)\/(?:standard|ws)\/)\d+\//, "$1976/");
  // The Hindu's feed gives 120px thumbnails; the same image exists at 1200px.
  big = big.replace(/(thgim\.com\/.*\/alternates\/LANDSCAPE)_\d+\b/, "$1_1200");
  if (big !== u) out.imageLarge = big;
  return out;
}
// For stories whose feed has no picture: read the article page's share image (og:image / twitter:image).
const OG_FETCH_LIMIT = 250;    // article pages opened per desk per run (high enough to catch up in one run)
const OG_CONCURRENCY = 8;
export function ogImageFromHtml(html) {
  const metas = String(html || "").match(/<meta\b[^>]*>/gi) || [];
  const found = {};
  for (const m of metas) {
    const key = (attr(m, "property") || attr(m, "name")).toLowerCase();
    const c = attr(m, "content");
    if (c && !found[key]) found[key] = c;
  }
  let u = found["og:image:secure_url"] || found["og:image"] || found["twitter:image"] || found["twitter:image:src"];
  if (!u) return null;
  u = unescapeHtml(u).trim();
  if (u.startsWith("//")) u = "https:" + u;
  if (!/^https:\/\//.test(u) || isJunkImage(u)) return null;
  if (/(default|placeholder|fallback)[-_]?(og|share|social|image)?\.(png|jpe?g|webp)/i.test(u)) return null; // site-wide stock image, not the story's
  return u;
}
export function ogDescriptionFromHtml(html) {
  for (const m of String(html || "").match(/<meta\b[^>]*>/gi) || []) {
    const key = (attr(m, "property") || attr(m, "name")).toLowerCase();
    if (key === "og:description" || key === "description" || key === "twitter:description") {
      const c = plain(unescapeHtml(attr(m, "content")));
      if (c && c.length >= 40) return trimSentence(c);
    }
  }
  return null;
}
async function fetchOgImage(url) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctl.signal, redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (compatible; ContinentConnectBot/1.0)", accept: "text/html" } });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 400000);
    return { image: ogImageFromHtml(html), description: ogDescriptionFromHtml(html) };
  } catch { return null; } finally { clearTimeout(t); }
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}
async function fillShareImages(data) {
  // Open an article page when its story lacks a photo, or its report lacks the publisher's summary.
  // Newest stories first; each report is checked once per need (ogTried / descTried) so failures aren't refetched every run.
  const events = data.sectors.flatMap(s => s.items)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const jobs = [];
  for (const ev of events) for (const r of ev.reports || []) {
    // a photo is wanted for the story, and specifically for the article whose headline is shown
    const needImg = !r.image && !r.ogTried && (!ev.image || r.url === ev.url), needSum = !r.summary && !r.descTried;
    if ((needImg || needSum) && jobs.length < OG_FETCH_LIMIT) jobs.push({ ev, r });
  }
  let found = 0, summaries = 0;
  await pool(jobs, OG_CONCURRENCY, async ({ ev, r }) => {
    r.ogTried = true; r.descTried = true;
    const page = await fetchOgImage(r.url);
    if (!page) return;
    if (page.description && !r.summary) { r.summary = page.description; r.summaryV = SUMMARY_V; summaries++; }
    if (page.image && !r.image) {
      r.image = page.image; found++;
      if (!ev.image || r.url === ev.url) { ev.image = page.image; delete ev.imageLarge; }   // prefer the headline article's own photo
    }
  });
  return { tried: jobs.length, found, summaries };
}
// ---------- Story threads: long-running storylines that collect stories over weeks or months ----------
function threadIdFor(desk, name) { return "t" + idFor(desk + ":" + name.toLowerCase().trim()).slice(1); }
function threadPrompt(stories, threads, mode) {
  const lens = mode === "domestic" ? "developments inside India" : "world news and its effects on India";
  return `You organise ${lens} into STORY THREADS: long-running storylines that develop over weeks or months, for example "Red Sea shipping attacks", "RBI interest rate decisions", "Iran conflict and oil supply", "India–US trade talks", "Monsoon and food prices".

EXISTING THREADS:
${JSON.stringify(threads)}

NEW STORIES:
${JSON.stringify(stories)}

For each new story, either put it in the existing thread whose storyline it continues, or name a new thread.
Rules:
1. Join an existing thread only if the story is part of the same storyline: the same conflict, crisis, policy process, negotiation, regulatory saga, recurring decision or company/sector saga. Sharing a country or sector is NOT enough.
2. New thread names: 2 to 6 words, specific and neutral, no dates, no opinion (good: "Red Sea shipping attacks"; bad: "Energy news", "Big week for oil").
3. If several new stories belong to the same new storyline, give them the identical new name.
4. Use only the information given.

Return ONLY a JSON array, one object per story:
[{"id":"<story id>","thread":"<existing thread key>"}] or [{"id":"<story id>","newThread":"<new name>"}]`;
}
function summaryPrompt(thread, items, mode) {
  return `Write "How we got here" for the storyline "${thread.name}" on a news site about ${mode === "domestic" ? "India" : "how world news affects India"}.

Use ONLY the dated reports below. Do not add any fact, number, name, cause or context that is not in them. Do not predict, speculate or mention investments.
Write 2 to 4 plain sentences, in time order, referring to when things happened (e.g. "In early October…"). Neutral tone.

Reports (oldest first):
${JSON.stringify(items)}

Return ONLY a JSON array with one object: [{"summary":"..."}]`;
}
async function assignThreads(events, threads, desk) {
  const cutoff = Date.now() - THREAD_ACTIVE_DAYS * 864e5;
  const pending = events.filter(e => !e.thread).sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  let assigned = 0, created = 0, failed = 0;
  for (let k = 0; k < pending.length; k += THREAD_BATCH) {
    const batch = pending.slice(k, k + THREAD_BATCH);
    const active = Object.values(threads).filter(t => Date.parse(t.updated || 0) >= cutoff)
      .sort((a, b) => String(b.updated).localeCompare(String(a.updated))).slice(0, 120)
      .map(t => ({ key: t.id, name: t.name, sector: t.sector, latest: t.latestHeadline }));
    const stories = batch.map(e => ({ id: e.id, headline: e.headline, summary: (e.reports || []).map(r => r.summary).find(Boolean) || e.why || "", sector: e.sector, date: (e.date || "").slice(0, 10) }));
    let res;
    try { res = await callClaude(threadPrompt(stories, active, desk.mode), "threads"); }
    catch (err) { console.error(`Thread batch failed: ${err.message}`); failed++; continue; }
    const byName = new Map(Object.values(threads).map(t => [t.name.toLowerCase(), t]));
    for (const r of res || []) {
      const ev = batch.find(e => e.id === r?.id); if (!ev) continue;
      let t = r.thread && threads[r.thread];
      if (!t && typeof r.newThread === "string" && r.newThread.trim()) {
        const name = r.newThread.trim().slice(0, 80);
        t = byName.get(name.toLowerCase());
        if (!t) { t = { id: threadIdFor(desk.id, name), name, sector: ev.sector, created: ev.date || new Date().toISOString() }; threads[t.id] = t; byName.set(name.toLowerCase(), t); created++; }
      }
      if (!t) continue;
      ev.thread = t.id; assigned++;
      if (!t.updated || String(ev.date || "") > String(t.updated)) { t.updated = ev.date || t.updated; t.latestHeadline = ev.headline; }
    }
  }
  return { assigned, created, failedBatches: failed };
}
async function refreshSummaries(events, threads, desk) {
  const members = {};
  for (const e of events) if (e.thread && threads[e.thread]) (members[e.thread] ||= []).push(e);
  const due = Object.entries(members).filter(([id, evs]) => evs.length >= 2 && threads[id].summaryCount !== evs.length)
    .sort((a, b) => String(threads[b[0]].updated || "").localeCompare(String(threads[a[0]].updated || ""))).slice(0, SUMMARY_LIMIT);
  let written = 0;
  for (const [id, evs] of due) {
    const t = threads[id];
    const items = evs.slice().sort((a, b) => String(a.date || "").localeCompare(String(b.date || ""))).slice(-25).map(e => ({
      date: (e.date || "").slice(0, 10), outlet: OUTLETS[e.source] || e.source, headline: e.headline,
      summary: (e.reports || []).map(r => r.summary).find(Boolean) || ""
    }));
    try {
      const res = await callClaude(summaryPrompt(t, items, desk.mode), "threads");
      const text = res && res[0] && typeof res[0].summary === "string" ? res[0].summary.trim() : "";
      if (text) { t.summary = text.slice(0, 900); t.summaryCount = evs.length; t.summaryAt = new Date().toISOString(); written++; }
    } catch (err) { console.error(`Summary for "${t.name}" failed: ${err.message}`); }
  }
  return { written, due: due.length };
}
function monthOf(e) { return String(e.date || latest(e) || new Date().toISOString()).slice(0, 7); }

function cleanUrl(u) { try { const x = new URL(u); x.search = ""; x.hash = ""; return x.toString(); } catch { return u; } }
function idFor(url) { let h = 0; for (const c of url) h = (h * 31 + c.charCodeAt(0)) >>> 0; return "s" + h.toString(36); }

export function parseRss(xml, src) {
  const items = [];
  const blocks = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)].map(m => m[1]);
  const atom = blocks.length ? [] : [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/g)].map(m => m[1]);
  for (const b of [...blocks, ...atom]) {
    const desc = tag(b, "description") || tag(b, "summary") || tag(b, "content");
    const href = tag(b, "link") || attr((/<link\b[^>]*rel=["']alternate["'][^>]*>/.exec(b) || /<link\b[^>]*>/.exec(b) || [""])[0], "href");
    const title = plain(tag(b, "title")), link = cleanUrl(href), summary = trimSentence(firstParagraph(desc)), lede = feedLede(desc);
    const pub = Date.parse(tag(b, "pubDate") || tag(b, "dc:date") || tag(b, "published") || tag(b, "updated"));
    if (!title || !link || skip(title, link)) continue;
    items.push({ src, headline: title, url: link, summary, ...(lede ? { lede } : {}), date: isNaN(pub) ? null : new Date(pub).toISOString(), ...(imageOf(b) || {}) });
  }
  return items;
}

let feedHealth = {};   // outlet -> { feedsOk, feedsFailed, items }
async function fetchFeeds(FEEDS) {
  const all = new Map();
  for (const { src, url } of FEEDS) {
    try {
      const res = await fetch(url, { headers: { "user-agent": "intelligence-engine/1.0 (+github actions)" } });
      const h = feedHealth[src] ||= { feedsOk: 0, feedsFailed: 0, items: 0 };
      if (!res.ok) { console.warn(`Feed ${url} returned ${res.status}`); h.feedsFailed++; continue; }
      const items = parseRss(await res.text(), src);
      h.feedsOk++; h.items += items.length;
      for (const it of items) if (!all.has(it.url)) all.set(it.url, it);
    } catch (e) { console.warn(`Feed ${url} failed: ${e.message}`); (feedHealth[src] ||= { feedsOk: 0, feedsFailed: 0, items: 0 }).feedsFailed++; }
  }
  return [...all.values()];
}

/* ---------- Claude analysis ---------- */
const SAME_EVENT_RULE = `Same story: if an item reports the same story as one of the KNOWN EVENTS below, set "sameAs" to that event's key. If it reports the same story as an EARLIER item in this list, set "sameAs" to "item:<id>". The same story includes follow-ups, updates, new details, reactions and investigations about the SAME incident, protest, conflict, crisis or announcement (for example three reports on the same protest movement, or a later update on the same war). It is a DIFFERENT story when a different actor takes a separate decision or action, even on the same topic (for example "US pressures Europe to release reserves" and "G7 agrees to release reserves" are two stories). Otherwise "sameAs" is null.`;

const RELEVANCE_RULES = {
  global: `Keep an item only if it plausibly affects India: a global price, supply or trade shift, a policy by a major economy, a regional conflict on India's trade or energy routes, or events in or about India. Judge by what the HEADLINE is about. A story framed around another country's domestic prices, politics, services or crime is NOT relevant, even if its summary mentions a global cause (for example "UK diesel price hits record high" is not relevant; the global cause gets its own story). Elections, leadership contests and changes of government in other countries are NOT relevant unless the item itself mentions a trade, tariff, energy, sanctions or foreign-policy shift. Sport, celebrity, entertainment, lifestyle, local crime and single-company stock news are not relevant. When unsure, choose false.`,
  domestic: `Keep an item only if it is a development of NATIONAL significance for India: national policy, regulation, budgets and taxes, RBI and banking, inflation and jobs data, infrastructure, energy, industry and manufacturing, agriculture and food supply, technology and telecom policy, environment and climate events with wide impact, and major governance developments. Mark relevant=false for crime, accidents, court cases about individuals, celebrity, entertainment, sport, religion, city- or state-level stories without national impact, party political sparring, single-company results or deals that do not affect a whole sector, and stock-market commentary. When unsure, choose false.`
};

// Step 1 (fast model): keep or reject each headline, and match follow-ups to stories already on the desk.
function filterPrompt(batch, recent, mode) {
  const items = batch.map((s, i) => ({ id: i, outlet: OUTLETS[s.src], headline: s.headline, summary: s.summary }));
  const known = recent.map(e => ({ key: e.id, headline: e.headline }));
  const desk = mode === "domestic"
    ? `an intelligence product that explains what developments INSIDE ${REGION} mean for people and businesses in ${REGION}. The items come from Indian outlets.`
    : `an intelligence product that explains how world news affects ${REGION}.`;
  return `You are the filter desk of ${desk}

For each news item, decide whether to keep it, and whether it is the same story as one already on the desk.

Rules:
1. ${RELEVANCE_RULES[mode === "domestic" ? "domestic" : "global"]}
2. Use only the headline and summary given. Do not invent facts.
3. ${SAME_EVENT_RULE}

KNOWN EVENTS:
${JSON.stringify(known)}

Items:
${JSON.stringify(items)}

Return ONLY a JSON array, one object per item:
[{"id":0,"relevant":true,"sameAs":null}]
For relevant=false return {"id":N,"relevant":false,"reason":"${mode === "domestic" ? "why it is not of national significance" : `why it does not reach ${REGION}`}, under 15 words","sameAs":null}.`;
}

// Step 2 (Opus): write the analysis for kept stories that are new to the desk.
function analysisPrompt(batch, mode) {
  const sectors = SECTORS.map(s => `- ${s.id}: ${s.name}`).join("\n");
  const items = batch.map(({ i, s }) => ({ id: i, outlet: OUTLETS[s.src], headline: s.headline, summary: s.summary, ...(s.lede ? { opening: s.lede } : {}) }));
  const shape = `[{"id":0,"relevant":true,"sector":"energy","relevance":"high","why":"...","implications":["...","..."]}]`;
  const lens = mode === "domestic"
    ? { role: `explains what developments INSIDE ${REGION} mean for people and businesses in ${REGION}`,
        why: `"why" is one sentence on why this matters for ${REGION} as a whole.`,
        impl: `Implications are concrete near-term effects on households, workers, farmers, businesses, prices, jobs, loans, taxes, supply or public services.`,
        check: `of national significance for ${REGION}` }
    : { role: `explains how world news affects ${REGION}`,
        why: `"why" is one sentence on how this reaches ${REGION}.`,
        impl: `Implications are near-term effects on ${REGION}: prices, supply, trade, jobs, travel, citizens abroad, policy or security.`,
        check: `something that plausibly affects ${REGION}` };
  return `You are the senior analysis desk of an intelligence product that ${lens.role}. A filter has already kept these items; write the analysis for each.

Sectors:
${sectors}

Rules:
1. Use only the headline, summary and opening text given as facts. Do not invent numbers, names, events or causes.
2. Choose the ONE sector the item affects most.
3. ${lens.why} ${lens.impl} Give 2 or 3 implications, one plain sentence each, under 25 words.
4. Never discuss securities: no stocks, share prices, market moves, companies that benefit, or investment actions.
5. Use cautious wording ("may", "could", "likely") for anything uncertain.
6. relevance: "high" = direct, material effect on many people or a whole sector within weeks; "medium" = clear but modest, narrower or indirect.
7. If, on a careful reading, an item is not ${lens.check}, return {"id":N,"relevant":false,"reason":"under 15 words"} instead.

Items:
${JSON.stringify(items)}

Return ONLY a JSON array, one object per item:
${shape}`;
}

async function callClaude(prompt, job) {
  let lastErr;
  for (const model of MODELS[job]) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({ model, max_tokens: 4000, messages: [{ role: "user", content: prompt }] })
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      const u = usage[job] ||= { model, calls: 0, inputTokens: 0, outputTokens: 0 };
      u.model = model; u.calls++; u.inputTokens += body.usage?.input_tokens || 0; u.outputTokens += body.usage?.output_tokens || 0;
      const text = (body.content || []).filter(b => b.type === "text").map(b => b.text).join("");
      const i = text.indexOf("["), j = text.lastIndexOf("]");
      if (i < 0 || j < i) throw new Error("Claude reply had no JSON array");
      return JSON.parse(text.slice(i, j + 1));
    }
    lastErr = new Error(`Claude API ${res.status} (${model}): ${body?.error?.message || "unknown error"}`);
    // Try the fallback model only when this model name isn't available.
    if (!(res.status === 404 || (res.status === 400 && /model/i.test(body?.error?.message || "")))) break;
    console.warn(`Model ${model} unavailable for ${job}, trying fallback`);
  }
  throw lastErr;
}

/* ---------- main ---------- */
export async function main() {
  if (!process.env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY secret is missing."); process.exit(1); }
  await fs.mkdir("data", { recursive: true });
  let deskFailed = false;
  for (const desk of DESKS) {
    console.log(`\n=== ${desk.id} desk ===`);
    const r = await runDesk(desk);
    if (r.failures && !r.added && !r.merged && r.analysed) deskFailed = true;
  }
  if (deskFailed) process.exit(1); // surface a desk whose analysis failed entirely in the Actions tab
}

async function runDesk(desk) {
  feedHealth = {}; usage = {};
  let data = await readJson(desk.data, null);
  let seen = new Set(await readJson(desk.seen, []));
  if (!data || data.schema !== SCHEMA) {
    console.log("Starting fresh under the current rules (schema " + SCHEMA + ")");
    data = null; seen = new Set();
  }
  data = data || { schema: SCHEMA, region: REGION, since: SINCE, updatedAt: null, sectors: [] };
  data.schema = SCHEMA; data.desk = desk.id; data.mode = desk.mode;
  const deskOutlets = [...new Set(desk.feeds.map(f => f.src))];
  data.sources = deskOutlets.map(id => ({ id, name: OUTLET_INFO[id].name, region: OUTLET_INFO[id].region }));
  data.source = Object.values(OUTLETS).join(" & ");
  const byId = Object.fromEntries((data.sectors || []).map(s => [s.id, s]));
  data.sectors = SECTORS.map(s => ({ ...s, items: byId[s.id]?.items || [] }));
  // Bring back every archived story so nothing is ever dropped.
  const archIndex = await readJson(`${desk.archive}/index.json`, { months: [] });
  const known = new Set(data.sectors.flatMap(s => s.items.map(i => i.id)));
  for (const m of archIndex.months || []) {
    const file = await readJson(`${desk.archive}/${m.month}.json`, { events: [] });
    for (const ev of file.events || []) {
      if (known.has(ev.id)) continue;
      const sec = data.sectors.find(x => x.id === ev.sector); if (!sec) continue;
      const { sector, ...rest } = ev; sec.items.push(rest); known.add(ev.id);
    }
  }
  const threads = data.schema === SCHEMA ? (await readJson(desk.threads, { threads: {} })).threads || {} : {};

  const allEvents = () => data.sectors.flatMap(s => s.items);
  const findEvent = key => allEvents().find(e => e.id === key);
  const sinceMs = Date.parse(SINCE);
  const fetched = await fetchFeeds(desk.feeds);
  // Backfill images onto stories already on the desk (no re-analysis needed).
  const imgByUrl = new Map(fetched.filter(i => i.image).map(i => [i.url, i]));
  const sumByUrl = new Map(fetched.filter(i => i.summary && i.summary.length >= 40).map(i => [i.url, i]));
  let backfilled = 0;
  const tidy = o => {
    if ((o.summary || o.lede) && o.summaryV !== SUMMARY_V) { delete o.summary; delete o.lede; delete o.descTried; }
    if (o.headline) o.headline = plain(o.headline);
    if (o.image && isJunkImage(o.image)) { delete o.image; delete o.imageLarge; }
    if (o.image && !o.imageLarge) { const up = imageOf(`<media:content url="${o.image}"/>`); if (up && up.imageLarge) o.imageLarge = up.imageLarge; }
  };
  for (const sec of data.sectors) for (const ev of sec.items) { tidy(ev); (ev.reports || []).forEach(tidy); if (ev.headline) ev.headline = plain(ev.headline); }
  for (const sec of data.sectors) for (const ev of sec.items) {
    for (const r of ev.reports || []) {
      const f = imgByUrl.get(r.url); if (f && !r.image) { r.image = f.image; if (f.imageLarge) r.imageLarge = f.imageLarge; }
      const g = sumByUrl.get(r.url); if (g && !r.summary) { r.summary = g.summary; if (g.lede) r.lede = g.lede; r.summaryV = SUMMARY_V; }
    }
    if (!ev.image) { const r = (ev.reports || []).find(x => x.image); if (r) { ev.image = r.image; if (r.imageLarge) ev.imageLarge = r.imageLarge; backfilled++; } }
  }
  if (backfilled) console.log(`Added images to ${backfilled} existing stories`);
  const fresh = fetched
    .filter(it => !it.date || Date.parse(it.date) >= sinceMs)
    .filter(it => !seen.has(it.url))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))   // take the newest headlines first...
    .slice(0, MAX_NEW_PER_RUN[desk.id] || 150)
    .reverse();                                                    // ...then process them in time order so the first report leads
  console.log(`${fresh.length} new headlines to analyse: ` + deskOutlets.map(k => `${OUTLETS[k]} ${fresh.filter(f => f.src === k).length}`).join(", "));
  console.log("Feed health: " + JSON.stringify(feedHealth));

  const rejected = data.schema === SCHEMA && seen.size ? await readJson(desk.rejected, []) : [];
  let added = 0, merged = 0, failures = 0;
  for (let k = 0; k < fresh.length; k += BATCH) {
    const batch = fresh.slice(k, k + BATCH);
    const cutoff = Date.now() - MATCH_WINDOW_DAYS * 864e5;
    const recent = allEvents().filter(e => !e.date || Date.parse(e.date) >= cutoff).slice(0, 80);
    // Step 1: the fast model keeps or rejects each headline and spots follow-ups to known stories.
    let verdicts;
    try { verdicts = await callClaude(filterPrompt(batch, recent, desk.mode), "filter"); }
    catch (e) { console.error(`Filter batch failed: ${e.message}`); failures++; continue; } // not marked seen: retried next run
    const byId = new Map();
    for (const v of verdicts || []) if (v && Number.isInteger(+v.id) && batch[+v.id]) byId.set(+v.id, v);
    const isFollowUp = (i, v) => {
      if (typeof v.sameAs !== "string" || !v.sameAs) return false;
      if (v.sameAs.startsWith("item:")) { const k = +v.sameAs.slice(5); return k < i && !!byId.get(k)?.relevant; }
      return !!findEvent(v.sameAs);
    };
    // Step 2: Opus writes the analysis for kept stories that are new to the desk, in one request per batch.
    const toAnalyse = [...byId.entries()].filter(([i, v]) => v.relevant && !isFollowUp(i, v)).map(([i]) => ({ i, s: batch[i] }));
    const analysis = new Map();
    if (toAnalyse.length) {
      try { for (const r of await callClaude(analysisPrompt(toAnalyse, desk.mode), "analysis")) if (r && Number.isInteger(+r.id)) analysis.set(+r.id, r); }
      catch (e) { console.error(`Analysis batch failed: ${e.message}`); failures++; continue; } // whole batch retried next run
    }
    const reject = (s, reason) => rejected.unshift({ source: s.src, headline: s.headline, url: s.url, date: s.date,
      reason: typeof reason === "string" ? reason.slice(0, 160) : "", checkedAt: new Date().toISOString() });
    const placed = {}, dropped = new Set();                 // batch index -> event it went into / items rejected at step 2
    for (let i = 0; i < batch.length; i++) {
      const s = batch[i], v = byId.get(i);
      if (!v) continue;
      if (!v.relevant) { reject(s, v.reason); continue; }
      const report = { source: s.src, headline: s.headline, url: s.url, date: s.date, ...(s.summary && s.summary.length >= 40 ? { summary: s.summary, summaryV: SUMMARY_V } : {}), ...(s.lede ? { lede: s.lede } : {}), ...(s.image ? { image: s.image } : {}), ...(s.imageLarge ? { imageLarge: s.imageLarge } : {}) };
      if (isFollowUp(i, v)) {
        const k = v.sameAs.startsWith("item:") ? +v.sameAs.slice(5) : null;
        const target = k === null ? findEvent(v.sameAs) : placed[k];
        if (!target) { if (k !== null && dropped.has(k)) { reject(s, "Same story as an item the analysis desk set aside"); dropped.add(i); } continue; }
        if (!target.reports.some(x => x.url === s.url)) target.reports.push(report);
        if (!target.image && s.image) { target.image = s.image; if (s.imageLarge) target.imageLarge = s.imageLarge; }
        placed[i] = target; merged++;
        continue;
      }
      const r = analysis.get(i);
      if (!r) continue;
      if (r.relevant === false) { reject(s, r.reason); dropped.add(i); continue; }
      const sector = data.sectors.find(x => x.id === r.sector);
      if (!sector) continue;
      const ev = {
        id: idFor(s.url), headline: s.headline, url: s.url, source: s.src, date: s.date,
        relevance: r.relevance === "high" ? "high" : "medium",
        ...(s.image ? { image: s.image } : {}), ...(s.imageLarge ? { imageLarge: s.imageLarge } : {}),
        why: typeof r.why === "string" ? r.why : "",
        implications: (r.implications || []).filter(x => typeof x === "string").slice(0, 3),
        reports: [report]
      };
      sector.items.push(ev); placed[i] = ev; added++;
    }
    batch.forEach(s => seen.add(s.url));
  }

  const og = await fillShareImages(data);
  if (og.tried) console.log(`Article pages checked: ${og.tried} (photos found ${og.found}, summaries found ${og.summaries})`);

  for (const s of data.sectors) {
    const uniq = new Map(s.items.map(i => [i.id, i]));
    s.items = [...uniq.values()].sort((a, b) => latest(b).localeCompare(latest(a)));
  }
  const everything = data.sectors.flatMap(s => s.items.map(i => Object.assign(i, { sector: s.id })));

  // Story threads and their "How we got here" summaries
  const th = await assignThreads(everything, threads, desk);
  const sm = await refreshSummaries(everything, threads, desk);
  console.log(`Threads: ${th.assigned} stories assigned, ${th.created} new threads; summaries written: ${sm.written}`);

  // Monthly archive: every story, kept permanently
  const byMonth = {};
  for (const e of everything) (byMonth[monthOf(e)] ||= []).push(e);
  await fs.mkdir(desk.archive, { recursive: true });
  for (const [month, evs] of Object.entries(byMonth)) {
    await fs.writeFile(`${desk.archive}/${month}.json`, JSON.stringify({ desk: desk.id, month, events: evs }) + "\n");
  }
  await fs.writeFile(`${desk.archive}/index.json`, JSON.stringify({ desk: desk.id, months: Object.keys(byMonth).sort().reverse().map(m => ({ month: m, count: byMonth[m].length })) }, null, 2) + "\n");

  // Threads file: names, summaries and a lightweight timeline the site can show without loading archives
  const refs = {};
  for (const e of everything) if (e.thread && threads[e.thread]) (refs[e.thread] ||= []).push({ id: e.id, date: e.date, headline: e.headline, source: e.source, url: e.url, sector: e.sector, month: monthOf(e) });
  for (const [id, t] of Object.entries(threads)) {
    const list = (refs[id] || []).sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
    t.events = list; t.count = list.length;
    if (list.length) { t.first = list[0].date; t.updated = list[list.length - 1].date || t.updated; t.latestHeadline = list[list.length - 1].headline; }
  }
  await fs.writeFile(desk.threads, JSON.stringify({ desk: desk.id, updatedAt: new Date().toISOString(), threads }, null, 1) + "\n");

  // Main file for the site: the last RECENT_DAYS days (no per-sector cap)
  const recentCut = Date.now() - RECENT_DAYS * 864e5;
  for (const s of data.sectors) s.items = s.items.filter(i => { const t = Date.parse(latest(i)); return isNaN(t) || t >= recentCut; }).map(({ sector, ...rest }) => rest);
  data.recentDays = RECENT_DAYS;
  data.updatedAt = new Date().toISOString();
  data.lastRun = { analysed: fresh.length, added, merged, rejected: fresh.length && !failures ? fresh.length - added - merged : undefined, failedBatches: failures, feeds: feedHealth, shareImages: og, threads: th, summaries: sm, models: usage };

  await fs.writeFile(desk.data, JSON.stringify(data, null, 2) + "\n");
  await fs.writeFile(desk.seen, JSON.stringify([...seen].slice(-MAX_SEEN)) + "\n");
  await fs.writeFile(desk.rejected, JSON.stringify(rejected.slice(0, MAX_REJECTED), null, 2) + "\n");
  console.log(`Added ${added} new events, merged ${merged} reports into existing events. Failed batches: ${failures}.`);
  return { added, merged, failures, analysed: fresh.length };
}
function latest(e) { return (e.reports || []).map(r => r.date || "").sort().pop() || e.date || ""; }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => { console.error(e); process.exit(1); });
