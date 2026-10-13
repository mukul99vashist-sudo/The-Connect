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
  threads:  [process.env.THREAD_MODEL   || "claude-sonnet-5-5", "claude-haiku-5-5"],   // story threads and "How we got here"
  stats:    [process.env.STATS_MODEL    || "claude-sonnet-5-5", "claude-opus-5-5"]     // official statistics via web search
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
const CLASSIFY_BATCH = 40;     // reports per request when labelling older reports with their kind
const CLASSIFY_LIMIT = 800;    // older reports labelled per desk per run (the rest wait for the next run)
const KINDS = ["hard", "breaking", "investigative", "soft", "feature", "opinion"];
const KIND_RULE = `"kind" is what sort of piece it is:
- "hard": straight reporting of events, decisions, data or policy
- "breaking": first reports of something that has just happened, details still emerging
- "investigative": the outlet's own investigation or exclusive findings
- "soft": human-interest, lifestyle or personal stories
- "feature": long-form background, explainers, analysis pieces and profiles
- "opinion": columns, editorials, op-eds, letters and commentary`;
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
4. ${KIND_RULE}
Give "kind" for EVERY item, kept or not. For kept items also give "sector", the ONE sector it fits best:
${SECTORS.map(s => `- ${s.id}: ${s.name}`).join("\n")}

KNOWN EVENTS:
${JSON.stringify(known)}

Items:
${JSON.stringify(items)}

Return ONLY a JSON array, one object per item:
[{"id":0,"kind":"hard","relevant":true,"sector":"energy","sameAs":null}]
For relevant=false return {"id":N,"kind":"...","relevant":false,"reason":"${mode === "domestic" ? "why it is not of national significance" : `why it does not reach ${REGION}`}, under 15 words","sameAs":null}.`;
}

// One-off labelling of older reports with their kind (no change to their analysis).
function classifyPrompt(items) {
  return `Label each news report with what sort of piece it is.

${KIND_RULE}

Judge from the outlet, headline, summary and web address. Use only what is given.

Reports:
${JSON.stringify(items)}

Return ONLY a JSON array, one object per report: [{"id":0,"kind":"hard"}]`;
}
async function classifyOlder(data) {
  const pending = data.sectors.flatMap(sec => sec.items.flatMap(ev => (ev.reports || []).filter(r => !KINDS.includes(r.kind)))).slice(0, CLASSIFY_LIMIT);
  let labelled = 0, failed = 0;
  for (let k = 0; k < pending.length; k += CLASSIFY_BATCH) {
    const batch = pending.slice(k, k + CLASSIFY_BATCH);
    const items = batch.map((r, i) => { let path = ""; try { path = new URL(r.url).pathname; } catch {} return { id: i, outlet: OUTLETS[r.source] || r.source, headline: r.headline, summary: r.summary || "", path }; });
    try {
      for (const v of await callClaude(classifyPrompt(items), "filter")) {
        const r = batch[+v?.id]; if (r && KINDS.includes(v.kind)) { r.kind = v.kind; labelled++; }
      }
    } catch (e) { console.error(`Kind labelling batch failed: ${e.message}`); failed++; }
  }
  return { labelled, waiting: Math.max(0, pending.length - labelled), failedBatches: failed };
}

// ---------- Layer 2: the analysis framework library ----------
// 1) A fast model answers yes/no feature questions about each story.
// 2) Plain code picks the primary framework from a fixed priority order and sets the depth tier.
// 3) Opus fills the chosen framework(s) plus the universal block, using only the reports.
// 4) Validators drop any figure that is not in the reports and any sentence that reads like advice.
const ANALYSIS_V = 2;
const ANALYSIS_CHUNK = 3;      // stories per Opus request (each analysis is long)
const FEATURE_BATCH = 12;      // stories per feature-question request
const REFRAME_LIMIT = 24;      // existing stories (re)analysed per desk per run, newest first

const FRAMEWORKS = {
  impact_chain:   "Impact chain",
  disruption_map: "Disruption map",
  trade_flow:     "Trade flow shift",
  policy_tracker: "Policy & compliance tracker",
  decoder:        "Release & decision decoder",
  pass_through:   "Price pass-through ladder",
  winners_losers: "Winners & losers",
  conflicting:    "Conflicting accounts",
  timeline:       "Timeline & attribution",
  escalation:     "Conflict escalation ladder",
  scenarios:      "Scenarios & signposts"
};
// Fixed priority: the first feature that is true picks the primary framework.
const PRIORITY = [
  ["conflict", "conflicting"], ["scheduled", "decoder"], ["disruption", "disruption_map"], ["armed_conflict", "escalation"],
  ["trade_flow", "trade_flow"], ["policy_stage", "policy_tracker"], ["price_move", "pass_through"],
  ["allocation", "winners_losers"], ["fast_moving", "timeline"]
];
const FEATURE_KEYS = ["conflict", "scheduled", "disruption", "armed_conflict", "trade_flow", "policy_stage", "price_move", "allocation", "fast_moving", "pending_outcome"];
function pickPrimary(f) { for (const [k, fw] of PRIORITY) if (f && f[k]) return fw; return "impact_chain"; }
// Deep-dive pairing, evaluated in order. Never pairs a framework with itself.
function pickComplement(primary, f) {
  const order = {
    impact_chain:   [f.pending_outcome && "scenarios", "winners_losers"],
    disruption_map: [f.armed_conflict && "escalation", f.price_move && "pass_through", f.pending_outcome && "scenarios", "winners_losers"],
    trade_flow:     [f.price_move && "pass_through", f.pending_outcome && "scenarios", "winners_losers"],
    policy_tracker: [f.pending_outcome && "scenarios", "winners_losers"],
    decoder:        ["pass_through", "winners_losers"],
    pass_through:   ["winners_losers"],
    winners_losers: [f.pending_outcome && "scenarios", "impact_chain"],
    conflicting:    ["impact_chain"],
    timeline:       [f.armed_conflict && "escalation", "scenarios"],
    escalation:     ["scenarios"]
  }[primary] || ["winners_losers"];
  return order.find(x => x && x !== primary) || null;
}
// Depth tier from the story's own reports.
function tierOf(ev) {
  const reps = ev.reports || [];
  const outlets = new Set(reps.map(r => r.source)).size;
  const ts = reps.map(r => Date.parse(r.date)).filter(t => !isNaN(t));
  const spanDays = ts.length ? (Math.max(...ts) - Math.min(...ts)) / 864e5 : 0;
  if (outlets < 2) return "quick";
  if (spanDays >= 3 || reps.length >= 5 || (ev.relevance === "high" && outlets >= 3)) return "deep";
  return "standard";
}
const TIER_RANK = { quick: 0, standard: 1, deep: 2 };

function featurePrompt(items) {
  return `For each news story below (one or more reports on the same event), answer yes/no questions about what the story IS. Judge the main subject of the reports, not possible consequences.

Questions (true or false):
- "conflict": two or more reports give incompatible values or claims on the SAME headline fact (e.g. different casualty numbers, who did it, whether it happened). A later update from the same source is not a conflict.
- "scheduled": the story is a scheduled official data release or decision (GDP, CPI, WPI, IIP, trade data, jobs data, RBI/Fed/ECB rate decisions, OPEC+ meetings, budgets, GST Council).
- "disruption": a NAMED facility or route (port, airport, strait, canal, pipeline, refinery, power plant, factory, rail or road link) is reported closed, damaged, attacked, blocked or disrupted.
- "armed_conflict": military action, an attack by an armed group, strikes, troop movements, or ceasefire/war talks.
- "trade_flow": a NAMED good and a NAMED partner with a change in buying or selling, or a tariff, sanction, ban, quota or trade deal that changes such a flow.
- "policy_stage": a NAMED law, regulation, rule or scheme reported at a stage (proposed, draft, passed, notified, takes effect, delayed, struck down) with a further stage still pending.
- "price_move": the headline is a change in a price, exchange rate or interest rate, or an immediate one-off tax or duty change.
- "allocation": an action by a named company or industry (merger, investment, plant opening or closure, layoffs, large contract) or an allocation decision (budget, MSP, subsidy, quota).
- "fast_moving": three or more developments in sequence across the reports, or responsibility for an act is disputed.
- "pending_outcome": the reports name an unresolved next outcome (talks, vote, ruling, deadline, retaliation, reopening).

Stories:
${JSON.stringify(items)}

Return ONLY a JSON array: [{"id":0,"conflict":false,"scheduled":false,"disruption":true,"armed_conflict":true,"trade_flow":false,"policy_stage":false,"price_move":false,"allocation":false,"fast_moving":false,"pending_outcome":true}]`;
}

const GROUPS = ["Fuel & LPG users", "Food shoppers", "Borrowers", "Depositors & savers", "Salaried workers", "Farmers", "Fishers", "MSME exporters", "Large exporters", "Importers & traders", "Students abroad", "Gulf & overseas workers and families", "Travellers & pilgrims", "IT & services workers", "Manufacturing workers", "Power consumers", "Government finances", "A named state or region"];
const FW_SPEC = {
  impact_chain: `"impact_chain": {"chain":[{"step":"≤6 words","detail":"≤15 words","basis":"reported|inferred"}], "breaks_if":"the condition that would stop the effect, ≤15 words"}. 3 steps at Quick read, up to 4 otherwise. The first step must be reported. At most 1 inferred step at Quick read, 2 otherwise.`,
  disruption_map: `"disruption_map": {"node":{"name":"...","type":"port|airport|strait|canal|pipeline|refinery|power plant|factory|rail|road|other","status":"closed|partial|open|unknown","as_of":"date/time as reported"},"cause":{"text":"≤15 words","status":"confirmed|claimed|alleged"},"flows":[{"flow":"crude|LNG|containers|air passengers|workers|pilgrims|cargo|other","india_link":"≤15 words","basis":"reported|inferred"}],"alternatives":["as reported"],"duration":"as reported, or 'not reported'"}. Only flows named in the reports.`,
  trade_flow: `"trade_flow": {"good":"...","actors":[{"country":"...","role":"exporter|importer|third_party","is_india":false}],"change":{"type":"start|stop|increase|cut|tariff|sanction|ban|deal|other","effective":"date if reported"},"india_position":{"role":"competing_buyer|supplier|rival_exporter|transit|not_involved","note":"≤20 words, cautious"},"volumes":[{"value":0,"unit":"...","period":"...","from":"<outlet>"}]}. Volumes only if stated in the reports.`,
  policy_tracker: `"policy_tracker": {"instrument":{"name":"...","issuer":"...","jurisdiction":"..."},"stages":[{"stage":"announced|draft|adopted|notified|transition|in_force|under_review|amended_or_repealed","date":"if reported","status":"done|current|next"}],"obligations":[{"who":"...","what":"≤15 words","from":"date if reported"}],"applies_to_india":"yes|no|partly"}. Assign stages only from the reports' wording; a proposal is never "in_force".`,
  decoder: `"decoder": {"kind":"release|decision","headline":{"label":"...","value":0,"unit":"...","period":"...","previous":null,"previousLabel":"...","from":"<outlet>"},"comparisons":[{"label":"e.g. RBI target, year ago","value":0,"unit":"...","from":"<outlet>"}],"drivers":[{"name":"≤6 words","direction":"up|down|mixed"}],"decision":{"action":"hike|cut|hold|other","size":"as reported","stance":"≤15 words as stated"}}. Drivers only as stated by the issuer or quoted in reports. No consensus figure unless a report attributes one.`,
  pass_through: `"pass_through": {"driver":{"variable":"...","direction":"up|down","size":"as reported or empty"},"product":"petrol & diesel|LPG|edible oils|fertiliser|food staples|electronics|loan EMIs|deposit rates|other","rungs":[{"stage":"≤6 words, e.g. Global crude price → Refiners' cost → Pump price","pass":"likely|partial|blocked|unclear","damper":"what slows or blocks it, ≤12 words (taxes, administered prices, subsidies, contracts, inventory)","lag":"days|weeks|months"}],"end_user":{"group":"one of the affected groups","effect":"≤20 words, cautious"}}. 3 to 5 rungs from the global price to what Indians pay. Never give a percentage.`,
  winners_losers: `"winners_losers": {"groups":[{"group":"one of the affected groups","direction":"gain|lose|mixed|unclear","directness":"direct|indirect","mechanism":"≤15 words"}],"not_affected":"a group readers might assume is affected but is not, ≤15 words, or empty"}. Max 6 groups; each needs a mechanism from the reports. Never name companies as winners in a market sense.`,
  conflicting: `"conflicting": {"disputed":{"item":"what is disputed","unit":"..."},"accounts":[{"outlet":"...","value":"as reported","origin":"who the figure or claim comes from","time":"as reported"}],"agreed":["facts all reports agree on"],"explanations":[{"type":"different time|different source|different definition|unexplained","note":"≤15 words"}],"status":"unresolved|converging|resolved"}. Never average or pick a side; use neutral verbs.`,
  timeline: `"timeline": {"entries":[{"when":"as reported","what":"≤15 words","actor":"...","outlet":"...","type":"action|claim|denial|confirmation","verification":"confirmed|claimed|contested"}],"current_status":"≤20 words","open_questions":["≤15 words"]}. Oldest first, up to 6 entries. Keep both sides of any contested claim.`,
  escalation: `"escalation": {"current_rung":1,"evidence":"the reported action that places it there, ≤20 words","previous_rung":null,"next_signals":[{"rung":5,"signal":"observable event that would show a move to that rung, ≤15 words"}],"india_channels":["oil|shipping|remittances|diaspora safety|flights|trade"]}. Rungs: 1 Rhetoric and threats; 2 Sanctions and diplomatic measures; 3 Mobilisation and posturing; 4 Limited strikes or attacks; 5 Sustained strikes; 6 Strikes on critical infrastructure or third countries; 7 Full-scale war. The rung must match actions actually reported; never predict.`,
  scenarios: `"scenarios": {"question":"the unresolved thing, ≤15 words","scenarios":[{"name":"≤4 words","what":"≤20 words","signal":"observable signal, ≤15 words","india_effect":"≤15 words, cautious"}]}. 2 or 3 scenarios, each tied to an outcome named in the reports or an official position. No probabilities, no ranking.`
};

function analysisPrompt(batch, mode) {
  const sectors = SECTORS.map(s => `- ${s.id}: ${s.name}`).join("\n");
  const lens = mode === "domestic" ? `explains what developments INSIDE ${REGION} mean for people and businesses in ${REGION}` : `explains how world news affects ${REGION}`;
  const check = mode === "domestic" ? `of national significance for ${REGION}` : `something that plausibly affects ${REGION}`;
  const used = [...new Set(batch.flatMap(x => [x.primary, x.complement]).filter(Boolean))];
  const items = batch.map(x => ({ id: x.i, kind: x.kind, tier: x.tier, frameworks: [x.primary, x.complement].filter(Boolean), reports: x.reports }));
  return `You are the senior analysis desk of an intelligence product that ${lens}. For each story, write the universal block and fill the framework(s) listed for it, using ONLY the reports given.

UNIVERSAL BLOCK (every story):
- "sector": ONE of the sectors below. "relevance": "high" (direct, material effect on many people or a whole sector within weeks) or "medium".
- "why": the bottom line in one sentence, ≤30 words: how this reaches ${REGION}.
- "implications": 2 or 3 plain sentences, each ≤25 words.
- "exposure": {"level":"high|medium|low","reason":"≤20 words"}. High = touches a household essential (fuel, LPG, food staples, loan EMIs, deposit rates), a top Indian import or export, or the safety or travel of Indians. Medium = one industry, one bilateral relationship or a compliance obligation. Low = indirect or no mechanism in the reports.
- "horizon": {"value":"now|weeks|months|years","reason":"≤12 words"}. now = under a week.
- "confidence": {"level":"high|medium|low","reason":"≤15 words"}. High = 3+ outlets agree and an on-record official source; medium = 2 outlets, or 1 with an official source; low = single outlet, anonymous sourcing, claims by a party, or an unresolved conflict.
- "affected": 1 to 4 of [{"group":"exactly one of: ${GROUPS.join(", ")}","direction":"up|down|mixed|unclear","what":"what changes for them, ≤6 words (e.g. fuel prices, flight availability, compliance costs)","basis":"reported|inferred"}].
- "watch": 1 to 3 of [{"what":"observable event, ≤15 words","when":"date if reported, else empty","where":"named official source to check, or empty"}].

FRAMEWORKS (fill only those listed for each story, under these keys):
${used.map(k => "- " + FW_SPEC[k]).join("\n")}

DEPTH: "quick" = keep every field short and minimal. "standard" = complete. "deep" = complete, using every report.

RULES:
1. Facts only from the reports. Never invent numbers, names, dates, causes or events. Every number you write must appear in the reports. If a field cannot be filled, leave it out.
2. Mark anything not stated in the reports as "inferred" and word it with "may" or "could".
3. Never give advice of any kind: no stocks, investments, trades, buying, selling, locking in rates, stocking up or timing decisions. Explain mechanisms only.
4. Kind "breaking": early report; keep effects conditional and confidence at most medium. Kind "investigative": attribute findings to the outlet ("The Guardian reports that…").
5. If, on a careful reading, a story is not ${check}, return {"id":N,"relevant":false,"reason":"≤15 words"}.

Sectors:
${sectors}

Stories:
${JSON.stringify(items)}

Return ONLY a JSON array, one object per story: [{"id":0,"relevant":true,"sector":"...","relevance":"...","why":"...","implications":[],"exposure":{},"horizon":{},"confidence":{},"affected":[],"watch":[], "<framework key>":{...}}]`;
}

// ----- validators -----
const ADVICE = /\b(you should|readers should|consider (buying|selling|investing|locking|hedging|stocking)|good (time|window|moment) to|lock(ing)? in (a |the )?(rate|fd|deposit|price)|stock up|bulk (buy|buying|purchases?)|buy (now|before|more)|sell (now|before)|(buy|sell|hold) (rating|call|recommendation)|target price|multibagger|outperform|portfolio|invest in|investors? should)\b/i;
function noAdvice(s) { return typeof s === "string" && !ADVICE.test(s); }
function numbersIn(text) { return new Set((String(text).replace(/(\d),(?=\d{2,3}\b)/g, "$1").match(/\d+(\.\d+)?/g) || []).map(Number)); }
function str(x, n = 240) { return typeof x === "string" ? x.trim().slice(0, n) : ""; }
function numOrNull(x) { if (typeof x === "number" && isFinite(x)) return x; if (typeof x === "string" && /^-?[\d,]+(\.\d+)?$/.test(x.trim())) return +x.replace(/,/g, ""); return null; }
const pick = (x, list, d) => list.includes(x) ? x : d;
const arr = (x, n) => (Array.isArray(x) ? x : []).slice(0, n);
// A figure is kept only if its value appears in the reports' text.
const inReports = (v, nums) => v === null || nums.has(v) || nums.has(Math.abs(v));

function cleanFramework(key, f, nums) {
  if (!f || typeof f !== "object") return null;
  const s = (x, n) => noAdvice(str(x, n)) ? str(x, n) : "";
  switch (key) {
    case "impact_chain": { const chain = arr(f.chain, 4).map(x => ({ step: s(x?.step, 60), detail: s(x?.detail, 140), basis: pick(x?.basis, ["reported", "inferred"], "inferred") })).filter(x => x.step); return chain.length ? { chain, breaks_if: s(f.breaks_if, 140) } : null; }
    case "disruption_map": { const n = f.node || {}; if (!str(n.name)) return null;
      return { node: { name: str(n.name, 80), type: str(n.type, 20), status: pick(n.status, ["closed", "partial", "open", "unknown"], "unknown"), as_of: str(n.as_of, 40) },
        cause: f.cause ? { text: s(f.cause.text, 140), status: pick(f.cause.status, ["confirmed", "claimed", "alleged"], "claimed") } : null,
        flows: arr(f.flows, 5).map(x => ({ flow: str(x?.flow, 30), india_link: s(x?.india_link, 140), basis: pick(x?.basis, ["reported", "inferred"], "inferred") })).filter(x => x.flow),
        alternatives: arr(f.alternatives, 3).map(x => s(x, 100)).filter(Boolean), duration: str(f.duration, 60) || "not reported" }; }
    case "trade_flow": { if (!str(f.good)) return null;
      return { good: str(f.good, 60), actors: arr(f.actors, 5).map(x => ({ country: str(x?.country, 40), role: pick(x?.role, ["exporter", "importer", "third_party"], "third_party"), is_india: !!x?.is_india })).filter(x => x.country),
        change: { type: str(f.change?.type, 20), effective: str(f.change?.effective, 40) },
        india_position: f.india_position ? { role: pick(f.india_position.role, ["competing_buyer", "supplier", "rival_exporter", "transit", "not_involved"], "not_involved"), note: s(f.india_position.note, 160) } : null,
        volumes: arr(f.volumes, 3).map(x => ({ value: numOrNull(x?.value), unit: str(x?.unit, 30), period: str(x?.period, 30), from: str(x?.from, 40) })).filter(x => x.value !== null && inReports(x.value, nums)) }; }
    case "policy_tracker": { if (!str(f.instrument?.name)) return null;
      return { instrument: { name: str(f.instrument.name, 100), issuer: str(f.instrument.issuer, 60), jurisdiction: str(f.instrument.jurisdiction, 40) },
        stages: arr(f.stages, 8).map(x => ({ stage: pick(x?.stage, ["announced", "draft", "adopted", "notified", "transition", "in_force", "under_review", "amended_or_repealed"], null), date: str(x?.date, 30), status: pick(x?.status, ["done", "current", "next"], "next") })).filter(x => x.stage),
        obligations: arr(f.obligations, 4).map(x => ({ who: str(x?.who, 50), what: s(x?.what, 120), from: str(x?.from, 30) })).filter(x => x.who && x.what),
        applies_to_india: pick(f.applies_to_india, ["yes", "no", "partly"], "partly") }; }
    case "decoder": { const h = f.headline || {}; const v = numOrNull(h.value), p = numOrNull(h.previous);
      return { kind: pick(f.kind, ["release", "decision"], "release"),
        headline: str(h.label) ? { label: str(h.label, 60), value: inReports(v, nums) ? v : null, unit: str(h.unit, 20), period: str(h.period, 30), previous: inReports(p, nums) ? p : null, previousLabel: str(h.previousLabel, 30), from: str(h.from, 40) } : null,
        comparisons: arr(f.comparisons, 3).map(x => ({ label: str(x?.label, 50), value: numOrNull(x?.value), unit: str(x?.unit, 20), from: str(x?.from, 40) })).filter(x => x.label && x.value !== null && inReports(x.value, nums)),
        drivers: arr(f.drivers, 4).map(x => ({ name: s(x?.name, 50), direction: pick(x?.direction, ["up", "down", "mixed"], "mixed") })).filter(x => x.name),
        decision: f.decision ? { action: pick(f.decision.action, ["hike", "cut", "hold", "other"], "other"), size: str(f.decision.size, 30), stance: s(f.decision.stance, 120) } : null }; }
    case "pass_through": { const rungs = arr(f.rungs, 5).map(x => ({ stage: s(x?.stage, 60), pass: pick(x?.pass, ["likely", "partial", "blocked", "unclear"], "unclear"), damper: s(x?.damper, 100), lag: pick(x?.lag, ["days", "weeks", "months"], "weeks") })).filter(x => x.stage);
      return rungs.length ? { driver: { variable: str(f.driver?.variable, 50), direction: pick(f.driver?.direction, ["up", "down"], "up"), size: str(f.driver?.size, 30) }, product: str(f.product, 30), rungs,
        end_user: f.end_user ? { group: pick(f.end_user.group, GROUPS, ""), effect: s(f.end_user.effect, 160) } : null } : null; }
    case "winners_losers": { const groups = arr(f.groups, 6).map(x => ({ group: pick(x?.group, GROUPS, str(x?.group, 40)), direction: pick(x?.direction, ["gain", "lose", "mixed", "unclear"], "unclear"), directness: pick(x?.directness, ["direct", "indirect"], "indirect"), mechanism: s(x?.mechanism, 140) })).filter(x => x.group && x.mechanism);
      return groups.length ? { groups, not_affected: s(f.not_affected, 140) } : null; }
    case "conflicting": { const accounts = arr(f.accounts, 6).map(x => ({ outlet: str(x?.outlet, 40), value: str(String(x?.value ?? ""), 80), origin: str(x?.origin, 80), time: str(x?.time, 40) })).filter(x => x.outlet && x.value);
      return accounts.length >= 2 ? { disputed: { item: str(f.disputed?.item, 80), unit: str(f.disputed?.unit, 20) }, accounts, agreed: arr(f.agreed, 4).map(x => s(x, 140)).filter(Boolean),
        explanations: arr(f.explanations, 3).map(x => ({ type: str(x?.type, 30), note: s(x?.note, 120) })).filter(x => x.type), status: pick(f.status, ["unresolved", "converging", "resolved"], "unresolved") } : null; }
    case "timeline": { const entries = arr(f.entries, 6).map(x => ({ when: str(x?.when, 30), what: s(x?.what, 140), actor: str(x?.actor, 50), outlet: str(x?.outlet, 40), type: pick(x?.type, ["action", "claim", "denial", "confirmation"], "action"), verification: pick(x?.verification, ["confirmed", "claimed", "contested"], "claimed") })).filter(x => x.what);
      return entries.length ? { entries, current_status: s(f.current_status, 160), open_questions: arr(f.open_questions, 3).map(x => s(x, 120)).filter(Boolean) } : null; }
    case "escalation": { const r = Math.round(+f.current_rung); if (!(r >= 1 && r <= 7)) return null; const pr = Math.round(+f.previous_rung);
      return { current_rung: r, evidence: s(f.evidence, 160), previous_rung: pr >= 1 && pr <= 7 ? pr : null,
        next_signals: arr(f.next_signals, 3).map(x => ({ rung: Math.round(+x?.rung), signal: s(x?.signal, 120) })).filter(x => x.rung >= 1 && x.rung <= 7 && x.signal),
        india_channels: arr(f.india_channels, 6).map(x => str(x, 30)).filter(Boolean) }; }
    case "scenarios": { const sc = arr(f.scenarios, 3).map(x => ({ name: s(x?.name, 40), what: s(x?.what, 160), signal: s(x?.signal, 120), india_effect: s(x?.india_effect, 120) })).filter(x => x.name && x.what);
      return sc.length >= 2 ? { question: s(f.question, 120), scenarios: sc } : null; }
  }
  return null;
}
function cleanAnalysis(r, plan, reportText) {
  const nums = numbersIn(reportText);
  const s = (x, n) => noAdvice(str(x, n)) ? str(x, n) : "";
  const a = { v: ANALYSIS_V, at: new Date().toISOString(), tier: plan.tier, primary: plan.primary, complement: plan.complement || null, features: plan.features,
    exposure: r.exposure ? { level: pick(r.exposure.level, ["high", "medium", "low"], "medium"), reason: s(r.exposure.reason, 140) } : null,
    horizon: r.horizon ? { value: pick(r.horizon.value, ["now", "weeks", "months", "years"], "weeks"), reason: s(r.horizon.reason, 100) } : null,
    confidence: r.confidence ? { level: pick(r.confidence.level, ["high", "medium", "low"], "medium"), reason: s(r.confidence.reason, 120) } : null,
    affected: arr(r.affected, 4).map(x => ({ group: pick(x?.group, GROUPS, ""), direction: pick(x?.direction, ["up", "down", "mixed", "unclear"], "unclear"), what: s(x?.what, 60), basis: pick(x?.basis, ["reported", "inferred"], "inferred") })).filter(x => x.group),
    watch: arr(r.watch, 3).map(x => ({ what: s(x?.what, 140), when: str(x?.when, 40), where: str(x?.where, 60) })).filter(x => x.what),
    frameworks: {} };
  for (const k of [plan.primary, plan.complement].filter(Boolean)) { const f = cleanFramework(k, r[k], nums); if (f) a.frameworks[k] = f; }
  if (!a.frameworks[plan.primary]) a.frameworksMissing = true;
  return a;
}
function reportsForPrompt(reports) {
  return reports.slice(-8).map(r => ({ outlet: OUTLETS[r.source] || r.source, date: (r.date || "").slice(0, 16), kind: r.kind || "", headline: r.headline, summary: r.summary || "", ...(r.lede ? { opening: r.lede } : {}) }));
}
const reportTextOf = reports => reports.map(r => [r.headline, r.summary, r.lede].filter(Boolean).join(" ")).join(" ");

// Plan and analyse a list of stories: [{ i, kind, reports, relevance, prev }] → Map(i → { r, plan })
async function analyseStories(list, mode) {
  const feats = new Map();
  for (let k = 0; k < list.length; k += FEATURE_BATCH) {
    const chunk = list.slice(k, k + FEATURE_BATCH);
    const res = await callClaude(featurePrompt(chunk.map(x => ({ id: x.i, reports: reportsForPrompt(x.reports).map(({ outlet, date, headline, summary }) => ({ outlet, date, headline, summary })) }))), "filter");
    for (const f of res || []) if (f && Number.isInteger(+f.id)) feats.set(+f.id, Object.fromEntries(FEATURE_KEYS.map(key => [key, f[key] === true])));
  }
  const planned = list.map(x => {
    const f = feats.get(x.i) || {};
    const tier = tierOf({ reports: x.reports, relevance: x.relevance });
    // Sticky primary: once a story has reached Standard, keep its lens unless it is a conflict of accounts.
    const primary = (x.prev?.primary && x.prev.tier !== "quick" && !f.conflict) ? x.prev.primary : pickPrimary(f);
    const complement = tier === "deep" ? pickComplement(primary, f) : null;
    return { ...x, primary, complement, tier, features: Object.keys(f).filter(k => f[k]) };
  });
  const out = new Map();
  for (let k = 0; k < planned.length; k += ANALYSIS_CHUNK) {
    const chunk = planned.slice(k, k + ANALYSIS_CHUNK);
    const res = await callClaude(analysisPrompt(chunk.map(x => ({ i: x.i, kind: x.kind, tier: x.tier, primary: x.primary, complement: x.complement, reports: reportsForPrompt(x.reports) })), mode), "analysis");
    for (const r of res || []) { const x = chunk.find(c => c.i === +r?.id); if (x) out.set(x.i, { r, plan: x }); }
  }
  return out;
}
function applyAnalysis(ev, r, plan) {
  ev.analysis = cleanAnalysis(r, plan, reportTextOf(ev.reports || []));
  if (noAdvice(r.why) && str(r.why)) ev.why = str(r.why, 300);
  const imp = arr(r.implications, 3).filter(x => typeof x === "string" && noAdvice(x)); if (imp.length) ev.implications = imp;
}
// Existing stories: analyse those with no current analysis, or whose depth tier has risen since. Newest first.
async function reframeRecent(data, mode) {
  const kindOfEv = ev => (ev.reports || [])[0]?.kind || "hard";
  const eligible = ev => !["soft", "feature", "opinion"].includes(kindOfEv(ev));
  const stale = ev => ev.analysis?.v !== ANALYSIS_V || TIER_RANK[tierOf(ev)] > TIER_RANK[ev.analysis.tier];
  const all = data.sectors.flatMap(sec => sec.items).filter(ev => eligible(ev) && stale(ev)).sort((a, b) => latest(b).localeCompare(latest(a)));
  const due = all.slice(0, REFRAME_LIMIT);
  let done = 0, failed = 0;
  for (let k = 0; k < due.length; k += ANALYSIS_CHUNK * 2) {
    const chunk = due.slice(k, k + ANALYSIS_CHUNK * 2);
    try {
      const res = await analyseStories(chunk.map((ev, i) => ({ i, kind: kindOfEv(ev), reports: ev.reports || [], relevance: ev.relevance, prev: ev.analysis })), mode);
      chunk.forEach((ev, i) => { const o = res.get(i); if (!o || o.r.relevant === false) return; applyAnalysis(ev, o.r, o.plan); done++; });
    } catch (e) { console.error(`Framework batch failed: ${e.message}`); failed++; }
  }
  return { done, waiting: Math.max(0, all.length - done), failedBatches: failed };
}

// ---------- Statistics layer: official figures behind the story, each one checked against its source ----------
// Sonnet searches ONLY official domains and then fetches the official page that holds the figures. The fetched
// page text comes back to us, so code can check every figure against it. A figure is kept only if the same number
// appears on an official page fetched (or quoted by a citation) in this answer; short numbers must also sit near
// their year. A series needs at least 3 checked figures to be shown.
const STATS_V = 2;              // v2: verify against fetched page text, not only the short citation snippets
const STATS_LIMIT = 6;          // stories per desk per run that get a statistics search
const STATS_MIN_POINTS = 3;
const OFFICIAL_DOMAINS = [
  // India
  "rbi.org.in", "mospi.gov.in", "commerce.gov.in", "dgciskol.gov.in", "ppac.gov.in", "pib.gov.in", "data.gov.in", "mea.gov.in",
  "dgca.gov.in", "cea.nic.in", "agriwelfare.gov.in", "imd.gov.in", "indiabudget.gov.in", "eaindustry.nic.in", "tradestat.commerce.gov.in",
  // United States
  "eia.gov", "fred.stlouisfed.org", "federalreserve.gov", "bls.gov", "census.gov", "bea.gov", "usda.gov", "treasury.gov",
  // International organisations
  "worldbank.org", "imf.org", "wto.org", "unctad.org", "comtradeplus.un.org", "un.org", "fao.org", "oecd.org", "adb.org", "bis.org",
  "opec.org", "iea.org", "ilo.org", "wmo.int", "unhcr.org",
  // Europe, UK and others
  "ec.europa.eu", "europa.eu", "ecb.europa.eu", "ons.gov.uk", "bankofengland.co.uk", "abs.gov.au", "stats.gov.cn", "boj.or.jp"
];
function domainOf(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } }
function isOfficial(u) { const h = domainOf(u); return !!h && OFFICIAL_DOMAINS.some(d => h === d || h.endsWith("." + d)); }

function statsPrompt(ev, mode) {
  const reps = (ev.reports || []).slice(-4).map(r => `- ${OUTLETS[r.source] || r.source}: ${r.headline}${r.summary ? " — " + r.summary : ""}`).join("\n");
  return `You are the statistics desk of a news product that explains ${mode === "domestic" ? "developments inside India" : "how world news affects India"}.

STORY
Headline: ${ev.headline}
Bottom line: ${ev.why || ""}
Reports:
${reps}

TASK
Find one or two OFFICIAL statistical series that directly measure what this story is about, so a reader can see the history behind it. Good examples: "US imports of crude oil from Russia, by year" for a story about the US resuming Russian oil purchases; "India's crude imports, by month" for a Gulf supply story; "RBI repo rate at each policy meeting" for a rate decision; "India's exports of steel to the EU, by year" for a carbon-border-tax story.
Prefer yearly values from 2019 to the latest year, or the latest 8 to 12 monthly or quarterly values. Use only government statistics agencies, central banks, ministries and international organisations.

HOW
1. Search for the series.
2. FETCH the official page that shows the table or figures (an HTML page is best; skip PDFs and spreadsheets if an HTML page exists).
3. Copy every number exactly as it is written on the fetched page. Each figure is checked automatically against that page, and figures not found there are thrown away.
4. Every figure in one series must be the same measure in the same unit (never mix barrels per day with million barrels per day, or a total with a share). Prefer a data table over figures scattered through an article.

ANSWER FORMAT (nothing else, one item per line):
SERIES|<short title, ≤10 words>|<unit, e.g. thousand barrels per day, % , US$ billion>|<publisher, e.g. U.S. Energy Information Administration>
SOURCE|<URL of the fetched page the numbers are on>
POINT|<period, e.g. 2021 or Mar 2026>|<the number exactly as written on the page>
WHY|<one sentence without numbers on how this series relates to the story>
Repeat the block for a second series if useful. Never estimate, convert, round or calculate. If no official series fits this story (for example a protest or a court case with no measurable series), answer only: NONE`;
}

async function callStats(prompt) {
  let lastErr;
  for (const model of MODELS.stats) {
    const messages = [{ role: "user", content: prompt }]; const out = []; let res, body;
    // A long search turn can come back as "pause_turn"; send it back so the model can finish (at most twice).
    for (let turn = 0; turn < 3; turn++) {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 3000, messages, tools: [
          { type: "web_search_20250305", name: "web_search", max_uses: 4, allowed_domains: OFFICIAL_DOMAINS },
          { type: "web_fetch_20250910", name: "web_fetch", max_uses: 3, allowed_domains: OFFICIAL_DOMAINS, max_content_tokens: 15000 }
        ] })
      });
      body = await res.json().catch(() => ({}));
      if (!res.ok) break;
      const u = usage.stats ||= { model, calls: 0, inputTokens: 0, outputTokens: 0, searches: 0, fetches: 0 };
      u.model = model; u.calls++; u.inputTokens += body.usage?.input_tokens || 0; u.outputTokens += body.usage?.output_tokens || 0;
      u.searches += body.usage?.server_tool_use?.web_search_requests || 0;
      u.fetches = (u.fetches || 0) + (body.usage?.server_tool_use?.web_fetch_requests || 0);
      out.push(...(body.content || []));
      if (body.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: body.content });
    }
    if (res.ok) return out;
    lastErr = new Error(`Claude API ${res.status} (${model}, stats): ${body?.error?.message || "unknown error"}`);
    if (!(res.status === 404 || (res.status === 400 && /model/i.test(body?.error?.message || "")))) break;
  }
  throw lastErr;
}

// Turn the answer into lines, each carrying the citations of the text it came from.
function linesWithCitations(content) {
  const lines = []; let cur = { text: "", cites: [] };
  for (const b of content) {
    if (b.type !== "text") continue;
    const parts = String(b.text || "").split("\n");
    parts.forEach((p, idx) => {
      if (idx > 0) { lines.push(cur); cur = { text: "", cites: [] }; }
      cur.text += p;
      if (p.trim()) for (const c of b.citations || []) if (c.url && c.cited_text) cur.cites.push(c);
    });
  }
  lines.push(cur);
  return lines.map(l => ({ text: l.text.trim(), cites: l.cites })).filter(l => l.text);
}
// Official pages fetched during the answer, with their full text.
function fetchedPages(content) {
  const pages = [];
  for (const b of content) {
    if (b.type !== "web_fetch_tool_result" || b.content?.type !== "web_fetch_result") continue;
    const url = b.content.url, doc = b.content.content;
    if (isOfficial(url) && doc?.source?.type === "text" && doc.source.data) pages.push({ url, title: doc.title || domainOf(url), text: String(doc.source.data) });
  }
  return pages;
}
// A number as a pattern: thousands separators optional (1,234 / 1234 / 1,23,456), no other digits around it.
function numberPattern(s) {
  const m = /-?\d[\d,]*(\.\d+)?/.exec(String(s)); if (!m) return null;
  const [int, dec = ""] = m[0].replace(/,/g, "").split(".");
  const intPat = int.replace(/^-/, "").split("").join(",?");
  return { value: +m[0].replace(/,/g, ""), digits: int.replace(/^-/, "").length + dec.length,
    re: new RegExp("(^|[^\\d.,])-?" + intPat + (dec ? "\\." + dec : "") + "(?![\\d]|[.,]\\d)", "g") };
}
const MONTHS = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/i;
// Short numbers (one or two digits) are easy to find by chance, so they must also sit near their year or month.
function foundIn(text, pat, period) {
  pat.re.lastIndex = 0; let m;
  const year = (/(19|20)\d{2}/.exec(period) || [])[0], mon = (MONTHS.exec(period) || [])[1];
  while ((m = pat.re.exec(text))) {
    if (pat.digits >= 3) return true;
    const near = text.slice(Math.max(0, m.index - 2000), m.index + 300).toLowerCase();
    if ((!year || near.includes(year)) && (!mon || near.includes(mon.toLowerCase())) && (year || mon)) return true;
  }
  return false;
}
function parseStats(content) {
  const pages = fetchedPages(content);
  const series = []; let s = null;
  const diag = { said: "nothing", proposed: 0, kept: 0, notFound: 0, pagesFetched: pages.length };
  for (const { text, cites } of linesWithCitations(content)) {
    const f = text.split("|").map(x => x.trim());
    if (/^NONE\b/.test(text) && !series.length) { diag.said = "none"; continue; }
    if (f[0] === "SERIES" && f[1]) { diag.said = "series"; s = { title: str(f[1], 90), unit: str(f[2] || "", 40), publisher: str(f[3] || "", 80), why: "", source: "", points: [], dropped: 0 }; series.push(s); continue; }
    if (f[0] === "SOURCE" && s) { s.source = f.slice(1).join("|"); continue; }
    if (f[0] === "WHY" && s) { const w = f.slice(1).join(" "); if (noAdvice(w) && !/\d{2,}/.test(w)) s.why = str(w, 200); continue; }
    if (f[0] === "POINT" && s && f[1] && f[2]) {
      diag.proposed++;
      if (!/\d/.test(f[1])) { s.dropped++; diag.notFound++; continue; }   // a period must name a year, month-year or quarter
      const pat = numberPattern(f[2]); if (!pat) { s.dropped++; diag.notFound++; continue; }
      // 1) the fetched page the model named; 2) any other official page it fetched; 3) an official citation quoting the number
      const ordered = [...pages.filter(p => p.url === s.source), ...pages.filter(p => p.url !== s.source)];
      let hit = ordered.find(p => foundIn(p.text, pat, f[1]));
      if (!hit) { const c = cites.find(c => isOfficial(c.url) && foundIn(c.cited_text, pat, f[1])); if (c) hit = { url: c.url, title: c.title || domainOf(c.url) }; }
      if (!hit) { s.dropped++; diag.notFound++; continue; }
      diag.kept++;
      s.points.push({ period: str(f[1], 20), value: pat.value, url: hit.url, source: str(hit.title || domainOf(hit.url), 120) });
    }
  }
  // Every figure can be on the page and the series still be wrong if it mixes units (e.g. 50,000 barrels a day next to
  // 1.7 million). Values more than 100 times apart within one series are treated as mixed units and the series is dropped.
  const sameUnits = x => { const v = x.points.map(p => Math.abs(p.value)).filter(Boolean); return v.length < 2 || Math.max(...v) / Math.min(...v) <= 100; };
  let mixed = 0;
  const kept = series.map(x => ({ ...x, points: x.points.slice(0, 16) })).filter(x => x.points.length >= STATS_MIN_POINTS)
    .filter(x => sameUnits(x) || (mixed++, false)).slice(0, 2)
    .map(({ source, ...x }) => { const doms = {}; x.points.forEach(p => { const d = domainOf(p.url); doms[d] = (doms[d] || 0) + 1; });
      return { ...x, sources: [...new Map(x.points.map(p => [p.url, { url: p.url, title: p.source, domain: domainOf(p.url) }])).values()].slice(0, 4), domains: Object.keys(doms) }; });
  if (diag.said === "series" && !kept.length) diag.said = mixed ? "units did not match" : diag.kept ? "too few checked figures" : "no figure found on an official page";
  return { series: kept, diag };
}
// In-depth stories (and standard stories with high exposure) get one statistics search, newest first. Results are kept.
async function addStatistics(data, mode) {
  const want = ev => ev.analysis?.v === 2 && (ev.analysis.tier === "deep" || (ev.analysis.tier === "standard" && ev.analysis.exposure?.level === "high"));
  const due = data.sectors.flatMap(sec => sec.items).filter(ev => want(ev) && ev.stats?.v !== STATS_V)
    .sort((a, b) => latest(b).localeCompare(latest(a))).slice(0, STATS_LIMIT);
  let found = 0, none = 0, failed = 0, droppedPoints = 0, proposed = 0, pagesFetched = 0; const samples = [];
  for (const ev of due) {
    if (failed >= 2 && !found && !none) break;   // search unavailable (e.g. disabled for the organisation): stop, retry next run
    try {
      const { series, diag } = parseStats(await callStats(statsPrompt(ev, mode)));
      ev.stats = { v: STATS_V, at: new Date().toISOString(), series };
      if (series.length) found++; else none++;
      droppedPoints += diag.notFound; proposed += diag.proposed; pagesFetched += diag.pagesFetched;
      samples.push({ headline: str(ev.headline, 80), result: series.length ? "chart" : diag.said, proposed: diag.proposed, checked: diag.kept, pagesFetched: diag.pagesFetched });
    } catch (e) { console.error(`Statistics for "${ev.headline}" failed: ${e.message}`); failed++; }
  }
  return { searched: due.length, found, none, failed, proposed, droppedPoints, pagesFetched, samples };
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
      body: JSON.stringify({ model, max_tokens: job === "analysis" ? 8000 : 4000, messages: [{ role: "user", content: prompt }] })
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
    // Layer 1 routing: opinion stays out; soft news and features are kept as context without analysis.
    const kindOf = v => KINDS.includes(v.kind) ? v.kind : "hard";
    for (const v of byId.values()) if (v.relevant && kindOf(v) === "opinion") { v.relevant = false; v.reason = "Opinion piece: kept out of the analysis"; }
    const needsAnalysis = v => !["soft", "feature"].includes(kindOf(v));
    const toAnalyse = [...byId.entries()].filter(([i, v]) => v.relevant && !isFollowUp(i, v) && needsAnalysis(v))
      .map(([i, v]) => ({ i, kind: kindOf(v), relevance: "medium", reports: [{ source: batch[i].src, headline: batch[i].headline, summary: batch[i].summary, lede: batch[i].lede, date: batch[i].date, kind: kindOf(v) }] }));
    const analysis = new Map();
    if (toAnalyse.length) {
      try { for (const [id, o] of await analyseStories(toAnalyse, desk.mode)) analysis.set(id, o); }
      catch (e) { console.error(`Analysis batch failed: ${e.message}`); failures++; continue; } // whole batch retried next run
    }
    const reject = (s, reason, kind) => rejected.unshift({ source: s.src, headline: s.headline, url: s.url, date: s.date, ...(kind ? { kind } : {}),
      reason: typeof reason === "string" ? reason.slice(0, 160) : "", checkedAt: new Date().toISOString() });
    const placed = {}, dropped = new Set();                 // batch index -> event it went into / items rejected at step 2
    for (let i = 0; i < batch.length; i++) {
      const s = batch[i], v = byId.get(i);
      if (!v) continue;
      if (!v.relevant) { reject(s, v.reason, KINDS.includes(v.kind) ? v.kind : undefined); continue; }
      const report = { source: s.src, headline: s.headline, url: s.url, date: s.date, kind: kindOf(v), ...(s.summary && s.summary.length >= 40 ? { summary: s.summary, summaryV: SUMMARY_V } : {}), ...(s.lede ? { lede: s.lede } : {}), ...(s.image ? { image: s.image } : {}), ...(s.imageLarge ? { imageLarge: s.imageLarge } : {}) };
      if (isFollowUp(i, v)) {
        const k = v.sameAs.startsWith("item:") ? +v.sameAs.slice(5) : null;
        const target = k === null ? findEvent(v.sameAs) : placed[k];
        if (!target) { if (k !== null && dropped.has(k)) { reject(s, "Same story as an item the analysis desk set aside"); dropped.add(i); } continue; }
        if (!target.reports.some(x => x.url === s.url)) target.reports.push(report);
        if (!target.image && s.image) { target.image = s.image; if (s.imageLarge) target.imageLarge = s.imageLarge; }
        placed[i] = target; merged++;
        continue;
      }
      const o = needsAnalysis(v) ? analysis.get(i) : null;
      const r = needsAnalysis(v) ? o?.r : { relevant: true, sector: v.sector, relevance: "medium", why: "", implications: [] };  // context only
      if (!r) continue;
      if (r.relevant === false) { reject(s, r.reason, kindOf(v)); dropped.add(i); continue; }
      const sector = data.sectors.find(x => x.id === r.sector) || data.sectors.find(x => x.id === v.sector);
      if (!sector) continue;
      const ev = {
        id: idFor(s.url), headline: s.headline, url: s.url, source: s.src, date: s.date,
        relevance: r.relevance === "high" ? "high" : "medium",
        ...(s.image ? { image: s.image } : {}), ...(s.imageLarge ? { imageLarge: s.imageLarge } : {}),
        why: typeof r.why === "string" && noAdvice(r.why) ? r.why : "",
        implications: (r.implications || []).filter(x => typeof x === "string" && noAdvice(x)).slice(0, 3),
        ...(o ? { analysis: cleanAnalysis(r, o.plan, reportTextOf([report])) } : {}),
        reports: [report]
      };
      sector.items.push(ev); placed[i] = ev; added++;
    }
    batch.forEach(s => seen.add(s.url));
  }

  const kinds = await classifyOlder(data);
  const frames = await reframeRecent(data, desk.mode);
  const stats = await addStatistics(data, desk.mode);
  if (stats.searched) console.log(`Statistics: ${stats.searched} stories searched, ${stats.found} with charts, ${stats.none} without, ${stats.failed} failed; ${stats.proposed} figures proposed, ${stats.droppedPoints} not found on an official page, ${stats.pagesFetched} official pages fetched`);
  for (const x of stats.samples || []) console.log(`  · ${x.result}: ${x.headline} (${x.checked}/${x.proposed} figures checked, ${x.pagesFetched} pages)`);
  if (frames.done || frames.failedBatches) console.log(`Framework analysis: ${frames.done} existing stories re-analysed, ${frames.waiting} still waiting`);
  if (kinds.labelled || kinds.waiting) console.log(`Report kinds: ${kinds.labelled} older reports labelled, ${kinds.waiting} waiting`);
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
  data.lastRun = { analysed: fresh.length, added, merged, rejected: fresh.length && !failures ? fresh.length - added - merged : undefined, failedBatches: failures, feeds: feedHealth, shareImages: og, threads: th, summaries: sm, kinds, frames, stats, models: usage };

  await fs.writeFile(desk.data, JSON.stringify(data, null, 2) + "\n");
  await fs.writeFile(desk.seen, JSON.stringify([...seen].slice(-MAX_SEEN)) + "\n");
  await fs.writeFile(desk.rejected, JSON.stringify(rejected.slice(0, MAX_REJECTED), null, 2) + "\n");
  console.log(`Added ${added} new events, merged ${merged} reports into existing events. Failed batches: ${failures}.`);
  return { added, merged, failures, analysed: fresh.length };
}
function latest(e) { return (e.reports || []).map(r => r.date || "").sort().pop() || e.date || ""; }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => { console.error(e); process.exit(1); });
