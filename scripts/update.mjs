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
  stats:    [process.env.STATS_MODEL    || "claude-sonnet-5-5", "claude-opus-5-5"],    // official statistics via web search
  analysis_quick: [process.env.QUICK_MODEL || "claude-sonnet-5-5", "claude-haiku-5-5"] // short "quick read" analyses: half Opus's price
};

// ---------- Spending control ----------
// Every API reply reports its own token use; the engine prices it and keeps a running total per day (India time) in
// data/budget.json. Work is cut in priority order as the day's spend rises: new stories may use the whole budget,
// statistics up to 90%, catch-up work (re-analysing older stories, labelling, storyline summaries) up to 60%.
const DAILY_BUDGET = +(process.env.DAILY_BUDGET_USD || 6);
const BUDGET_FILE = "data/budget.json";
const BUDGET_SHARE = { core: 1.0, stats: 0.9, extra: 0.6 };
const PRICES = { "claude-opus-5-5": [4, 20], "claude-sonnet-5-5": [2, 10], "claude-haiku-5-5": [0.10, 0.50], "claude-haiku-5-5@long": [0.50, 2.50] }; // US$ per million tokens: input, output
const SEARCH_PRICE = 0.01;      // US$ per web search
const EST = { filter: 0.02, analysis: 0.15, analysis_quick: 0.06, threads: 0.03, stats: 0.30, calendar: 0.60 };   // most one request is likely to cost
class BudgetError extends Error { constructor(level) { super(`daily budget reached for ${level} work`); this.level = level; } }
let budget = null;
const indiaDay = () => new Date(Date.now() + 5.5 * 36e5).toISOString().slice(0, 10);
async function loadBudget() {
  const b = await readJson(BUDGET_FILE, {}), day = indiaDay();
  budget = b.day === day ? b : { day, spent: 0, runs: 0, byJob: {}, history: [...(b.day ? [{ day: b.day, spent: b.spent, runs: b.runs, byJob: b.byJob }] : []), ...(b.history || [])].slice(0, 30) };
  budget.cap = DAILY_BUDGET; budget.runs = (budget.runs || 0) + 1; budget.byJob ||= {};
}
async function saveBudget() { budget.spent = Math.round(budget.spent * 1e4) / 1e4; for (const k in budget.byJob) budget.byJob[k] = Math.round(budget.byJob[k] * 1e4) / 1e4; budget.updatedAt = new Date().toISOString(); await fs.writeFile(BUDGET_FILE, JSON.stringify(budget, null, 1) + "\n"); }
function costOf(model, inTok, outTok, searches = 0) {
  const p = (/haiku/.test(model) && inTok > 100000 ? PRICES[model + "@long"] : PRICES[model]) || [4, 20];   // unknown model: priced as Opus
  return inTok / 1e6 * p[0] + outTok / 1e6 * p[1] + searches * SEARCH_PRICE;
}
function charge(job, model, u = {}) {
  const c = costOf(model, (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0) * 0.1, u.output_tokens || 0, u.server_tool_use?.web_search_requests || 0);
  if (budget) { budget.spent += c; budget.byJob[job] = (budget.byJob[job] || 0) + c; }
  if (usage[job]) usage[job].cost = Math.round(((usage[job].cost || 0) + c) * 1e4) / 1e4;
  return c;
}
const budgetLeft = level => budget ? DAILY_BUDGET * BUDGET_SHARE[level] - budget.spent : Infinity;
function needBudget(level, est = 0) { if (budgetLeft(level) < est) throw new BudgetError(level); }
let usage = {};   // job -> { model, calls, inputTokens, outputTokens }
const SECTORS = [
  { id: "energy",        name: "Energy" },
  { id: "logistics",     name: "Logistics & Shipping" },
  { id: "economy",       name: "Economy & Trade" },
  { id: "finance",       name: "Finance" },        // added 23 Oct: banks, rates, savings, insurance, markets, the rupee
  { id: "technology",    name: "Technology" },
  { id: "manufacturing", name: "Manufacturing" },
  { id: "environment",   name: "Environment & Climate" },
  { id: "agriculture",   name: "Agriculture & Food" },
  { id: "governance",    name: "Policy & Governance" }
];
// What separates the two money sectors, given to the models (the site shows only the names).
const SECTOR_HINTS = {
  economy: "growth, inflation and jobs data, trade, tariffs, budgets and taxes",
  finance: "banks and lenders, central-bank interest-rate and liquidity decisions, loans and deposits, insurance, pensions, mutual funds, share and bond markets, the rupee and other currencies"
};
const sectorList = () => SECTORS.map(s => `- ${s.id}: ${s.name}${SECTOR_HINTS[s.id] ? ` (${SECTOR_HINTS[s.id]})` : ""}`).join("\n");
const MAX_REJECTED = 150;                      // audit trail of what the filter discarded, per desk
const BATCH = 25;              // headlines per filter request (kept new stories from a batch go to one analysis request)
const MAX_NEW_PER_RUN = { global: 300, domestic: 150 };   // the rest wait for the next run
const MATCH_WINDOW_DAYS = 4;   // how far back to look for the same event
const FRESH_HOURS = 24;        // headlines older than this are skipped, never analysed (no catch-up after a pause)
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
// Returns the rule that matched (counted on lastRun.skipped), or "" to keep the item.
// 23 Oct: The Long Read now goes to the filter like any other feature; market-wide moves (Sensex, Nifty, sector shares,
// results) go to the filter too, which keeps them only with a named cause. Tips, targets, GMP and live wraps stay out.
export function skipReason(title, link) {
  if (/^(watch|listen|video)\s*:/i.test(title)) return "video_audio";
  if (/– as it happened$|- as it happened$|[–-] live$/i.test(title)) return "live_blog";
  // newsletters, briefings, podcasts and round-ups summarise other reports rather than reporting news
  if (/^((monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|evening|weekend|first edition|business today)\b[^:]{0,20})?\s*briefing\s*:/i.test(title)) return "briefing_newsletter";
  if (/^(first edition|today in focus|business live|newsletter)\b/i.test(title) || /\/series\/|\/info\/|\/newsletters?\//.test(link)) return "briefing_newsletter";
  if (/\b(podcast|quiz|in (\d+ )?(photos|pictures))\b/i.test(title)) return "podcast_quiz_gallery";
  // stock tips and tickers: one share's price, buy/sell calls, targets, grey-market IPO premiums, live market wraps
  if (/\b(share price|stocks? to (buy|watch)|buy or sell|target price|stock market today|ipo (gmp|allotment|subscription))\b/i.test(title)) return "stock_tips_tickers";
  if (/\/market\/live-blog\/|\/live\/|\/liveblog\//.test(link)) return "live_blog";
  if (/\/astrology\/|\/horoscope/.test(link)) return "section";
  if (/\/sport\/|\/sports\/|\/videos?\/|\/program\/|\/gallery\/|\/podcasts?\/|\/opinions?\/|\/commentisfree\/|\/audio\/|\/football\/|\/lifeandstyle\/|\/culture\/|\/tv-and-radio\/|\/music\/|\/film\/|\/books\//.test(link)) return "section";
  return "";
}
let skippedItems = [];   // this desk run: { reason, headline, date } for items dropped by skipReason
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
      headers: { "user-agent": "Mozilla/5.0 (compatible; TheConnectBot/1.0)", accept: "text/html" } });
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
    catch (err) { if (err instanceof BudgetError) break; console.error(`Thread batch failed: ${err.message}`); failed++; continue; }
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
      const res = await callClaude(summaryPrompt(t, items, desk.mode), "threads", "extra");
      const text = res && res[0] && typeof res[0].summary === "string" ? res[0].summary.trim() : "";
      if (text) { t.summary = text.slice(0, 900); t.summaryCount = evs.length; t.summaryAt = new Date().toISOString(); written++; }
    } catch (err) { if (err instanceof BudgetError) break; console.error(`Summary for "${t.name}" failed: ${err.message}`); }
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
    if (!title || !link) continue;
    const why = skipReason(title, link);
    if (why) { skippedItems.push({ reason: why, headline: title, url: link, date: isNaN(pub) ? null : new Date(pub).toISOString() }); continue; }
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

const MARKET_RULE = {
  global: `Markets: a move in a whole share market, a sector's shares or government bond yields is relevant when the item names a cause beyond the market itself (for example a global sell-off as US yields rise, or chip stocks falling after new US export curbs) and the move plausibly reaches ${REGION}. A move in one company's shares, stock tips, buy or sell calls, price targets, IPO grey-market premiums, and market wraps that list moves without a cause are NOT relevant.`,
  domestic: `Markets: a move in the whole Indian share market (Sensex, Nifty), a sector's shares, government bond yields or the rupee is relevant when the item names a cause beyond the market itself (for example foreign investors selling as US yields rise, or IT shares falling on weak US client spending). One company's share move, stock tips, buy or sell calls, price targets, IPO grey-market premiums, and market wraps that list moves without a cause are NOT relevant. A single company's results are relevant only when the item shows a whole sector's direction, such as hiring across IT services.`
};
// Relevance framework v1 (23 Oct 2026, claude/relevance-framework.html): a five-step test with four outcomes.
// analyse = full analysis; watch = short "Watching" item with a named trigger; brief = low but real, shown at the foot;
// reject = not shown. Built from seven AI platforms' answers; replaces the topic lists in RELEVANCE_RULES below.
const FILTER_RULES = {
  global: `You are the relevance filter of The Connect's Global desk. The Connect explains to ordinary people in India how developments in the rest of the world change what they pay, earn and save, their jobs, safety and travel, and the rules they live under. It never gives investment advice. For each item you see only the outlet, the headline and the publisher's summary.

Work through these steps in order.

1. WHAT HAPPENED. Name the development and its status:
- done: an action taken, a law passed, a ruling issued, data published, an event that occurred;
- in_process: an official proposal on its way to a decision (a bill introduced, rules drafted, a government "moves to");
- intention: a plan, platform, or "weighs", "eyes", "considers" by someone who can decide;
- statement: opinion, prediction, demand, analysis, or a claim by someone who cannot decide.
Statements are rejected. Commentary, explainers, question headlines, recaps and anniversaries are rejected.

2. CHANNEL. Finish the sentence "This reaches people or businesses in India because it changes ___". Pick exactly one channel; if none fits, reject.
- india_direct: a foreign government or body acts on India, Indian firms or a deal with India.
- trade_access: tariffs, sanctions, export controls, trade deals or standards that change what India buys or sells.
- prices_supply: world prices or supply of oil, gas, food, fertiliser, metals, freight or key inputs such as chips and medicine ingredients.
- money_capital: major central banks, the dollar, bond yields, banking shocks, capital flows, credit ratings.
- routes_security: war, piracy, blockades or airspace closures on India's trade, energy or travel routes; security in India's neighbourhood.
- indians_abroad: visas, migration rules, safety of Indians abroad, evacuations, remittances.
- health_travel: outbreaks that can cross borders; drug or food safety alerts.
- climate_weather: weather systems that steer India's monsoon (El Nino, La Nina); storms, droughts or disasters at India's suppliers or on its routes.
- tech_standards: AI and chip rules, platform rules, cyber attacks, approvals of aircraft or products Indians use.
- global_rules: WTO, UN, climate, tax, shipping or aviation rules India must follow.
- major_economies: growth, recession or a change of government in the US, China, the EU, the UK, Japan, the Gulf states or India's neighbours.
- business_shocks: a failure, grounding or sector-wide shift at global firms with a stated effect on supply, prices or jobs.

3. EVIDENCE. The headline or summary must state the development: what, who, how big, where. You may add only long-established facts, used in one step: India imports most of its oil, gas, edible oil and gold; Indians are among the largest groups of US student and work visa holders; millions of Indians work in the Gulf; Indian airlines fly Boeing and Airbus aircraft; Indian IT firms earn much of their revenue in the US and Europe; the US Federal Reserve's decisions move the rupee and foreign money in India. Never build a link that needs two guesses.

4. EFFECT on India if the item plays out:
- high: national prices, a household essential, a top Indian import or export, or the safety or travel of many Indians;
- medium: a whole sector, a large group, one bilateral relationship, or a rule Indian firms must follow;
- low: a small group, an indirect link, or a far-off date.
REACH: national, sector (a whole industry or several states), regional or local.

5. VERDICT.
- analyse: effect high or medium, status done or in_process, effect felt within about a year.
- watch: a real development whose effect is low or uncertain today, where one named, checkable event would make it medium or high within weeks or months. Write that event in grows_if, for example "WHO declares an emergency", "Fed raises rates", "ceasefire signed". Never "further developments".
- brief: a real development with a clear channel and low effect, no growth path, and sector or regional reach. Shown low on the site without analysis.
- reject: no channel, a statement, local reach with no growth path, or any of these: sport, celebrity, entertainment, lifestyle; another country's domestic politics, crime, services or prices with no channel; daily casualty or strike counts in a long war; single-company results, deals or share moves; stock tips and predictions; conference and event listings; long-range projections with no decision.

Hard rules:
- Wars and crises: analyse a new party joining, strikes on energy or shipping, new sanctions, or a ceasefire in force. Peace talks are watch. Daily strikes and casualty counts are reject.
- Foreign elections: analyse results or changes of government in major economies and neighbours. Watch a leading candidate's stated policy with an India channel. Reject campaigning, polls and disputes.
- Outbreaks abroad: watch a dangerous outbreak in a place connected to India; analyse when it spreads to other countries, the WHO acts, or travel rules change.
- One company: reject unless it is a failure, a grounding, or a sector-wide move with a stated effect.
- Markets: analyse a move in a whole share market, a sector's shares or bond yields when a cause beyond the market is named; reject one company's share move, stock tips, price targets, IPO grey-market premiums and market wraps with no cause.
- Unsure about size or timing: choose watch. Unsure about the channel: reject.`,
  domestic: `You are the relevance filter of The Connect's India desk. The Connect explains to ordinary people across India what developments inside India change for what they pay, earn and save, their jobs, safety and travel, and the rules they live under. It never gives investment advice. The items come from Indian outlets. For each item you see only the outlet, the headline and the publisher's summary.

Work through these steps in order.

1. WHAT HAPPENED. Name the development and its status:
- done: an action taken, a law passed or notified, a ruling issued, data published, an event that occurred;
- in_process: an official proposal on its way to a decision (a bill introduced, draft rules, a state "to frame" a policy);
- intention: a plan or promise by someone who can decide;
- statement: opinion, prediction, demand, an allegation with no official response, or a taunt.
Statements are rejected. Explainers, question headlines and event or conference listings are rejected.

2. CHANNEL. Finish the sentence "This changes something for people or businesses in India because it changes ___". Pick exactly one channel; if none fits, reject.
- prices_costs: what households pay: inflation, fuel and LPG, food prices, taxes on goods, subsidies.
- money_banking: RBI, banks, loans, deposits, insurance, pensions, payments, share and bond markets, the rupee.
- jobs_wages: employment and wage data, labour codes, hiring or layoffs across a sector.
- budgets_welfare: the Union budget, the GST Council, welfare schemes and entitlements.
- industry_trade: a whole industry: production schemes, sector sales or output, exports and imports.
- infrastructure_energy: power, water, rail, roads, ports, airports, telecom networks.
- farms_food: crops, sowing, MSP, procurement, food stocks, curbs on food exports or imports.
- health_safety: outbreaks, drug and food rules, disasters, public-safety failures at scale.
- weather_environment: weather alerts, cyclones, floods, heat and cold, air-pollution curbs.
- law_courts: national laws, regulators' rules, court rulings that set rules for many.
- politics_governance: who governs and what is decided: elections, governments, Parliament, the Election Commission, Centre-state disputes.
- security_foreign: borders, defence, terrorism, diplomacy and trade talks.
- digital_tech: UPI, Aadhaar, telecom and platform rules, cyber attacks, AI rules.

3. EVIDENCE. The item must state the development: what, who, how big, where. You may add only long-established facts, used in one step, for example that Delhi-NCR, Mumbai and Bengaluru carry a large share of the country's business, or that SBI and HDFC Bank are among India's largest banks. Never build a link that needs two guesses.

4. EFFECT and REACH.
- effect high: a household essential, or the rules, safety or money of millions;
- medium: a whole sector, a large city or region, or a large group;
- low: a small group or an indirect link.
- reach: national, sector, regional (one state or region) or local.

5. VERDICT.
- analyse: effect high or medium, status done or in_process, and national or sector reach, or regional reach allowed by the hard rules below.
- watch: a real development whose effect is low or uncertain today, where one named, checkable event would raise it, for example "red alert or flooding", "Centre or another state adopts it", "RBI acts", "bill passed". Write that event in grows_if.
- brief: a real development with a clear channel and low effect, no growth path, and sector or regional reach. Shown low on the site without analysis.
- reject: no channel, a statement, local reach only, or any of these: crime, accidents and individual court cases; celebrity, entertainment, sport; religion items that change no rule; single-company results, deals, IPO subscriptions and share moves; stock tips; event, expo and conference announcements.

Hard rules:
- State or city stories: analyse when a public system fails in a national business hub (Delhi-NCR, Mumbai, Bengaluru, Chennai, Hyderabad, Kolkata, a major port), or when a state that leads a sector acts in that sector. Watch a state's first-of-its-kind policy on a problem every state faces. Otherwise reject.
- One company: analyse a breach, outage, failure or regulator action at a systemically important firm (the largest banks, insurers, exchanges, telecom operators), or a move that resets a whole sector. Watch a review or probe at such a firm. Reject results and deals.
- Politics: analyse results, a government formed or fallen in any state or at the Centre, bills passed, ordinances and Election Commission decisions. Watch alliances breaking, confidence votes, and promises with a cost and a decision date. Reject speeches, taunts, demands and predictions. Judge every party by the same rules.
- Weather and pollution: reject routine forecasts in the normal season. Watch heavy-rain, heat or cyclone warnings and first-stage pollution curbs. Analyse floods, landfall, crop damage, deaths, power or transport cuts, heatwaves across several states, and stricter pollution stages.
- Courts: analyse Supreme Court or High Court rulings that set or change a rule for many; reject individual cases.
- Markets: analyse a move in the Sensex or Nifty, a sector's shares, bond yields or the rupee when a cause beyond the market is named; reject one company's share move, stock tips, price targets, IPO grey-market premiums and market wraps with no cause.
- Unsure about size or timing: choose watch. Unsure about the channel: reject.`
};
const VERDICTS = ["analyse", "watch", "brief", "reject"];
const CHANNELS = {
  global: ["india_direct", "trade_access", "prices_supply", "money_capital", "routes_security", "indians_abroad", "health_travel", "climate_weather", "tech_standards", "global_rules", "major_economies", "business_shocks"],
  domestic: ["prices_costs", "money_banking", "jobs_wages", "budgets_welfare", "industry_trade", "infrastructure_energy", "farms_food", "health_safety", "weather_environment", "law_courts", "politics_governance", "security_foreign", "digital_tech"]
};
// Code checks on the model's verdict, so the outcome always follows the written rules.
function settleVerdict(v, mode) {
  let verdict = VERDICTS.includes(v.verdict) ? v.verdict : v.relevant === true ? "analyse" : "reject";
  const grows = typeof v.grows_if === "string" && v.grows_if.trim().length >= 4 && !/further developments/i.test(v.grows_if);
  if (verdict !== "reject" && v.status === "statement") { verdict = "reject"; v.reason = "A statement or prediction, not a development"; }   // a statement is never kept
  if (verdict !== "reject" && v.channel && !CHANNELS[mode].includes(v.channel)) v.channel = null;
  if (verdict !== "reject" && !v.channel) { verdict = "reject"; v.reason = "No route to India named"; }                                // no channel, no story
  if (verdict === "analyse" && v.effect === "low") verdict = grows ? "watch" : "brief";            // the bar is medium
  if (verdict === "analyse" && v.status === "intention") verdict = grows ? "watch" : "brief";      // only done or in process is analysed
  if (verdict === "watch" && !grows) verdict = "brief";                                               // watch needs a checkable trigger
  if (verdict === "brief" && v.reach === "local") { verdict = "reject"; v.reason = "Local, with no way to grow"; }                     // local items with no growth path stay out
  return verdict;
}
function filterInfo(v, verdict) {
  const pickS = (x, list) => list.includes(x) ? x : null;
  return { verdict, channel: v.channel || null, status: pickS(v.status, ["done", "in_process", "intention", "statement"]), effect: pickS(v.effect, ["high", "medium", "low"]),
    reach: pickS(v.reach, ["national", "sector", "regional", "local"]), ...(verdict === "watch" ? { grows_if: str(v.grows_if, 120) } : {}), reason: str(v.reason, 160), at: new Date().toISOString() };
}
// Watch items leave the "Watching" strip after a set time unless their trigger happens first.
const WATCH_DAYS = { weather: 3, outbreak: 14, scheduled: 21, other: 7 };
function watchKind(channel) {
  if (["climate_weather", "weather_environment"].includes(channel)) return "weather";
  if (["health_travel", "health_safety"].includes(channel)) return "outbreak";
  if (["politics_governance", "law_courts", "global_rules", "budgets_welfare"].includes(channel)) return "scheduled";
  return "other";
}
const watchExpiry = (channel, from = Date.now()) => new Date(from + WATCH_DAYS[watchKind(channel)] * 864e5).toISOString();
// Priority 0-100, set by code from the filter's answers (and the analysis, once written). The site ranks by it.
function priorityOf(ev) {
  const f = ev.filter || {}, a = ev.analysis;
  let base;
  if (ev.stage === "watch") base = f.effect === "medium" || f.effect === "high" ? 35 : 25;
  else if (ev.stage === "brief") base = 10;
  else if (ev.stage === "expired") base = 5;
  else if (ev.stage === "context" || !a) base = 20;
  else { const eff = f.effect || a.exposure?.level || (ev.relevance === "high" ? "high" : "medium"); base = eff === "high" ? 60 : 45; }
  const reach = { national: 15, sector: 10, regional: 5, local: 0 }[f.reach] ?? (a ? 10 : 5);
  const status = { done: 5, in_process: 3, intention: 0, statement: 0 }[f.status] ?? (a ? 5 : 0);
  const outlets = Math.min(15, 5 * Math.max(0, new Set((ev.reports || []).map(r => r.source)).size - 1));
  const exposure = a?.exposure?.level === "high" ? 5 : 0;
  return Math.min(100, base + reach + status + outlets + exposure);
}
const WATCH_CHECK_LIMIT = 30, WATCH_CHECK_BATCH = 15;
function promotePrompt(items) {
  return `Each developing story below was put on watch with a trigger ("grows_if"): the event that would make it matter to people or businesses in India. Newer reports have arrived since. For each story decide whether to promote it to full analysis.

Promote only if the newer reports show the trigger has happened, or on their own show a medium or high effect on India: a whole sector, a large city or region, a household essential, the rules, safety or money of many people. More articles about the same thing are not enough. A forecast, a statement or a demand is not enough.

Stories:
${JSON.stringify(items)}

Return ONLY a JSON array: [{"id":0,"promote":false,"effect":"low","reason":"under 15 words"}]`;
}
async function reviewWatch(data, mode) {
  const now = Date.now(), all = data.sectors.flatMap(sec => sec.items);
  let expired = 0, checked = 0, promoted = 0, failed = 0;
  for (const ev of all) if (ev.stage === "watch" && Date.parse(ev.watch?.expires || 0) < now) { ev.stage = "expired"; ev.watch.expiredAt = new Date().toISOString(); expired++; }
  const due = all.filter(ev => ev.stage === "watch" && ev.watch?.recheck).sort((a, b) => latest(b).localeCompare(latest(a))).slice(0, WATCH_CHECK_LIMIT);
  const up = [];
  for (let k = 0; k < due.length; k += WATCH_CHECK_BATCH) {
    const batch = due.slice(k, k + WATCH_CHECK_BATCH);
    try {
      const res = await callClaude(promotePrompt(batch.map((ev, i) => ({ id: i, headline: ev.headline, grows_if: ev.watch.grows_if, first_seen: String(ev.watch.since || ev.date || "").slice(0, 10),
        newer_reports: (ev.reports || []).slice(ev.watch.checkedReports || 1).slice(-6).map(r => ({ outlet: OUTLETS[r.source] || r.source, date: String(r.date || "").slice(0, 16), headline: r.headline, summary: r.summary || "" })) }))), "filter");
      const byI = new Map((res || []).filter(r => r && Number.isInteger(+r.id)).map(r => [+r.id, r]));
      batch.forEach((ev, i) => { checked++; ev.watch.recheck = false; ev.watch.checkedAt = new Date().toISOString(); ev.watch.checkedReports = (ev.reports || []).length; const r = byI.get(i);
        if (r?.promote === true) { up.push(ev); ev.watch.promoteReason = str(r.reason, 160); if (["medium", "high"].includes(r.effect)) ev.filter = { ...(ev.filter || {}), effect: r.effect }; } });
    } catch (e) { if (e instanceof BudgetError) break; console.error(`Watch check failed: ${e.message}`); failed++; }
  }
  // Promoted stories are analysed now, with the same steps as any new story.
  if (up.length) {
    try {
      const res = await analyseStories(up.map((ev, i) => ({ i, id: ev.id, headline: ev.headline, url: ev.url, war: ev.conflict, kind: (ev.reports || [])[0]?.kind || "hard", reports: ev.reports || [], relevance: ev.relevance })), mode, "core");
      up.forEach((ev, i) => { const o = res.get(i); if (!o || o.r.relevant === false) return;
        applyAnalysis(ev, o.r, o.plan); ev.stage = "analyse"; ev.watch.promotedAt = new Date().toISOString();
        const lead = (ev.reports || []).slice(-1)[0]; if (lead && lead.url !== ev.url) { ev.watch.firstHeadline = ev.headline; ev.headline = lead.headline; ev.url = lead.url; }   /* the report that set off the trigger leads */
        ev.filter = { ...(ev.filter || {}), verdict: "analyse" }; promoted++; });
    } catch (e) { if (!(e instanceof BudgetError)) { console.error(`Promoted-story analysis failed: ${e.message}`); failed++; } }
  }
  return { checked, promoted, expired, open: all.filter(ev => ev.stage === "watch").length, ...(failed ? { failedBatches: failed } : {}) };
}
const RELEVANCE_RULES = {
  global: `Keep an item only if it plausibly affects India: a global price, supply or trade shift, a policy by a major economy, a regional conflict on India's trade or energy routes, or events in or about India. Judge by what the HEADLINE is about. A story framed around another country's domestic prices, politics, services or crime is NOT relevant, even if its summary mentions a global cause (for example "UK diesel price hits record high" is not relevant; the global cause gets its own story). Elections, leadership contests and changes of government in other countries are NOT relevant unless the item itself mentions a trade, tariff, energy, sanctions or foreign-policy shift. Sport, celebrity, entertainment, lifestyle, local crime and single-company stock news are not relevant. ${MARKET_RULE.global} When unsure, choose false.`,
  domestic: `Keep an item only if it is a development of NATIONAL significance for India: national policy, regulation, budgets and taxes, RBI and banking, inflation and jobs data, infrastructure, energy, industry and manufacturing, agriculture and food supply, technology and telecom policy, environment and climate events with wide impact, and major governance developments. Mark relevant=false for crime, accidents, court cases about individuals, celebrity, entertainment, sport, religion, city- or state-level stories without national impact, party political sparring, single-company results or deals that do not affect a whole sector. ${MARKET_RULE.domestic} When unsure, choose false.`
};

// Where the event itself happened: drawn on the home page's world map as a line from that place to India.
const PLACE_RULE = `For kept items also give "place": where the event itself happened, not where it was reported from: {"name":"short place name, e.g. Strait of Hormuz, Kyiv, Washington, Mumbai","country":"country name","lat":0.0,"lon":0.0,"involves":["up to 3 other countries directly involved, e.g. the other side of a deal, dispute or conflict"]}. For a government's decision use its capital (a US tariff on China → Washington, involves ["China"]); for an incident use where it happened. "involves" is [] when no other country is directly involved. Use null when there is no single place (for example a worldwide price move).`;
const PLACE_LIMIT = 120, PLACE_BATCH = 40, PLACE_DAYS = 7;   // recent stories given a place per desk per run (one-off catch-up)
export function cleanPlace(p) {
  if (!p || typeof p !== "object") return null;
  const lat = +p.lat, lon = +p.lon, name = str(p.name, 40), country = str(p.country, 40);
  if (!name || !isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const involves = arr(p.involves, 3).map(x => str(x, 40)).filter(x => x && x.toLowerCase() !== country.toLowerCase());
  return { name, country, lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100, ...(involves.length ? { involves } : {}) };
}
function placePrompt(items) {
  return `For each news story below, say where the event itself happened.

${PLACE_RULE.replace("For kept items also give", "Give")}

Stories:
${JSON.stringify(items)}

Return ONLY a JSON array, one object per story: [{"id":0,"place":{"name":"...","country":"...","lat":0.0,"lon":0.0,"involves":["..."]}}] or [{"id":1,"place":null}]`;
}
// One-off catch-up: give recent stories that predate the place field a place.
async function labelPlaces(data) {
  const cut = new Date(Date.now() - PLACE_DAYS * 864e5).toISOString();
  const pending = data.sectors.flatMap(s => s.items).filter(e => !e.place && !e.placeTried && latest(e) >= cut).sort((a, b) => latest(b).localeCompare(latest(a))).slice(0, PLACE_LIMIT);
  let labelled = 0, none = 0, failed = 0;
  for (let k = 0; k < pending.length; k += PLACE_BATCH) {
    const batch = pending.slice(k, k + PLACE_BATCH);
    try {
      const res = await callClaude(placePrompt(batch.map((e, i) => ({ id: i, headline: e.headline, summary: (e.reports || []).map(r => r.summary).find(Boolean) || e.why || "" }))), "filter");
      for (const r of res || []) { const e = batch[+r?.id]; if (!e) continue; const p = cleanPlace(r.place); if (p) { e.place = p; labelled++; } else { e.placeTried = true; none++; } }
    } catch (e) { if (e instanceof BudgetError) break; console.error(`Place batch failed: ${e.message}`); failed++; }
  }
  return { labelled, none, waiting: Math.max(0, pending.length - labelled - none), ...(failed ? { failedBatches: failed } : {}) };
}

// Step 1 (fast model): keep or reject each headline, and match follow-ups to stories already on the desk.
function filterPrompt(batch, recent, mode) {
  const items = batch.map((s, i) => ({ id: i, outlet: OUTLETS[s.src], headline: s.headline, summary: s.summary }));
  const known = recent.map(e => ({ key: e.id, headline: e.headline }));
  return `${FILTER_RULES[mode === "domestic" ? "domestic" : "global"]}

ALSO FOR EVERY ITEM:
- ${SAME_EVENT_RULE}
- ${KIND_RULE}
- For items you do not reject, give "sector", the ONE sector it fits best:
${sectorList()}
- ${PLACE_RULE}

KNOWN EVENTS:
${JSON.stringify(known)}

Items:
${JSON.stringify(items)}

Return ONLY a JSON array, one object per item, in input order:
[{"id":0,"verdict":"analyse","channel":"${CHANNELS[mode === "domestic" ? "domestic" : "global"][0]}","status":"done","effect":"high","reach":"national","grows_if":null,"reason":"under 15 words","kind":"hard","sector":"energy","place":{"name":"Strait of Hormuz","country":"Iran","lat":26.6,"lon":56.3,"involves":["United States"]},"sameAs":null}]
For verdict "reject" give only id, verdict, status, kind, reason and sameAs.`;
}

// One-off (23 Oct): recent stories whose main subject is finance move from Economy & Trade or Policy into Finance.
const FINANCE_DAYS = 30, FINANCE_LIMIT = 200, FINANCE_BATCH = 40;
function financePrompt(items) {
  return `For each news story below, say whether its MAIN subject is finance: ${SECTOR_HINTS.finance}. Growth, inflation and jobs data, trade, tariffs, budgets and taxes are NOT finance.

Stories:
${JSON.stringify(items)}

Return ONLY a JSON array: [{"id":0,"finance":false}]`;
}
async function moveToFinance(data) {
  const fin = data.sectors.find(s => s.id === "finance"); if (!fin) return { moved: 0 };
  const cut = new Date(Date.now() - FINANCE_DAYS * 864e5).toISOString();
  const pending = data.sectors.filter(s => ["economy", "governance"].includes(s.id)).flatMap(sec => sec.items.filter(ev => !ev.finChecked && latest(ev) >= cut).map(ev => ({ ev, sec })))
    .sort((a, b) => latest(b.ev).localeCompare(latest(a.ev))).slice(0, FINANCE_LIMIT);
  let moved = 0, checked = 0, failed = 0;
  for (let k = 0; k < pending.length; k += FINANCE_BATCH) {
    const batch = pending.slice(k, k + FINANCE_BATCH);
    try {
      const res = await callClaude(financePrompt(batch.map((x, i) => ({ id: i, headline: x.ev.headline, summary: (x.ev.reports || []).map(r => r.summary).find(Boolean) || x.ev.why || "" }))), "filter");
      const yes = new Set((res || []).filter(r => r?.finance === true).map(r => +r.id));
      batch.forEach((x, i) => { x.ev.finChecked = true; checked++;
        if (yes.has(i)) { x.sec.items = x.sec.items.filter(e => e !== x.ev); fin.items.push(x.ev); moved++; } });
    } catch (e) { if (e instanceof BudgetError) break; console.error(`Finance check failed: ${e.message}`); failed++; }
  }
  return { moved, checked, ...(failed ? { failedBatches: failed } : {}) };
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
      for (const v of await callClaude(classifyPrompt(items), "filter", "extra")) {
        const r = batch[+v?.id]; if (r && KINDS.includes(v.kind)) { r.kind = v.kind; labelled++; }
      }
    } catch (e) { if (e instanceof BudgetError) break; console.error(`Kind labelling batch failed: ${e.message}`); failed++; }
  }
  return { labelled, waiting: Math.max(0, pending.length - labelled), failedBatches: failed };
}

// ---------- Layer 2: the analysis framework library ----------
// 1) A fast model answers yes/no feature questions about each story.
// 2) Plain code picks the primary framework from a fixed priority order and sets the depth tier.
// 3) Opus fills the chosen framework(s) plus the universal block, using only the reports.
// 4) Validators drop any figure that is not in the reports and any sentence that reads like advice.
const ANALYSIS_V = 3;           // v3: complete sentences throughout, background and terms explained (v2: frameworks)
const ANALYSIS_CHUNK = 3;      // stories per Opus request (each analysis is long)
const FEATURE_BATCH = 12;      // stories per feature-question request
const REFRAME_LIMIT = 12;      // existing stories (re)analysed per desk per run, newest first
const REFRAME_DAYS = 7;
const READING_DAYS = 90;       // feature pieces offered as background reading        // older stories keep the analysis they have

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
  market_move:    "Market move",
  scenarios:      "Scenarios & signposts"
};
// Fixed priority: the first feature that is true picks the primary framework.
const PRIORITY = [
  ["conflict", "conflicting"], ["scheduled", "decoder"], ["disruption", "disruption_map"], ["armed_conflict", "escalation"],
  ["trade_flow", "trade_flow"], ["policy_stage", "policy_tracker"], ["market_move", "market_move"], ["price_move", "pass_through"],
  ["allocation", "winners_losers"], ["fast_moving", "timeline"]
];
const FEATURE_KEYS = ["conflict", "scheduled", "disruption", "armed_conflict", "trade_flow", "policy_stage", "market_move", "price_move", "allocation", "fast_moving", "pending_outcome"];
function pickPrimary(f) { for (const [k, fw] of PRIORITY) if (f && f[k]) return fw; return "impact_chain"; }
// Deep-dive pairing, evaluated in order. Never pairs a framework with itself.
function pickComplement(primary, f) {
  const order = {
    impact_chain:   [f.pending_outcome && "scenarios", "winners_losers"],
    disruption_map: [f.armed_conflict && "escalation", f.price_move && "pass_through", f.pending_outcome && "scenarios", "winners_losers"],
    trade_flow:     [f.market_move && "market_move", f.price_move && "pass_through", f.pending_outcome && "scenarios", "winners_losers"],
    policy_tracker: [f.pending_outcome && "scenarios", "winners_losers"],
    decoder:        [f.market_move && "market_move", "pass_through", "winners_losers"],
    market_move:    [f.pending_outcome && "scenarios", "winners_losers"],
    pass_through:   ["winners_losers"],
    winners_losers: [f.pending_outcome && "scenarios", "impact_chain"],
    conflicting:    ["impact_chain"],
    timeline:       [f.armed_conflict && "escalation", "scenarios"],
    escalation:     ["scenarios"]
  }[primary] || ["winners_losers"];
  return order.find(x => x && x !== primary) || null;
}
// Depth tier from the story's own reports.
// A one-day market move stays a Quick read (decision 23 Oct); a run of days or a record can go deeper.
const RECORD = /\b(record|all[- ]time|lowest since|highest since|\d+-(year|month|week) (high|low)|worst (day|week|month|year)|best (day|week|month|year))\b/i;
function tierOf(ev, primary) {
  const reps = ev.reports || [];
  const outlets = new Set(reps.map(r => r.source)).size;
  const ts = reps.map(r => Date.parse(r.date)).filter(t => !isNaN(t));
  const spanDays = ts.length ? (Math.max(...ts) - Math.min(...ts)) / 864e5 : 0;
  if (outlets < 2) return "quick";
  if (primary === "market_move" && spanDays < 2 && !reps.some(r => RECORD.test(r.headline || ""))) return "quick";
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
- "market_move": the headline is about a move in a whole share market or index (for example Sensex, Nifty, S&P 500), a whole sector's shares, or government bond yields. Not one company's shares, and not a currency or commodity price on its own.
- "price_move": the headline is a change in a price, exchange rate or interest rate, or an immediate one-off tax or duty change.
- "allocation": an action by a named company or industry (merger, investment, plant opening or closure, layoffs, large contract) or an allocation decision (budget, MSP, subsidy, quota).
- "fast_moving": three or more developments in sequence across the reports, or responsibility for an act is disputed.
- "pending_outcome": the reports name an unresolved next outcome (talks, vote, ruling, deadline, retaliation, reopening).

Stories:
${JSON.stringify(items)}

Return ONLY a JSON array: [{"id":0,"conflict":false,"scheduled":false,"disruption":true,"armed_conflict":true,"trade_flow":false,"policy_stage":false,"market_move":false,"price_move":false,"allocation":false,"fast_moving":false,"pending_outcome":true}]`;
}

const GROUPS = ["Fuel & LPG users", "Food shoppers", "Borrowers", "Depositors & savers", "Equity & mutual fund investors", "Salaried workers", "Farmers", "Fishers", "MSME exporters", "Large exporters", "Importers & traders", "Students abroad", "Gulf & overseas workers and families", "Travellers & pilgrims", "IT & services workers", "Manufacturing workers", "Power consumers", "Government finances", "A named state or region"];
const FW_SPEC = {
  impact_chain: `"impact_chain": {"chain":[{"step":"short label for the step, ≤8 words","detail":"one or two complete sentences, ≤40 words, explaining what happens at this step and how it leads to the next","basis":"reported|inferred"}], "breaks_if":"one complete sentence, ≤35 words, on the condition that would stop the effect reaching India"}. 3 steps at Quick read, up to 4 otherwise. The first step must be reported. At most 1 inferred step at Quick read, 2 otherwise.`,
  disruption_map: `"disruption_map": {"node":{"name":"...","type":"port|airport|strait|canal|pipeline|refinery|power plant|factory|rail|road|other","status":"closed|partial|open|unknown","as_of":"date/time as reported"},"cause":{"text":"one complete sentence, ≤35 words","status":"confirmed|claimed|alleged"},"flows":[{"flow":"crude|LNG|containers|air passengers|workers|pilgrims|cargo|other","india_link":"one or two complete sentences, ≤40 words, on how this flow reaches India and who depends on it","basis":"reported|inferred"}],"alternatives":["each a short phrase as reported"],"duration":"as reported, or 'not reported'"}. Only flows named in the reports.`,
  trade_flow: `"trade_flow": {"good":"...","actors":[{"country":"...","role":"exporter|importer|third_party","is_india":false}],"change":{"type":"start|stop|increase|cut|tariff|sanction|ban|deal|other","effective":"date if reported"},"india_position":{"role":"competing_buyer|supplier|rival_exporter|transit|not_involved","note":"two complete sentences, ≤50 words, cautious: where India sits in this trade and what the change could mean for Indian buyers or sellers"},"volumes":[{"value":0,"unit":"...","period":"...","from":"<outlet>"}]}. Volumes only if stated in the reports.`,
  policy_tracker: `"policy_tracker": {"instrument":{"name":"...","issuer":"...","jurisdiction":"..."},"stages":[{"stage":"announced|draft|adopted|notified|transition|in_force|under_review|amended_or_repealed","date":"if reported","status":"done|current|next"}],"obligations":[{"who":"...","what":"one complete sentence, ≤35 words, on what they must do","from":"date if reported"}],"applies_to_india":"yes|no|partly","india_note":"one or two complete sentences, ≤45 words, on what the measure means for Indian people, firms or the government"}. Assign stages only from the reports' wording; a proposal is never "in_force".`,
  decoder: `"decoder": {"kind":"release|decision","headline":{"label":"...","value":0,"unit":"...","period":"...","previous":null,"previousLabel":"...","from":"<outlet>"},"comparisons":[{"label":"e.g. RBI target, year ago","value":0,"unit":"...","from":"<outlet>"}],"drivers":[{"name":"short label, ≤6 words","direction":"up|down|mixed","how":"one complete sentence, ≤30 words, on how this factor moved the figure, as stated by the issuer or quoted in reports"}],"decision":{"action":"hike|cut|hold|other","size":"as reported","stance":"one or two complete sentences, ≤40 words, on the stated reasoning"}}. Drivers only as stated by the issuer or quoted in reports. No consensus figure unless a report attributes one.`,
  pass_through: `"pass_through": {"driver":{"variable":"...","direction":"up|down","size":"as reported or empty"},"product":"petrol & diesel|LPG|edible oils|fertiliser|food staples|electronics|loan EMIs|deposit rates|other","rungs":[{"stage":"short label, ≤10 words, e.g. Global crude price → Refiners' cost","pass":"likely|partial|blocked|unclear","damper":"one complete sentence, ≤30 words, on what slows or blocks the pass-through at this stage (taxes, administered prices, subsidies, contracts, inventory)","lag":"days|weeks|months"}],"end_user":{"group":"one of the affected groups","effect":"one or two complete sentences, ≤40 words, cautious, on what this group may notice and when"}}. 3 to 5 rungs from the global price to what Indians pay. Never give a percentage.`,
  winners_losers: `"winners_losers": {"groups":[{"group":"one of the affected groups","direction":"gain|lose|mixed|unclear","directness":"direct|indirect","mechanism":"one or two complete sentences, ≤40 words, on how the change reaches this group"}],"not_affected":"one complete sentence, ≤35 words, on a group readers might assume is affected but is not, and why; or empty"}. Max 6 groups; each needs a mechanism from the reports. Never name companies as winners in a market sense.`,
  conflicting: `"conflicting": {"disputed":{"item":"what is disputed, as a short phrase","unit":"..."},"accounts":[{"outlet":"...","value":"as reported","origin":"who the figure or claim comes from","time":"as reported"}],"agreed":["complete sentences: facts all reports agree on"],"explanations":[{"type":"different time|different source|different definition|unexplained","note":"one complete sentence, ≤35 words, on why the accounts may differ"}],"status":"unresolved|converging|resolved"}. Never average or pick a side; use neutral verbs.`,
  timeline: `"timeline": {"entries":[{"when":"as reported","what":"one complete sentence, ≤35 words","actor":"...","outlet":"...","type":"action|claim|denial|confirmation","verification":"confirmed|claimed|contested"}],"current_status":"one or two complete sentences, ≤45 words","open_questions":["each a complete question, ≤25 words"]}. Oldest first, up to 6 entries. Keep both sides of any contested claim.`,
  escalation: `"escalation": {"move":"up|down|none","rung":4,"development":"one complete sentence, ≤35 words, on what THIS story adds to the war: an attack, a deployment, talks, a threat, a proposal","evidence":"one or two complete sentences, ≤40 words: for up or down, the reported action that moves the war to the new rung; for none, why the war's level stays where it is","next_signals":[{"rung":5,"signal":"one complete sentence, ≤30 words, describing the observable event that would show a move to that rung"}],"india_channels":["oil|shipping|remittances|diaspora safety|flights|trade"]}. The rung belongs to the WAR, not to this story. The story's "war" gives the war's current rung, the date it was set and the action behind it: start from that rung. "up" only if these reports describe a NEW action at a higher rung that took place after that date. "down" only if they report a de-escalation that has actually happened: a ceasefire or truce in force, a withdrawal, or fighting reported to have stopped. Talks, proposals, offers, statements and threats never move it down. Otherwise "none", with "rung" equal to the war's current rung. If the story has no "war", or the war has no rung yet, set "rung" from the actions reported and "move":"none". Next signals are observable events for other rungs, judged from the war's rung after your move. Rungs: 1 Rhetoric and threats; 2 Sanctions and diplomatic measures; 3 Mobilisation and posturing; 4 Limited strikes or attacks; 5 Sustained strikes; 6 Strikes on critical infrastructure or third countries; 7 Full-scale war. The rung must match actions actually reported; never predict.`,
  market_move: `"market_move": {"moved":{"what":"the market, index, sector or bond that moved, e.g. Sensex, Nifty IT index, US 10-year Treasury yield","kind":"share index|sector shares|bond yields|other","direction":"up|down|mixed","size":"the move as reported, e.g. '900 points' or '2.1%', or empty","period":"as reported, e.g. 'on Thursday' or 'this week'"},"cause":{"text":"one or two complete sentences, ≤40 words, on the cause the reports give","status":"reported|claimed","by":"who gives the cause, e.g. exchange data, the central bank, analysts quoted by the outlet"},"duration":"one_day|multi_day|record|unclear","channels":[{"channel":"foreign investment flows|rupee|borrowing costs|company earnings|jobs in the sector|household savings|other","india_link":"one or two complete sentences, ≤40 words, on how this move reaches people or businesses in ${REGION}","basis":"reported|inferred"}],"not_settled":"one complete sentence, ≤30 words, on what the reports say is still unknown, or empty"}. 1 channel at Quick read, up to 3 otherwise. Explain what moved and why. Never say where markets will go next, never suggest buying, selling or holding anything, and never name a share as a winner. "one_day" unless the reports describe a run of days ("multi_day") or a record.`,
  scenarios: `"scenarios": {"question":"the unresolved thing, as a complete question, ≤25 words","scenarios":[{"name":"short label, ≤5 words","what":"one or two complete sentences, ≤40 words, on what would happen","signal":"one complete sentence, ≤30 words, on the observable sign that this path is unfolding","india_effect":"one or two complete sentences, ≤40 words, cautious, on what it would mean for India"}]}. 2 or 3 scenarios, each tied to an outcome named in the reports or an official position. No probabilities, no ranking.`
};

// ---------- War ladder: one escalation level per war, shared by every story about it, on both desks ----------
// Without it, each story is rated alone: a peace-talks story about the Russia–Ukraine war reads as "rhetoric" while a
// strike story the same day reads as "sustained strikes". The level belongs to the war; a story can only move it,
// and only with a reported action (up) or a de-escalation that has actually happened (down).
const WARS_FILE = "data/conflicts.json";
const WAR_MATCH_BATCH = 20;    // stories per war-matching request
const WAR_LINK_LIMIT = 60;     // older escalation stories tied to a war per desk per run
const WAR_SEED_LIMIT = 6;      // new wars given a starting level per desk per run
const WAR_ACTIVE_DAYS = 120;   // wars offered for matching
const RUNG_NAMES = ["Rhetoric and threats", "Sanctions and diplomatic measures", "Mobilisation and posturing", "Limited strikes or attacks", "Sustained strikes", "Strikes on critical infrastructure or third countries", "Full-scale war"];
// A move down needs a de-escalation that has happened, not one that is proposed.
const DEESCALATION = /\b(ceasefire|cease-fire|truce|armistice)\b|\bwithdr(ew|awn|awal|awing)\b|\bpulled (back|out)\b|\b(halted|suspended|stopped|ended|paused)\b[^.]{0,30}\b(strikes|attacks|offensive|fighting|operations|bombing|bombardment|hostilities|war)\b|\b(fighting|strikes|attacks|hostilities)\b[^.]{0,20}\b(stopped|ended|halted|ceased)\b/i;
const PROPOSED = /\b(propos\w*|offer\w*|calls? for|called for|seek\w*|urg\w*|push\w* for|could|would|may|might|talks? (on|about|over))\b[^.]{0,60}\b(ceasefire|cease-fire|truce|withdrawal|pause)\b/i;
const IN_FORCE = /\b(in force|in effect|took effect|takes effect|came into effect|holding|has held|agreed|signed|began|begun|started|announced|declared|implemented)\b/i;
export function isDeescalation(text) { const t = String(text || ""); return DEESCALATION.test(t) && !(PROPOSED.test(t) && !IN_FORCE.test(t)); }
let wars = { conflicts: {} };
async function loadWars() { wars = await readJson(WARS_FILE, { conflicts: {} }); wars.conflicts ||= {}; }
async function saveWars() { await fs.writeFile(WARS_FILE, JSON.stringify({ updatedAt: new Date().toISOString(), rungs: RUNG_NAMES, conflicts: wars.conflicts }, null, 1) + "\n"); }
function warIdFor(name) { return "w" + idFor("war:" + name.toLowerCase().replace(/[–—-]/g, "-").replace(/\s+/g, " ").trim()).slice(1); }
// What the analysis desk is told about a story's war.
export function warForPrompt(id) {
  const w = id && wars.conflicts[id]; if (!w) return null;
  if (!(w.rung >= 1)) return { name: w.name, parties: w.parties || [], current_rung: null };
  return { name: w.name, parties: w.parties || [], current_rung: w.rung, level: RUNG_NAMES[w.rung - 1], set_on: String(w.since || "").slice(0, 10), set_by: w.evidence || "",
    recent_moves: (w.history || []).slice(-3).map(h => ({ date: String(h.at || "").slice(0, 10), from: h.from, to: h.to })) };
}
// Apply the analysis desk's verdict to the war, under fixed rules, and record on the story what happened.
export function applyLadder(f, warId, plan) {
  const w = wars.conflicts[warId]; if (!w) return f;
  const when = (plan.reports || []).map(r => r.date || "").filter(Boolean).sort().pop() || new Date().toISOString();
  const from = w.rung >= 1 ? w.rung : null; let to = from, held = "";
  if (from === null) to = f.rung;
  else if (f.move === "up" && f.rung > from) { if (when >= (w.since || "")) to = f.rung; else held = "older report"; }
  else if (f.move === "down" && f.rung < from) {
    if (when < (w.since || "")) held = "older report";
    else if (!isDeescalation(f.evidence)) held = "no de-escalation reported";
    else to = f.rung;
  }
  if (to !== from) {
    w.history = [...(w.history || []), { at: when, from, to, evidence: f.evidence, story: plan.id || "", headline: plan.headline || "", url: plan.url || "" }].slice(-40);
    w.rung = to; w.since = when; w.evidence = f.evidence; w.story = plan.id || ""; w.url = plan.url || "";
  }
  if (!w.updated || when > w.updated) w.updated = when;
  f.conflict = warId; f.applied = to === from ? "none" : from === null ? "set" : to > from ? "up" : "down";
  f.from = from; f.rung = f.current_rung = w.rung; f.previous_rung = to !== from ? from : null;
  if (held) f.held = held; else delete f.held;
  return f;
}
function warMatchPrompt(stories, known) {
  return `Each news story below is about armed conflict. Say which war or armed confrontation it belongs to.

A war is the conflict itself, defined by its main parties and where it is fought, not one aspect of it. Strikes, attacks on energy sites or shipping, ceasefire talks, peace proposals, military aid, sanctions tied to the fighting and statements by its leaders all belong to the same war. For example, "Russia–Ukraine war" covers Ukrainian strikes on Russian refineries, attacks on Black Sea shipping and US-led peace talks.

Rules:
1. Use a key from KNOWN WARS when the story is about the same war, even if it covers a different aspect or a new country becomes involved.
2. Otherwise name a new war: 2 to 5 words, neutral, naming the main parties or the place (good: "Russia–Ukraine war", "Yemen war", "Israel–Iran conflict"; bad: "Middle East tensions", "Escalating crisis"). Give its main parties.
3. If the story is not about an armed conflict (for example a trade dispute or a diplomatic row with no fighting or military threat), return "war": null.

KNOWN WARS:
${JSON.stringify(known)}

Stories:
${JSON.stringify(stories)}

Return ONLY a JSON array, one object per story: [{"id":"0","war":"<key>"}] or [{"id":"1","newWar":"<name>","parties":["...","..."]}] or [{"id":"2","war":null}]`;
}
// items: [{ key, headline, reports }] → Map(key → war id or "none")
async function linkWars(items, level = "core") {
  const out = new Map();
  const cut = new Date(Date.now() - WAR_ACTIVE_DAYS * 864e5).toISOString();
  const byName = new Map(Object.values(wars.conflicts).map(w => [w.name.toLowerCase(), w]));
  for (let k = 0; k < items.length; k += WAR_MATCH_BATCH) {
    const chunk = items.slice(k, k + WAR_MATCH_BATCH);
    const known = Object.values(wars.conflicts).filter(w => (w.updated || w.created || "") >= cut).map(w => ({ key: w.id, name: w.name, parties: w.parties || [] }));
    const stories = chunk.map(x => { const r = (x.reports || []).slice(-1)[0] || {}; return { id: x.key, headline: x.headline || r.headline || "", summary: r.summary || "" }; });
    const res = await callClaude(warMatchPrompt(stories, known), "filter", level);
    for (const r of res || []) {
      const x = chunk.find(c => c.key === String(r?.id)); if (!x) continue;
      let w = typeof r.war === "string" && wars.conflicts[r.war];
      if (!w && typeof r.newWar === "string" && r.newWar.trim()) {
        const name = r.newWar.trim().slice(0, 60);
        w = byName.get(name.toLowerCase());
        if (!w) { w = { id: warIdFor(name), name, parties: arr(r.parties, 6).map(p => str(p, 40)).filter(Boolean), rung: null, created: new Date().toISOString(), history: [] }; wars.conflicts[w.id] = w; byName.set(name.toLowerCase(), w); }
      }
      out.set(x.key, w ? w.id : "none");
    }
  }
  return out;
}
function seedPrompt(w, stories) {
  return `You keep the escalation ladder for one war on a news site that explains how world events affect India. Set the war's CURRENT level from the stories below (oldest first), using only what they report.

War: ${w.name} (${(w.parties || []).join(", ")})

Rungs: 1 Rhetoric and threats; 2 Sanctions and diplomatic measures; 3 Mobilisation and posturing; 4 Limited strikes or attacks; 5 Sustained strikes; 6 Strikes on critical infrastructure or third countries; 7 Full-scale war.

Rules:
1. The level is the war's, not any single story's. It is set by the most serious kind of action the reports show is still going on.
2. The level only comes down after a de-escalation that has actually happened: a ceasefire or truce in force, a withdrawal, or fighting reported to have stopped. Talks, proposals, offers and statements do not lower it.
3. Base everything on actions reported in these stories. Never predict.

Stories:
${JSON.stringify(stories)}

Return ONLY a JSON array with one object:
[{"rung":5,"since":"YYYY-MM-DD, the date of the story that shows the action setting the current level","story":"<id of that story>","evidence":"one or two complete sentences, ≤40 words, on the reported action that sets the level","history":[{"date":"YYYY-MM-DD","from":4,"to":5,"story":"<id>","evidence":"one complete sentence, ≤30 words"}]}]
"history" lists up to 4 earlier changes of level visible in these stories, oldest first; leave it empty if there were none.`;
}
// Before a desk's new stories: tie older escalation stories to their war, then give new wars a starting level.
async function prepareWars(events) {
  let linked = 0, seeded = 0, failed = 0;
  const usesLadder = e => !!e.analysis?.frameworks?.escalation;
  try {
    const cut = new Date(Date.now() - WAR_ACTIVE_DAYS * 864e5).toISOString();
    const todo = events.filter(e => usesLadder(e) && !e.conflict && latest(e) >= cut).sort((a, b) => latest(a).localeCompare(latest(b))).slice(0, WAR_LINK_LIMIT);
    if (todo.length) {
      const ids = await linkWars(todo.map(e => ({ key: e.id, headline: e.headline, reports: e.reports })));
      for (const e of todo) if (ids.has(e.id)) { e.conflict = ids.get(e.id); linked++; }
    }
    const members = id => events.filter(e => e.conflict === id && usesLadder(e)).sort((a, b) => latest(a).localeCompare(latest(b)));
    const unseeded = Object.values(wars.conflicts).filter(w => !(w.rung >= 1) && members(w.id).length).slice(0, WAR_SEED_LIMIT);
    for (const w of unseeded) {
      const list = members(w.id).slice(-15);
      const stories = list.map(e => ({ id: e.id, date: latest(e).slice(0, 10), headline: e.headline, bottom_line: e.why || "", reports: (e.reports || []).slice(-3).map(r => r.headline) }));
      let res;
      try { res = await callClaude(seedPrompt(w, stories), "analysis"); } catch (e) { if (e instanceof BudgetError) throw e; console.error(`War level for ${w.name} failed: ${e.message}`); failed++; continue; }
      const r = (res || [])[0]; const rung = Math.round(+r?.rung); if (!(rung >= 1 && rung <= 7)) { failed++; continue; }
      const byId = new Map(list.map(e => [e.id, e])), ref = byId.get(r.story) || list[list.length - 1];
      const day = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || "")) ? d + "T00:00:00.000Z" : "";
      const s = x => noAdvice(str(x, 400)) ? sentence(x, 300) : "";
      w.history = arr(r.history, 4).map(h => { const e = byId.get(h?.story); const f = Math.round(+h?.from), t = Math.round(+h?.to);
        return t >= 1 && t <= 7 ? { at: day(h.date) || (e ? latest(e) : ""), from: f >= 1 && f <= 7 ? f : null, to: t, evidence: s(h.evidence), story: e?.id || "", headline: e?.headline || "", url: e?.url || "", seed: true } : null; }).filter(Boolean);
      if (!w.history.length || w.history[w.history.length - 1].to !== rung)
        w.history.push({ at: day(r.since) || latest(ref), from: w.history.length ? w.history[w.history.length - 1].to : null, to: rung, evidence: s(r.evidence), story: ref.id, headline: ref.headline, url: ref.url || "", seed: true });
      w.rung = rung; w.since = day(r.since) || latest(ref); w.evidence = s(r.evidence); w.story = ref.id; w.url = ref.url || ""; w.seededAt = new Date().toISOString();
      w.updated = latest(list[list.length - 1]);
      seeded++;
    }
  } catch (e) { if (!(e instanceof BudgetError)) { console.error(`War ladder step failed: ${e.message}`); failed++; } }
  return { linked, seeded, ...(failed ? { failed } : {}), active: Object.keys(wars.conflicts).length };
}

function analysisPrompt(batch, mode) {
  const sectors = sectorList();
  const lens = mode === "domestic" ? `explains what developments INSIDE ${REGION} mean for people and businesses in ${REGION}` : `explains how world news affects ${REGION}`;
  const check = mode === "domestic" ? `of national significance for ${REGION}` : `something that plausibly affects ${REGION}`;
  const used = [...new Set(batch.flatMap(x => [x.primary, x.complement]).filter(Boolean))];
  const items = batch.map(x => ({ id: x.i, kind: x.kind, tier: x.tier, frameworks: [x.primary, x.complement].filter(Boolean), ...(x.war ? { war: x.war } : {}), reports: x.reports,
    ...(x.reading?.length ? { background_reading: x.reading.map(r => ({ outlet: OUTLETS[r.source] || r.source, date: String(r.date || "").slice(0, 10), headline: r.headline, summary: r.summary || "" })) } : {}) }));
  return `You are the senior analysis desk of an intelligence product that ${lens}. For each story, write the universal block and fill the framework(s) listed for it, using ONLY the reports given.

UNIVERSAL BLOCK (every story):
- "sector": ONE of the sectors below. "relevance": "high" (direct, material effect on many people or a whole sector within weeks) or "medium".
- "why": the bottom line in one or two sentences, ≤45 words: what happened and how it reaches ${REGION}.
- "implications": 2 to 4 complete sentences (2 at Quick read), each ≤35 words. Each one must add something the bottom line does not say: a mechanism, a group affected, a condition, or a knock-on effect. Do not restate the headline.
- "context": 1 to 3 complete sentences (1 or 2 at Quick read), each ≤40 words, of BACKGROUND the reports do not spell out but a reader needs: how this kind of event usually works, the general structure of ${REGION}'s exposure (for example, that ${REGION} imports most of its crude oil, or that Indian IT firms earn much of their revenue in the US), or the policy background. Use only well-established general knowledge you are confident is still true. No numbers, dates, names of people or new claims about this specific event unless they are in the reports. Never guess what happens next here.
- "terms": 0 to 3 of [{"term":"as written in the story","meaning":"one plain sentence, ≤30 words"}] for technical terms, acronyms or programme names a general reader may not know (for example H-1B cap, MDR, repo rate, JMMC). Skip everyday words. 0 or 1 at Quick read.
- "exposure": {"level":"high|medium|low","reason":"one or two complete sentences, ≤40 words, naming the channel through which this reaches ${REGION} and why that makes the level high, medium or low"}. High = touches a household essential (fuel, LPG, food staples, loan EMIs, deposit rates), a top Indian import or export, or the safety or travel of Indians. Medium = one industry, one bilateral relationship or a compliance obligation. Low = indirect or no mechanism in the reports.
- "horizon": {"value":"now|weeks|months|years","reason":"one complete sentence, ≤30 words, on what sets the timing"}. When people in ${REGION} are likely to feel the effect: now = within a week; weeks = one to six weeks; months = two to twelve months; years = beyond a year.
- "confidence": {"level":"high|medium|low","reason":"one complete sentence, ≤30 words, on which outlets and sources this rests on and what is still unconfirmed"}. If your reason says a central claim rests on one outlet or is unconfirmed, the level cannot be high. High = 3+ outlets agree and an on-record official source; medium = 2 outlets, or 1 with an official source; low = single outlet, anonymous sourcing, claims by a party, or an unresolved conflict.
- "affected": 1 to 4 of [{"group":"exactly one of: ${GROUPS.join(", ")}","direction":"up|down|mixed|unclear","what":"short label of what changes, ≤6 words (e.g. fuel prices, flight availability)","effect":"one complete sentence, ≤30 words, saying what changes for this group and through which channel","basis":"reported|inferred"}].
- "watch": 1 to 3 of [{"what":"the observable event, as a complete phrase, ≤20 words","why":"one complete sentence, ≤25 words, on what it would tell the reader","when":"the date as YYYY-MM-DD if the reports give the exact day (work out the year from the report date); otherwise the reported wording such as 'November 2026' or 'next week'; empty if no timing is reported","where":"named official source to check, or empty"}].

FRAMEWORKS (fill only those listed for each story, under these keys):
${used.map(k => "- " + FW_SPEC[k]).join("\n")}

DEPTH: "quick" = fewer items in each list, but every sentence still complete and self-explanatory. "standard" = complete. "deep" = complete, using every report.

WRITING STYLE (every text field):
- Formal, plain English in the register of a quality newspaper explainer: complete sentences with a subject and a verb. No headline fragments, no arrows inside sentences, no note-style shorthand.
- Every sentence must make sense to someone who has not read the story: name who acted, what changes, and who in ${REGION} it reaches.
- Explain mechanisms, not labels: write "Higher crude prices raise refiners' costs, which can feed through to petrol and diesel prices", not "fuel prices".
- Spell out abbreviations on first use, for example "merchant discount rate (MDR)".
- Short labels are allowed only in fields described as a label or name.

RULES:
1. Facts only from the reports. Never invent numbers, names, dates, causes or events, and do not add descriptions the reports do not make (for example calling a visit "unannounced" when the reports only say its announcement was unexpected). Every number you write must appear in the reports. If a field cannot be filled, leave it out.
2. Mark anything not stated in the reports as "inferred" and word it with "may" or "could".
3. Never give advice of any kind: no stocks, investments, trades, buying, selling, locking in rates, stocking up or timing decisions. Explain mechanisms only.
4. Kind "breaking": early report; keep effects conditional and confidence at most medium. Kind "investigative": attribute findings to the outlet ("The Guardian reports that…").
5. If, on a careful reading, a story is not ${check}, return {"id":N,"relevant":false,"reason":"≤15 words"}.
6. "background_reading", when a story has it, holds feature pieces from the same storyline, not reports of this event. Use them only to write "context". Never take facts, numbers or claims about this event from them.

Sectors:
${sectors}

Stories:
${JSON.stringify(items)}

Return ONLY a JSON array, one object per story: [{"id":0,"relevant":true,"sector":"...","relevance":"...","why":"...","implications":[],"context":[],"terms":[],"exposure":{},"horizon":{},"confidence":{},"affected":[],"watch":[], "<framework key>":{...}}]`;
}

// ----- validators -----
const ADVICE = /\b(you should|readers should|consider (buying|selling|investing|locking|hedging|stocking)|good (time|window|moment) to|lock(ing)? in (a |the )?(rate|fd|deposit|price)|stock up|bulk (buy|buying|purchases?)|buy (now|before|more)|sell (now|before)|(buy|sell|hold) (rating|call|recommendation)|target price|multibagger|outperform|(?<!foreign )(?<!foreign-)portfolio(?! invest)|(should|could|might want to|may want to|better to) (consider )?invest(ing)? in|investors? should)\b/i;
// 23 Oct: no forecasts of where markets go next (the market framework explains moves, never predicts them).
const FORECAST = /\b(sensex|nifty|markets?|stocks?|shares|equities|indices|index|bonds?)\b[^.]{0,50}\b(will|set to|poised to|likely to|expected to|could soon|bound to)\s+(rally|rebound|recover|bounce|crash|correct|tumble|plunge|surge|soar|climb|fall further|rise further|bottom out|hit (new |fresh )?(highs?|lows?))\b|\bcorrection (is )?(ahead|coming|likely|due)\b|\b(buying opportunity|entry point|book(ing)? profits?|bottom(ed)? out|time the market)\b/i;
function noAdvice(s) { return typeof s === "string" && !ADVICE.test(s) && !FORECAST.test(s); }
function numbersIn(text) { return new Set((String(text).replace(/(\d),(?=\d{2,3}\b)/g, "$1").match(/\d+(\.\d+)?/g) || []).map(Number)); }
function str(x, n = 240) { return typeof x === "string" ? x.trim().slice(0, n) : ""; }
function numOrNull(x) { if (typeof x === "number" && isFinite(x)) return x; if (typeof x === "string" && /^-?[\d,]+(\.\d+)?$/.test(x.trim())) return +x.replace(/,/g, ""); return null; }
const pick = (x, list, d) => list.includes(x) ? x : d;
const arr = (x, n) => (Array.isArray(x) ? x : []).slice(0, n);
// A figure is kept only if its value appears in the reports' text.
const inReports = (v, nums) => v === null || nums.has(v) || nums.has(Math.abs(v));

function cleanFramework(key, f, nums) {
  if (!f || typeof f !== "object") return null;
  // Labels and short fields get twice their nominal room and are trimmed at a word or sentence end, never mid-word.
  const clip = (x, n = 240) => sentence(typeof x === "string" ? x : "", Math.max(n * 2, 60));
  const s = (x, n) => noAdvice(clip(x, n)) ? sentence(x, n) : "";
  switch (key) {
    case "impact_chain": { const chain = arr(f.chain, 4).map(x => ({ step: s(x?.step, 80), detail: s(x?.detail, 350), basis: pick(x?.basis, ["reported", "inferred"], "inferred") })).filter(x => x.step); return chain.length ? { chain, breaks_if: s(f.breaks_if, 350) } : null; }
    case "disruption_map": { const n = f.node || {}; if (!clip(n.name)) return null;
      return { node: { name: clip(n.name, 80), type: clip(n.type, 20), status: pick(n.status, ["closed", "partial", "open", "unknown"], "unknown"), as_of: clip(n.as_of, 40) },
        cause: f.cause ? { text: s(f.cause.text, 350), status: pick(f.cause.status, ["confirmed", "claimed", "alleged"], "claimed") } : null,
        flows: arr(f.flows, 5).map(x => ({ flow: clip(x?.flow, 30), india_link: s(x?.india_link, 350), basis: pick(x?.basis, ["reported", "inferred"], "inferred") })).filter(x => x.flow),
        alternatives: arr(f.alternatives, 3).map(x => s(x, 250)).filter(Boolean), duration: clip(f.duration, 60) || "not reported" }; }
    case "trade_flow": { if (!clip(f.good)) return null;
      return { good: clip(f.good, 60), actors: arr(f.actors, 5).map(x => ({ country: clip(x?.country, 40), role: pick(x?.role, ["exporter", "importer", "third_party"], "third_party"), is_india: !!x?.is_india })).filter(x => x.country),
        change: { type: clip(f.change?.type, 20), effective: clip(f.change?.effective, 40) },
        india_position: f.india_position ? { role: pick(f.india_position.role, ["competing_buyer", "supplier", "rival_exporter", "transit", "not_involved"], "not_involved"), note: s(f.india_position.note, 400) } : null,
        volumes: arr(f.volumes, 3).map(x => ({ value: numOrNull(x?.value), unit: clip(x?.unit, 30), period: clip(x?.period, 30), from: clip(x?.from, 40) })).filter(x => x.value !== null && inReports(x.value, nums)) }; }
    case "policy_tracker": { if (!clip(f.instrument?.name)) return null;
      return { instrument: { name: clip(f.instrument.name, 100), issuer: clip(f.instrument.issuer, 60), jurisdiction: clip(f.instrument.jurisdiction, 40) },
        stages: arr(f.stages, 8).map(x => ({ stage: pick(x?.stage, ["announced", "draft", "adopted", "notified", "transition", "in_force", "under_review", "amended_or_repealed"], null), date: clip(x?.date, 30), status: pick(x?.status, ["done", "current", "next"], "next") })).filter(x => x.stage),
        obligations: arr(f.obligations, 4).map(x => ({ who: clip(x?.who, 50), what: s(x?.what, 300), from: clip(x?.from, 30) })).filter(x => x.who && x.what),
        applies_to_india: pick(f.applies_to_india, ["yes", "no", "partly"], "partly"), india_note: s(f.india_note, 360) }; }
    case "decoder": { const h = f.headline || {}; const v = numOrNull(h.value), p = numOrNull(h.previous);
      return { kind: pick(f.kind, ["release", "decision"], "release"),
        headline: clip(h.label) ? { label: clip(h.label, 60), value: inReports(v, nums) ? v : null, unit: clip(h.unit, 20), period: clip(h.period, 30), previous: inReports(p, nums) ? p : null, previousLabel: clip(h.previousLabel, 30), from: clip(h.from, 40) } : null,
        comparisons: arr(f.comparisons, 3).map(x => ({ label: clip(x?.label, 50), value: numOrNull(x?.value), unit: clip(x?.unit, 20), from: clip(x?.from, 40) })).filter(x => x.label && x.value !== null && inReports(x.value, nums)),
        drivers: arr(f.drivers, 4).map(x => ({ name: s(x?.name, 50), direction: pick(x?.direction, ["up", "down", "mixed"], "mixed"), how: s(x?.how, 260) })).filter(x => x.name),
        decision: f.decision ? { action: pick(f.decision.action, ["hike", "cut", "hold", "other"], "other"), size: clip(f.decision.size, 30), stance: s(f.decision.stance, 300) } : null }; }
    case "pass_through": { const rungs = arr(f.rungs, 5).map(x => ({ stage: s(x?.stage, 90), pass: pick(x?.pass, ["likely", "partial", "blocked", "unclear"], "unclear"), damper: s(x?.damper, 250), lag: pick(x?.lag, ["days", "weeks", "months"], "weeks") })).filter(x => x.stage);
      return rungs.length ? { driver: { variable: clip(f.driver?.variable, 50), direction: pick(f.driver?.direction, ["up", "down"], "up"), size: clip(f.driver?.size, 30) }, product: clip(f.product, 30), rungs,
        end_user: f.end_user ? { group: pick(f.end_user.group, GROUPS, ""), effect: s(f.end_user.effect, 400) } : null } : null; }
    case "winners_losers": { const groups = arr(f.groups, 6).map(x => ({ group: pick(x?.group, GROUPS, clip(x?.group, 40)), direction: pick(x?.direction, ["gain", "lose", "mixed", "unclear"], "unclear"), directness: pick(x?.directness, ["direct", "indirect"], "indirect"), mechanism: s(x?.mechanism, 350) })).filter(x => x.group && x.mechanism);
      return groups.length ? { groups, not_affected: s(f.not_affected, 350) } : null; }
    case "conflicting": { const accounts = arr(f.accounts, 6).map(x => ({ outlet: clip(x?.outlet, 40), value: clip(String(x?.value ?? ""), 80), origin: clip(x?.origin, 80), time: clip(x?.time, 40) })).filter(x => x.outlet && x.value);
      return accounts.length >= 2 ? { disputed: { item: clip(f.disputed?.item, 80), unit: clip(f.disputed?.unit, 20) }, accounts, agreed: arr(f.agreed, 4).map(x => s(x, 350)).filter(Boolean),
        explanations: arr(f.explanations, 3).map(x => ({ type: clip(x?.type, 30), note: s(x?.note, 300) })).filter(x => x.type), status: pick(f.status, ["unresolved", "converging", "resolved"], "unresolved") } : null; }
    case "timeline": { const entries = arr(f.entries, 6).map(x => ({ when: clip(x?.when, 30), what: s(x?.what, 350), actor: clip(x?.actor, 50), outlet: clip(x?.outlet, 40), type: pick(x?.type, ["action", "claim", "denial", "confirmation"], "action"), verification: pick(x?.verification, ["confirmed", "claimed", "contested"], "claimed") })).filter(x => x.what);
      return entries.length ? { entries, current_status: s(f.current_status, 400), open_questions: arr(f.open_questions, 3).map(x => s(x, 300)).filter(Boolean) } : null; }
    case "escalation": { const r = Math.round(+(f.rung ?? f.current_rung)); if (!(r >= 1 && r <= 7)) return null;
      return { move: pick(f.move, ["up", "down", "none"], "none"), rung: r, current_rung: r, previous_rung: null, development: s(f.development, 300), evidence: s(f.evidence, 400),
        next_signals: arr(f.next_signals, 3).map(x => ({ rung: Math.round(+x?.rung), signal: s(x?.signal, 300) })).filter(x => x.rung >= 1 && x.rung <= 7 && x.signal),
        india_channels: arr(f.india_channels, 6).map(x => clip(x, 30)).filter(Boolean) }; }
    case "market_move": { const m = f.moved || {}; if (!clip(m.what)) return null;
      const size = clip(m.size, 30);
      return { moved: { what: clip(m.what, 60), kind: pick(m.kind, ["share index", "sector shares", "bond yields", "other"], "other"), direction: pick(m.direction, ["up", "down", "mixed"], "mixed"), size: size && noNewNumbers(size, nums) ? size : "", period: clip(m.period, 40) },
        cause: f.cause && s(f.cause.text, 320) ? { text: s(f.cause.text, 320), status: pick(f.cause.status, ["reported", "claimed"], "claimed"), by: clip(f.cause.by, 60) } : null,
        duration: pick(f.duration, ["one_day", "multi_day", "record", "unclear"], "unclear"),
        channels: arr(f.channels, 3).map(x => ({ channel: clip(x?.channel, 30), india_link: s(x?.india_link, 350), basis: pick(x?.basis, ["reported", "inferred"], "inferred") })).filter(x => x.channel && x.india_link),
        not_settled: s(f.not_settled, 260) }; }
    case "scenarios": { const sc = arr(f.scenarios, 3).map(x => ({ name: s(x?.name, 60), what: s(x?.what, 400), signal: s(x?.signal, 300), india_effect: s(x?.india_effect, 300) })).filter(x => x.name && x.what);
      return sc.length >= 2 ? { question: s(f.question, 300), scenarios: sc } : null; }
  }
  return null;
}
// Text is never cut mid-sentence: an over-long field is trimmed back to its last complete sentence (or word).
function sentence(x, n) {
  const t = typeof x === "string" ? x.trim().replace(/\s+/g, " ") : ""; if (t.length <= n) return t;
  const cut = t.slice(0, n), end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "));
  return end > n * 0.5 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, "") + "…";
}
// Background must not bring in figures the reports do not contain: any sentence with such a number is dropped.
function noNewNumbers(text, nums) { return [...String(text).replace(/(\d),(?=\d{2,3}\b)/g, "$1").matchAll(/\d+(\.\d+)?/g)].every(m => nums.has(+m[0])); }
function cleanAnalysis(r, plan, reportText) {
  const nums = numbersIn(reportText);
  const s = (x, n) => noAdvice(str(x, n)) ? sentence(x, n) : "";
  const a = { v: ANALYSIS_V, at: new Date().toISOString(), tier: plan.tier, primary: plan.primary, complement: plan.complement || null, features: plan.features,
    exposure: r.exposure ? { level: pick(r.exposure.level, ["high", "medium", "low"], "medium"), reason: s(r.exposure.reason, 320) } : null,
    horizon: r.horizon ? { value: pick(r.horizon.value, ["now", "weeks", "months", "years"], "weeks"), reason: s(r.horizon.reason, 240) } : null,
    confidence: r.confidence ? { level: pick(r.confidence.level, ["high", "medium", "low"], "medium"), reason: s(r.confidence.reason, 240) } : null,
    outlets: new Set((plan.reports || []).map(x => x.source)).size || undefined,
    affected: arr(r.affected, 4).map(x => ({ group: pick(x?.group, GROUPS, ""), direction: pick(x?.direction, ["up", "down", "mixed", "unclear"], "unclear"), what: s(x?.what, 60), effect: s(x?.effect, 240), basis: pick(x?.basis, ["reported", "inferred"], "inferred") })).filter(x => x.group),
    watch: arr(r.watch, 3).map(x => ({ what: s(x?.what, 180), why: s(x?.why, 220), when: str(x?.when, 40), where: str(x?.where, 80) })).filter(x => x.what),
    context: arr(r.context, 3).map(x => s(x, 320)).filter(x => x && noNewNumbers(x, nums)),
    terms: arr(r.terms, 3).map(x => ({ term: str(x?.term, 60), meaning: s(x?.meaning, 240) })).filter(x => x.term && x.meaning),
    frameworks: {} };
  for (const k of [plan.primary, plan.complement].filter(Boolean)) { const f = cleanFramework(k, r[k], nums); if (f) a.frameworks[k] = f; }
  if (!a.frameworks[plan.primary]) a.frameworksMissing = true;
  if (a.frameworks.escalation && plan.war && plan.war !== "none") applyLadder(a.frameworks.escalation, plan.war, plan);
  if (plan.tier !== "quick" && plan.reading?.length) a.reading = plan.reading.map(r => ({ headline: r.headline, url: r.url, source: r.source, date: r.date }));
  if (plan.primary === "market_move" && plan.tier === "quick" && new Set((plan.reports || []).map(x => x.source)).size >= 2) a.capped = "one-day market move";
  // Rule check: High confidence needs three or more outlets (the rubric's own threshold), whatever the model said.
  if (a.confidence?.level === "high" && (a.outlets || 0) < 3) { a.confidence.level = "medium"; a.confidence.capped = true; }
  return a;
}
function reportsForPrompt(reports) {
  return reports.slice(-8).map(r => ({ outlet: OUTLETS[r.source] || r.source, date: (r.date || "").slice(0, 16), kind: r.kind || "", headline: r.headline, summary: r.summary || "", ...(r.lede ? { opening: r.lede } : {}) }));
}
const reportTextOf = reports => reports.map(r => [r.headline, r.summary, r.lede].filter(Boolean).join(" ")).join(" ");

// Plan and analyse a list of stories: [{ i, kind, reports, relevance, prev }] → Map(i → { r, plan })
async function analyseStories(list, mode, level = "core") {
  const feats = new Map();
  for (let k = 0; k < list.length; k += FEATURE_BATCH) {
    const chunk = list.slice(k, k + FEATURE_BATCH);
    const res = await callClaude(featurePrompt(chunk.map(x => ({ id: x.i, reports: reportsForPrompt(x.reports).map(({ outlet, date, headline, summary }) => ({ outlet, date, headline, summary })) }))), "filter", level);
    for (const f of res || []) if (f && Number.isInteger(+f.id)) feats.set(+f.id, Object.fromEntries(FEATURE_KEYS.map(key => [key, f[key] === true])));
  }
  const planned = list.map(x => {
    const f = feats.get(x.i) || {};
    // Sticky primary: once a story has reached Standard, keep its lens unless it is a conflict of accounts.
    const primary = (x.prev?.primary && x.prev.tier !== "quick" && !f.conflict) ? x.prev.primary : pickPrimary(f);
    const tier = tierOf({ reports: x.reports, relevance: x.relevance }, primary);
    const complement = tier === "deep" ? pickComplement(primary, f) : null;
    return { ...x, primary, complement, tier, features: Object.keys(f).filter(k => f[k]) };
  });
  // War ladder: stories read through the escalation ladder are tied to their war, and the analysis starts from the war's level.
  const atWar = planned.filter(x => [x.primary, x.complement].includes("escalation"));
  const unlinked = atWar.filter(x => !x.war || x.war === "none");
  if (unlinked.length) {
    const ids = await linkWars(unlinked.map(x => ({ key: String(x.i), reports: x.reports, headline: x.headline })), level);
    for (const x of unlinked) x.war = ids.get(String(x.i)) || "none";
  }
  const out = new Map();
  // Quick reads go to the cheaper model; standard and in-depth stories to Opus.
  for (const [job, group] of [["analysis", planned.filter(x => x.tier !== "quick")], ["analysis_quick", planned.filter(x => x.tier === "quick")]])
    for (let k = 0; k < group.length; k += ANALYSIS_CHUNK) {
      const chunk = group.slice(k, k + ANALYSIS_CHUNK);
      const res = await callClaude(analysisPrompt(chunk.map(x => ({ i: x.i, kind: x.kind, tier: x.tier, primary: x.primary, complement: x.complement, war: [x.primary, x.complement].includes("escalation") ? warForPrompt(x.war) : null, reports: reportsForPrompt(x.reports), reading: x.tier !== "quick" ? x.reading : null })), mode), job, level);
      for (const r of res || []) { const x = chunk.find(c => c.i === +r?.id); if (x) out.set(x.i, { r, plan: x }); }
    }
  return out;
}
function applyAnalysis(ev, r, plan) {
  ev.analysis = cleanAnalysis(r, plan, reportTextOf(ev.reports || []));
  if (plan.war) ev.conflict = plan.war;
  if (noAdvice(r.why) && str(r.why)) ev.why = sentence(r.why, 400);
  const imp = arr(r.implications, 4).filter(x => typeof x === "string" && noAdvice(x)).map(x => sentence(x, 320)); if (imp.length) ev.implications = imp;
}
// Existing stories: analyse those with no current analysis, or whose depth tier has risen since. Newest first.
async function reframeRecent(data, mode) {
  const kindOfEv = ev => (ev.reports || [])[0]?.kind || "hard";
  const eligible = ev => !["soft", "feature", "opinion"].includes(kindOfEv(ev)) && !["watch", "brief", "expired", "context"].includes(ev.stage);
  // Also re-analyse when the story has grown: two or more reports published after the analysis was written
  // (e.g. a trade deal first reported as import duties, later as zero-duty access for Indian exports and new visas).
  const grown = ev => !!ev.analysis?.at && (ev.reports || []).filter(r => (r.date || "") > ev.analysis.at).length >= 2;
  const stale = ev => ev.analysis?.v !== ANALYSIS_V || TIER_RANK[tierOf(ev, ev.analysis.primary)] > TIER_RANK[ev.analysis.tier] || grown(ev);
  const cut = new Date(Date.now() - REFRAME_DAYS * 864e5).toISOString();
  const all = data.sectors.flatMap(sec => sec.items).filter(ev => eligible(ev) && stale(ev) && latest(ev) >= cut).sort((a, b) => latest(b).localeCompare(latest(a)));
  const due = all.slice(0, REFRAME_LIMIT);
  // Background reading: up to 2 feature pieces (explainers, The Long Read) from the same storyline, newest first.
  const readCut = new Date(Date.now() - READING_DAYS * 864e5).toISOString();
  const features = data.sectors.flatMap(sec => sec.items).filter(ev => ev.thread && kindOfEv(ev) === "feature" && latest(ev) >= readCut);
  const readingFor = ev => !ev.thread ? [] : features.filter(x => x.thread === ev.thread && x.id !== ev.id).sort((a, b) => latest(b).localeCompare(latest(a))).slice(0, 2)
    .map(x => ({ headline: x.headline, url: x.url, source: x.source, date: x.date, summary: (x.reports || []).map(r => r.summary).find(Boolean) || "" }));
  let done = 0, failed = 0, stopped = false;
  for (let k = 0; k < due.length; k += ANALYSIS_CHUNK * 2) {
    const chunk = due.slice(k, k + ANALYSIS_CHUNK * 2);
    try {
      const res = await analyseStories(chunk.map((ev, i) => ({ i, id: ev.id, headline: ev.headline, url: ev.url, war: ev.conflict, kind: kindOfEv(ev), reports: ev.reports || [], relevance: ev.relevance, prev: ev.analysis, reading: readingFor(ev) })), mode, "extra");
      chunk.forEach((ev, i) => { const o = res.get(i); if (!o || o.r.relevant === false) return; applyAnalysis(ev, o.r, o.plan); done++; });
    } catch (e) { if (e instanceof BudgetError) { stopped = true; break; } console.error(`Framework batch failed: ${e.message}`); failed++; }
  }
  return { done, waiting: Math.max(0, all.length - done), failedBatches: failed, ...(stopped ? { budgetStopped: true } : {}) };
}

// ---------- Statistics layer: official figures behind the story, each one checked against its source ----------
// Sonnet searches ONLY official domains and then fetches the official page that holds the figures. The fetched
// page text comes back to us, so code can check every figure against it. A figure is kept only if the same number
// appears on an official page fetched (or quoted by a citation) in this answer; short numbers must also sit near
// their year. A series needs at least 3 checked figures to be shown.
const STATS_V = 2;              // v2: verify against fetched page text, not only the short citation snippets
const STATS_LIMIT = 4;          // stories per desk per run that get statistics (searched or reused)
const STATS_LIBRARY = "data/stats-library.json";   // every checked series found so far, shared by both desks
const LIBRARY_MAX = 300, LIBRARY_FRESH_DAYS = 45;  // reused only while recent enough
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
      needBudget("stats", turn ? EST.stats / 2 : EST.stats);
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 3000, messages, tools: [
          { type: "web_search_20250305", name: "web_search", max_uses: 3, allowed_domains: OFFICIAL_DOMAINS },
          { type: "web_fetch_20250910", name: "web_fetch", max_uses: 2, allowed_domains: OFFICIAL_DOMAINS, max_content_tokens: 10000 }
        ] })
      });
      body = await res.json().catch(() => ({}));
      if (!res.ok) break;
      const u = usage.stats ||= { model, calls: 0, inputTokens: 0, outputTokens: 0, searches: 0, fetches: 0 };
      u.model = model; u.calls++; u.inputTokens += body.usage?.input_tokens || 0; u.outputTokens += body.usage?.output_tokens || 0;
      u.searches += body.usage?.server_tool_use?.web_search_requests || 0;
      u.fetches = (u.fetches || 0) + (body.usage?.server_tool_use?.web_fetch_requests || 0);
      charge("stats", model, body.usage);
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
      s.points.push({ period: sentence(f[1], 40), value: pat.value, url: hit.url, source: str(hit.title || domainOf(hit.url), 120) });
    }
  }
  // Every figure can be on the page and the series still be wrong if it mixes units (e.g. 50,000 barrels a day next to
  // 1.7 million). Values more than 100 times apart within one series are treated as mixed units and the series is dropped.
  const sameUnits = x => { const v = x.points.map(p => Math.abs(p.value)).filter(Boolean); return v.length < 2 || Math.max(...v) / Math.min(...v) <= 100; };
  // A daily series that moves more than 15% in one day has almost always mixed two columns of a table: drop it too.
  const steady = x => !dailyJump(x);
  let mixed = 0;
  const kept = series.map(x => ({ ...x, points: x.points.slice(0, 16) })).filter(x => x.points.length >= STATS_MIN_POINTS)
    .filter(x => (sameUnits(x) && steady(x)) || (mixed++, false)).slice(0, 2)
    .map(({ source, ...x }) => { const doms = {}; x.points.forEach(p => { const d = domainOf(p.url); doms[d] = (doms[d] || 0) + 1; });
      return { ...x, sources: [...new Map(x.points.map(p => [p.url, { url: p.url, title: p.source, domain: domainOf(p.url) }])).values()].slice(0, 4), domains: Object.keys(doms) }; });
  if (diag.said === "series" && !kept.length) diag.said = mixed ? "units did not match" : diag.kept ? "too few checked figures" : "no figure found on an official page";
  return { series: kept, diag };
}
// ---- Series library: a checked series found for one story is saved and offered to later stories on the same subject.
// A cheap model decides whether a saved series directly measures the new story; only if none fits do we search.
const seriesKey = x => (x.title + "|" + x.unit).toLowerCase().replace(/\s+/g, " ");
function dailyJump(x) { const pts = x.points || []; if (!pts.length || !pts.every(p => /^\d{1,2} [A-Z][a-z]{2} \d{4}$/.test(String(p.period)))) return false;
  for (let i = 1; i < pts.length; i++) { const a = +pts[i - 1].value, b = +pts[i].value; if (a > 0 && b > 0 && (b / a > 1.15 || a / b > 1.15)) return true; } return false; }
async function loadLibrary() { return ((await readJson(STATS_LIBRARY, { series: [] })).series || []).filter(x => !dailyJump(x)); }
async function saveLibrary(lib) { await fs.writeFile(STATS_LIBRARY, JSON.stringify({ updatedAt: new Date().toISOString(), series: lib.slice(0, LIBRARY_MAX) }, null, 1) + "\n"); }
function addToLibrary(lib, series, ev, at = new Date().toISOString()) {
  for (const x of series) {
    const key = seriesKey(x), i = lib.findIndex(y => y.key === key);
    const entry = { key, title: x.title, unit: x.unit, publisher: x.publisher, points: x.points, sources: x.sources, domains: x.domains, dropped: x.dropped || 0, at, firstFor: str(ev.headline, 100) };
    if (i >= 0) lib.splice(i, 1);
    lib.unshift(entry);
  }
}
function reusePrompt(ev, options) {
  return `A news story and a list of official statistical series already on file. Pick a series ONLY if it directly measures what this story is about (same country or flow, same subject); a loosely related series is not enough.

STORY
Headline: ${ev.headline}
Bottom line: ${ev.why || ""}

SERIES ON FILE
${options.map((x, i) => `${i}. ${x.title} (${x.unit}; ${x.publisher})`).join("\n")}

Return ONLY a JSON array with one object: [{"use":[<up to 2 numbers from the list>],"why":"one sentence without numbers on how the series relates to this story"}] or [{"use":[]}] if none fits.`;
}
async function reuseFromLibrary(ev, lib) {
  const cut = new Date(Date.now() - LIBRARY_FRESH_DAYS * 864e5).toISOString();
  const options = lib.filter(x => x.at >= cut).slice(0, 80);
  if (!options.length) return null;
  const res = await callClaude(reusePrompt(ev, options), "filter", "stats");
  const pick = res?.[0]; const ids = arr(pick?.use, 2).map(Number).filter(i => Number.isInteger(i) && options[i]);
  if (!ids.length) return null;
  const why = typeof pick.why === "string" && noAdvice(pick.why) && !/\d{2,}/.test(pick.why) ? str(pick.why, 200) : "";
  return ids.map(i => { const { key, at, firstFor, ...x } = options[i]; return { ...x, why, reused: true, checkedAt: at }; });
}
// In-depth stories (and standard stories with high exposure) get statistics once, newest first: a saved series if one
// fits, otherwise a search. Results are kept with the story.
async function addStatistics(data, mode) {
  const want = ev => ev.analysis?.v >= 2 && (ev.analysis.tier === "deep" || (ev.analysis.tier === "standard" && ev.analysis.exposure?.level === "high"));
  const due = data.sectors.flatMap(sec => sec.items).filter(ev => want(ev) && (ev.stats?.v !== STATS_V || (ev.stats.reuseOnly && ev.analysis.tier === "deep")))
    .sort((a, b) => latest(b).localeCompare(latest(a))).slice(0, STATS_LIMIT);
  const lib = await loadLibrary(); let changed = false;
  // First run with the library: seed it with the charts already on the desk.
  for (const ev of data.sectors.flatMap(sec => sec.items)) if (ev.stats?.series?.length && !ev.stats.series.some(x => x.reused) && !ev.stats.series.every(x => lib.some(y => y.key === seriesKey(x)))) { addToLibrary(lib, ev.stats.series, ev, ev.stats.at); changed = true; }
  let found = 0, reused = 0, none = 0, failed = 0, droppedPoints = 0, proposed = 0, pagesFetched = 0, stopped = false; const samples = [];
  for (const ev of due) {
    if (failed >= 2 && !found && !none && !reused) break;   // search unavailable (e.g. disabled for the organisation): stop, retry next run
    try {
      const again = await reuseFromLibrary(ev, lib);
      if (again) { ev.stats = { v: STATS_V, at: new Date().toISOString(), series: again }; reused++; samples.push({ headline: str(ev.headline, 80), result: "reused saved series" }); continue; }
      // New web searches cost the most, so they are kept for in-depth stories (decision 20 Oct). A standard story with
      // nothing suitable on file is marked done without a search; it gets a fresh look if it later turns in-depth.
      if (ev.analysis.tier !== "deep") { ev.stats = { v: STATS_V, at: new Date().toISOString(), series: [], reuseOnly: true }; none++; samples.push({ headline: str(ev.headline, 80), result: "no saved series; search kept for in-depth stories" }); continue; }
      const { series, diag } = parseStats(await callStats(statsPrompt(ev, mode)));
      ev.stats = { v: STATS_V, at: new Date().toISOString(), series };
      if (series.length) { found++; addToLibrary(lib, series, ev); } else none++;
      droppedPoints += diag.notFound; proposed += diag.proposed; pagesFetched += diag.pagesFetched;
      samples.push({ headline: str(ev.headline, 80), result: series.length ? "chart" : diag.said, proposed: diag.proposed, checked: diag.kept, pagesFetched: diag.pagesFetched });
    } catch (e) { if (e instanceof BudgetError) { stopped = true; break; } console.error(`Statistics for "${ev.headline}" failed: ${e.message}`); failed++; }
  }
  if (found || changed) await saveLibrary(lib);
  return { searched: due.length, found, reused, none, failed, proposed, droppedPoints, pagesFetched, samples, ...(stopped ? { budgetStopped: true } : {}) };
}

// ---------- Calendar: officially scheduled dates (rate decisions, data releases, earnings, summits) ----------
// Sonnet searches only each organisation's own site, fetches the page that lists its dates, and copies them. Code
// keeps a date only if it appears on a fetched official page (or an official citation), so no date is guessed.
// Each group of organisations is refreshed once a week (a few groups per run, so the cost is spread out). The site
// links events to stories by the keywords below, and data/calendar.ics is a feed people can subscribe to in Google,
// Apple or Outlook calendars; it updates itself as the engine adds or moves dates.
const CALENDAR_JOB = (process.env.CALENDAR_JOB || "off").toLowerCase() === "on";   // off while the calendar is hidden on the site (20 Oct)
const CALENDAR_FILE = "data/calendar.json";
const CAL_REFRESH_DAYS = 7;       // each group is re-checked weekly
const CAL_GROUPS_PER_RUN = 1;     // one group per run: the eight groups are spread over about a day, never all at once
const CAL_MAX_SHARE = 0.4;        // the calendar runs only while less than 40% of the day's budget is spent, so news always comes first
const CAL_AHEAD_DAYS = 150;       // dates kept up to five months ahead
const CAL_KEEP_PAST_DAYS = 2;     // a date stays on the site for two days after it passes
const CAL_GROUPS = [
  { id: "india-macro", name: "India: RBI, data and budget", domains: ["rbi.org.in", "mospi.gov.in", "pib.gov.in", "gstcouncil.gov.in", "indiabudget.gov.in"], series: [
    { id: "rbi-mpc", ask: "Reserve Bank of India Monetary Policy Committee meetings: the day each policy decision is announced", title: "RBI monetary policy decision", publisher: "Reserve Bank of India", sectors: ["economy"],
      key: ["rbi", "reserve bank", "repo rate", "repo", "monetary policy", "mpc"], topic: ["interest rate", "interest rates", "rate cut", "rate hike", "inflation", "emi", "emis", "home loan", "loans", "deposit rates", "rupee", "liquidity"],
      why: "The RBI's rate decision feeds into loan EMIs, deposit rates and the rupee." },
    { id: "in-cpi", ask: "India Consumer Price Index (CPI) monthly inflation release dates from MoSPI / NSO", title: "India retail inflation (CPI) data", publisher: "Ministry of Statistics (MoSPI)", sectors: ["economy", "agriculture"],
      key: ["retail inflation", "consumer price index", "cpi"], topic: ["inflation", "food prices", "food inflation", "vegetable prices"],
      why: "Shows how fast everyday prices are rising; the RBI watches it when setting rates." },
    { id: "in-gdp", ask: "India quarterly GDP estimate release dates from MoSPI / NSO", title: "India GDP growth estimate", publisher: "Ministry of Statistics (MoSPI)", sectors: ["economy"],
      key: ["gdp", "gross domestic product", "economic growth"], topic: ["growth rate", "slowdown", "recession"],
      why: "The official read on how fast India's economy is growing." },
    { id: "gst-council", ask: "GST Council meetings that have been officially announced", title: "GST Council meeting", publisher: "GST Council", sectors: ["governance", "economy"],
      key: ["gst", "goods and services tax", "gst council"], topic: ["tax rates", "indirect tax"],
      why: "The Council sets GST rates, which change the prices of goods and services." },
    { id: "in-budget", ask: "The date of the next Union Budget presentation in Parliament, if officially announced", title: "Union Budget presented", publisher: "Ministry of Finance", sectors: ["governance", "economy"],
      key: ["union budget", "budget"], topic: ["fiscal deficit", "income tax", "subsidy", "subsidies", "public spending"],
      why: "Sets taxes, subsidies and public spending for the coming year." }
  ] },
  { id: "us-macro", name: "United States: Federal Reserve and data", domains: ["federalreserve.gov", "bls.gov", "bea.gov"], series: [
    { id: "fomc", ask: "Federal Reserve FOMC meetings: the day each rate decision is announced", title: "US Federal Reserve rate decision", publisher: "Federal Reserve", sectors: ["economy"],
      key: ["federal reserve", "fed", "fomc", "powell", "us interest rates"], topic: ["interest rate", "interest rates", "dollar", "treasury yields", "bond yields", "rupee", "capital flows", "foreign investors"],
      why: "US rates move the dollar and global money flows, which reach the rupee and Indian markets." },
    { id: "us-cpi", ask: "US Consumer Price Index (CPI) release dates from the Bureau of Labor Statistics", title: "US inflation (CPI) data", publisher: "US Bureau of Labor Statistics", sectors: ["economy"],
      key: ["us inflation", "american inflation", "consumer price index"], topic: ["inflation", "federal reserve", "fed", "dollar"],
      why: "US inflation shapes the Fed's next move and so the dollar." },
    { id: "us-jobs", ask: "US Employment Situation (monthly jobs report) release dates from the Bureau of Labor Statistics", title: "US jobs report", publisher: "US Bureau of Labor Statistics", sectors: ["economy"],
      key: ["jobs report", "payrolls", "us employment", "us unemployment", "us labour market", "us labor market"], topic: ["federal reserve", "fed", "us economy", "recession"],
      why: "A key test of the US economy that markets and the Fed react to." }
  ] },
  { id: "central-banks", name: "Other central banks", domains: ["ecb.europa.eu", "bankofengland.co.uk", "boj.or.jp", "pbc.gov.cn"], series: [
    { id: "ecb", ask: "European Central Bank monetary policy meetings: the day each decision is announced", title: "European Central Bank rate decision", publisher: "European Central Bank", sectors: ["economy"],
      key: ["european central bank", "ecb", "eurozone", "euro area"], topic: ["euro", "europe", "eu economy", "interest rates"],
      why: "Euro-area rates affect demand for Indian exports to Europe and the euro–rupee rate." },
    { id: "boe", ask: "Bank of England Monetary Policy Committee announcement dates", title: "Bank of England rate decision", publisher: "Bank of England", sectors: ["economy"],
      key: ["bank of england", "boe"], topic: ["pound", "sterling", "uk economy", "britain", "interest rates"],
      why: "UK rates affect the pound and trade with one of India's larger partners." },
    { id: "boj", ask: "Bank of Japan monetary policy meetings: the day each decision is announced", title: "Bank of Japan rate decision", publisher: "Bank of Japan", sectors: ["economy"],
      key: ["bank of japan", "boj"], topic: ["yen", "japan", "carry trade", "interest rates"],
      why: "Japanese rates move the yen and global money flows into emerging markets like India." }
  ] },
  { id: "energy", name: "Oil and energy", domains: ["opec.org", "iea.org", "eia.gov"], series: [
    { id: "opec", ask: "OPEC and OPEC+ ministerial meetings and Joint Ministerial Monitoring Committee (JMMC) meetings", title: "OPEC+ meeting on oil output", publisher: "OPEC", sectors: ["energy"],
      key: ["opec", "opec+", "oil output", "oil production", "crude oil", "crude"], topic: ["oil", "oil prices", "fuel prices", "petrol", "diesel", "saudi arabia", "brent"],
      why: "OPEC+ output decisions move crude prices, which feed into India's fuel prices and import bill." },
    { id: "iea-omr", ask: "IEA Oil Market Report publication dates", title: "IEA Oil Market Report", publisher: "International Energy Agency", sectors: ["energy"],
      key: ["iea", "international energy agency", "oil demand", "oil supply"], topic: ["oil", "crude", "oil prices"],
      why: "The IEA's monthly view of world oil supply and demand." },
    { id: "eia-steo", ask: "EIA Short-Term Energy Outlook release dates", title: "US EIA Short-Term Energy Outlook", publisher: "US Energy Information Administration", sectors: ["energy"],
      key: ["eia", "energy information administration", "oil price forecast"], topic: ["oil", "crude", "natural gas", "lng", "oil prices"],
      why: "The US government's forecast for oil and gas prices." }
  ] },
  { id: "chip-earnings", name: "Chips and AI: results dates", domains: ["nvidia.com", "tsmc.com", "amd.com", "asml.com"], series: [
    { id: "nvidia", ask: "NVIDIA's next quarterly financial results date (investor relations announcement)", title: "Nvidia quarterly results", publisher: "NVIDIA", sectors: ["technology"],
      key: ["nvidia", "gpu", "gpus", "ai chips", "ai chip"], topic: ["semiconductor", "semiconductors", "chip", "chips", "artificial intelligence", "ai", "data centre", "data centres", "data center", "data centers"],
      why: "Nvidia's results are read as a gauge of worldwide AI and chip demand." },
    { id: "tsmc", ask: "TSMC's next quarterly earnings conference date (investor relations)", title: "TSMC quarterly results", publisher: "TSMC", sectors: ["technology", "manufacturing"],
      key: ["tsmc", "taiwan semiconductor"], topic: ["semiconductor", "semiconductors", "chip", "chips", "foundry", "taiwan", "electronics"],
      why: "TSMC makes most of the world's advanced chips; its outlook signals chip supply and demand." },
    { id: "amd", ask: "AMD's next quarterly financial results date (investor relations)", title: "AMD quarterly results", publisher: "AMD", sectors: ["technology"],
      key: ["amd", "advanced micro devices"], topic: ["semiconductor", "semiconductors", "chip", "chips", "ai", "data centre", "data center"],
      why: "A second read on AI and computer-chip demand." },
    { id: "asml", ask: "ASML's next quarterly results date (investor relations)", title: "ASML quarterly results", publisher: "ASML", sectors: ["technology", "manufacturing"],
      key: ["asml", "chipmaking equipment", "lithography"], topic: ["semiconductor", "semiconductors", "chip", "chips", "fab", "export controls"],
      why: "ASML supplies the machines every chip factory needs; its orders show where chipmaking is heading." }
  ] },
  { id: "bigtech-earnings", name: "Big Tech: results dates", domains: ["microsoft.com", "abc.xyz", "apple.com", "aboutamazon.com", "atmeta.com"], series: [
    { id: "microsoft", ask: "Microsoft's next quarterly earnings release date (investor relations)", title: "Microsoft quarterly results", publisher: "Microsoft", sectors: ["technology"],
      key: ["microsoft", "azure", "openai"], topic: ["cloud", "ai", "artificial intelligence", "software", "it services", "data centre", "data center"],
      why: "Shows how much companies are spending on cloud and AI, which drives demand for IT services." },
    { id: "alphabet", ask: "Alphabet (Google) next quarterly earnings date (investor relations)", title: "Alphabet (Google) quarterly results", publisher: "Alphabet", sectors: ["technology"],
      key: ["alphabet", "google", "youtube", "gemini"], topic: ["ai", "artificial intelligence", "cloud", "digital advertising", "search engine"],
      why: "A read on digital advertising and AI spending." },
    { id: "apple", ask: "Apple's next quarterly results date (investor relations)", title: "Apple quarterly results", publisher: "Apple", sectors: ["technology", "manufacturing"],
      key: ["apple", "iphone", "iphones"], topic: ["smartphone", "smartphones", "foxconn", "electronics manufacturing", "electronics exports", "pli"],
      why: "Apple's iPhone production in India makes its results relevant to Indian electronics exports." },
    { id: "amazon", ask: "Amazon's next quarterly results date (investor relations)", title: "Amazon quarterly results", publisher: "Amazon", sectors: ["technology"],
      key: ["amazon", "aws"], topic: ["e-commerce", "ecommerce", "cloud", "online retail"],
      why: "A read on online shopping and cloud spending." },
    { id: "meta", ask: "Meta Platforms' next quarterly results date (investor relations)", title: "Meta quarterly results", publisher: "Meta", sectors: ["technology"],
      key: ["meta", "facebook", "instagram", "whatsapp"], topic: ["social media", "ai", "artificial intelligence", "digital advertising"],
      why: "A read on digital advertising and AI spending; India is among Meta's biggest user bases." }
  ] },
  { id: "india-earnings", name: "Indian companies: results dates", domains: ["ril.com", "tcs.com", "infosys.com", "hdfcbank.com", "wipro.com", "hcltech.com", "bseindia.com"], series: [
    { id: "reliance", ask: "Reliance Industries' next board meeting to approve quarterly results", title: "Reliance Industries quarterly results", publisher: "Reliance Industries", sectors: ["energy", "economy"],
      key: ["reliance industries", "reliance", "jio", "ril"], topic: ["refining", "telecom", "petrochemicals"],
      why: "India's largest company by market value; its results span fuel, telecom and retail." },
    { id: "tcs", ask: "TCS (Tata Consultancy Services) next quarterly results date", title: "TCS quarterly results", publisher: "Tata Consultancy Services", sectors: ["technology"],
      key: ["tcs", "tata consultancy"], topic: ["it services", "outsourcing", "h-1b", "it jobs", "hiring"],
      why: "The first read each quarter on demand for Indian IT services and hiring." },
    { id: "infosys", ask: "Infosys next quarterly results date", title: "Infosys quarterly results", publisher: "Infosys", sectors: ["technology"],
      key: ["infosys"], topic: ["it services", "outsourcing", "h-1b", "it jobs", "hiring"],
      why: "A bellwether for Indian IT services demand and hiring." },
    { id: "hdfcbank", ask: "HDFC Bank next quarterly results date", title: "HDFC Bank quarterly results", publisher: "HDFC Bank", sectors: ["economy"],
      key: ["hdfc bank", "hdfc"], topic: ["banks", "lending", "loans", "deposits", "credit growth"],
      why: "India's largest private bank; a read on lending, deposits and loan quality." },
    { id: "wipro", ask: "Wipro next quarterly results date", title: "Wipro quarterly results", publisher: "Wipro", sectors: ["technology"],
      key: ["wipro"], topic: ["it services", "outsourcing", "it jobs"], why: "Another read on Indian IT services demand." },
    { id: "hcltech", ask: "HCLTech next quarterly results date", title: "HCLTech quarterly results", publisher: "HCLTech", sectors: ["technology"],
      key: ["hcltech", "hcl technologies", "hcl"], topic: ["it services", "outsourcing", "it jobs"], why: "Another read on Indian IT services demand." }
  ] },
  { id: "global-meetings", name: "Summits and global meetings", domains: ["unfccc.int", "imf.org", "worldbank.org", "wto.org", "un.org", "g20.org", "brics.br"], series: [
    { id: "cop", ask: "The next UN Climate Change Conference (COP) dates", title: "UN climate summit (COP)", publisher: "UNFCCC", sectors: ["environment"],
      key: ["cop31", "cop 31", "cop", "climate summit", "unfccc", "climate talks"], topic: ["climate", "emissions", "carbon", "climate finance", "net zero", "coal"],
      why: "Climate deals shape India's emission commitments, carbon border taxes and climate finance." },
    { id: "g20", ask: "The next G20 Leaders' Summit dates", title: "G20 leaders' summit", publisher: "G20", sectors: ["governance", "economy"],
      key: ["g20", "g-20"], topic: ["global economy", "debt", "world leaders"],
      why: "Where the largest economies, India included, negotiate trade, debt and finance." },
    { id: "imf-wb", ask: "IMF and World Bank Annual or Spring Meetings dates, and the next IMF World Economic Outlook release", title: "IMF / World Bank meetings", publisher: "IMF", sectors: ["economy"],
      key: ["imf", "international monetary fund", "world bank", "world economic outlook"], topic: ["global growth", "debt", "global economy", "recession"],
      why: "Global growth forecasts and lending decisions that frame India's outlook." },
    { id: "wto", ask: "WTO General Council or Ministerial Conference dates", title: "WTO meeting", publisher: "World Trade Organization", sectors: ["economy", "governance"],
      key: ["wto", "world trade organization"], topic: ["tariff", "tariffs", "trade rules", "trade dispute", "fisheries subsidies"],
      why: "Global trade rules that cover India's exports and farm subsidies." }
  ] }
];
const CAL_SERIES = Object.fromEntries(CAL_GROUPS.flatMap(g => g.series.map(s => [s.id, { ...s, group: g.id }])));

const isoDay = d => new Date(d).toISOString().slice(0, 10);
const addDays = (iso, n) => isoDay(Date.parse(iso + "T00:00:00Z") + n * 864e5);
const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

// Is this date written on the page? Accepts "November 19, 2026", "Nov. 19", "19 November", "18–19 November",
// "November 18-19", "2026-11-19", "19/11/2026", "11/19/2026", "19.11.2026". A date written without its year must have
// the year close by (a schedule page usually has the year as a heading above the list).
function dateOnPage(text, iso) {
  const [y, m, d] = iso.split("-").map(Number); const t = String(text);
  const mon = MONTH_NAMES[m - 1], ab = mon.slice(0, 3) + (m === 9 ? "t?" : "");
  const monPat = `(?:${mon}|${ab}\\.?)`, day = `0?${d}(?:st|nd|rd|th)?`;
  const numeric = [new RegExp(`\\b${y}-0?${m}-0?${d}\\b`), new RegExp(`\\b0?${d}[/.]0?${m}[/.]${y}\\b`), new RegExp(`\\b0?${m}/0?${d}/${y}\\b`)];
  if (numeric.some(r => r.test(t))) return true;
  const worded = [
    new RegExp(`\\b${monPat}\\s+(?:\\d{1,2}(?:st|nd|rd|th)?\\s*(?:-|–|—|to|and|&)\\s*)?${day}\\b`, "gi"),
    new RegExp(`\\b${day}(?:\\s*(?:-|–|—|to|and|&)\\s*\\d{1,2}(?:st|nd|rd|th)?)?\\s+(?:of\\s+)?${monPat}(?![a-z])`, "gi")
  ];
  for (const r of worded) { let x; while ((x = r.exec(t))) { const near = t.slice(Math.max(0, x.index - 4000), x.index + 400); if (near.includes(String(y))) return true; } }
  return false;
}
function pagesFrom(content, domains) {
  const ok = u => { const h = domainOf(u); return !!h && domains.some(d => h === d || h.endsWith("." + d)); };
  const pages = [];
  for (const b of content) {
    if (b.type !== "web_fetch_tool_result" || b.content?.type !== "web_fetch_result") continue;
    const doc = b.content.content;
    if (ok(b.content.url) && doc?.source?.type === "text" && doc.source.data) pages.push({ url: b.content.url, title: doc.title || domainOf(b.content.url), text: String(doc.source.data) });
  }
  return { pages, ok };
}

function calendarPrompt(group, today, until) {
  return `You keep the calendar of dates to watch for a news product whose readers are in India. Today is ${today}.

TASK
Find the officially scheduled dates between ${today} and ${until} for each item below. Search only the organisations' own websites.
${group.series.map(s => `- ${s.id}: ${s.ask}`).join("\n")}

HOW
1. Search for the organisation's own schedule, calendar or investor-events page.
2. FETCH the page that lists the dates. Use an HTML page; open a PDF only if no web page lists the dates, and never a long report.
3. Copy each date from that page, and quote the line of the page that shows it. Every date is checked automatically against the fetched page, and dates not found there are thrown away.
Only dates the organisation itself has announced. Never estimate a date from a past pattern ("usually mid-month") and never use news reports. If an item has no announced date in the period, leave it out.
For a policy meeting that runs several days, give the day the decision is announced. For a summit or conference, give its first day and its last day.

ANSWER FORMAT (one line per date, nothing else):
EVENT|<id from the list>|<start date YYYY-MM-DD>|<last day YYYY-MM-DD for a multi-day summit, else empty>|<time with time zone as written on the page, or empty>|<URL of the fetched page the date is on>|<short label from the page if useful, e.g. "Q3 FY2027", or empty>
If nothing is announced for any item, answer only: NONE`;
}
let lastCalCost = 0, lastCalIn = 0;
async function callCalendar(group, prompt) {
  let lastErr;
  for (const model of MODELS.stats) {
    const messages = [{ role: "user", content: prompt }]; const out = []; let res, body;
    for (let turn = 0; turn < 2; turn++) {
      needBudget("extra", turn ? EST.calendar / 2 : EST.calendar);
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 2500, messages, tools: [
          { type: "web_search_20250305", name: "web_search", max_uses: 4, allowed_domains: group.domains },
          // PDFs come back whole (the token limit only trims web pages), so fetches are capped at three. Citations are on so that a
          // date the model quotes from a PDF can still be checked against the quoted text.
          { type: "web_fetch_20250910", name: "web_fetch", max_uses: 3, allowed_domains: group.domains, max_content_tokens: 5000, citations: { enabled: true } }
        ] })
      });
      body = await res.json().catch(() => ({}));
      if (!res.ok) break;
      const u = usage.calendar ||= { model, calls: 0, inputTokens: 0, outputTokens: 0, searches: 0, fetches: 0 };
      u.model = model; u.calls++; u.inputTokens += body.usage?.input_tokens || 0; u.outputTokens += body.usage?.output_tokens || 0;
      u.searches += body.usage?.server_tool_use?.web_search_requests || 0; u.fetches += body.usage?.server_tool_use?.web_fetch_requests || 0;
      lastCalCost += charge("calendar", model, body.usage); lastCalIn += body.usage?.input_tokens || 0;
      out.push(...(body.content || []));
      if (body.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: body.content });
    }
    if (res.ok) return out;
    lastErr = new Error(`Claude API ${res.status} (${model}, calendar): ${body?.error?.message || "unknown error"}`);
    if (!(res.status === 404 || (res.status === 400 && /model/i.test(body?.error?.message || "")))) break;
  }
  throw lastErr;
}
// Lines of the answer with their citations. Web-search citations carry a url; web-fetch citations (char_location) point to
// the fetched document by its position, so they are mapped back to that fetch's url.
function calendarLines(content) {
  const fetched = content.filter(b => b.type === "web_fetch_tool_result").map(b => b.content?.url || "");
  return linesWithCitations(content.map(b => b.type !== "text" ? b : { ...b, citations: (b.citations || []).map(c => c.url ? c : { ...c, url: fetched[c.document_index] || "", title: c.document_title || "" }) }));
}
function parseCalendar(group, content, today, until) {
  const { pages, ok } = pagesFrom(content, group.domains);
  const rejected = [];
  const ids = new Set(group.series.map(s => s.id)); const events = []; const diag = { proposed: 0, kept: 0, notFound: 0, outOfRange: 0, pagesFetched: pages.length };
  for (const { text, cites } of calendarLines(content)) {
    const f = text.split("|").map(x => x.trim());
    if (f[0] !== "EVENT") continue;
    diag.proposed++;
    const sid = f[1], date = f[2], end = /^\d{4}-\d{2}-\d{2}$/.test(f[3] || "") ? f[3] : "", url = f[5] || "";
    if (!ids.has(sid) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) { diag.notFound++; continue; }
    if (date < addDays(today, -CAL_KEEP_PAST_DAYS) || date > until) { diag.outOfRange++; continue; }
    const ordered = [...pages.filter(p => p.url === url), ...pages.filter(p => p.url !== url)];
    let hit = ordered.find(p => dateOnPage(p.text, date));
    if (!hit) { const c = cites.find(c => ok(c.url) && dateOnPage(c.cited_text, date)); if (c) hit = { url: c.url, title: c.title || domainOf(c.url) }; }
    if (!hit) { diag.notFound++; if (rejected.length < 4) rejected.push(str(text, 160)); continue; }
    const s = CAL_SERIES[sid], endOk = end && end > date && end <= addDays(date, 21) && ordered.some(p => dateOnPage(p.text, end)) ? end : "";
    const label = str(f[6] || "", 30).replace(/[|<>]/g, "");
    diag.kept++;
    events.push({ id: `${sid}-${date}`, series: sid, group: group.id, title: s.title + (label && !/^(empty|none|n\/a)$/i.test(label) ? ` (${label})` : ""), date, ...(endOk ? { end: endOk } : {}),
      ...(f[4] && !/^(empty|none|n\/a)$/i.test(f[4]) ? { time: str(f[4], 40) } : {}), publisher: s.publisher, sectors: s.sectors, key: s.key, topic: s.topic, why: s.why,
      source: { url: hit.url, title: str(hit.title || domainOf(hit.url), 100), domain: domainOf(hit.url) }, checkedAt: new Date().toISOString() });
  }
  const seen = new Set();
  const pdfs = content.filter(b => b.type === "web_fetch_tool_result" && b.content?.content?.source?.type === "base64").length;
  return { events: events.filter(e => !seen.has(e.id) && seen.add(e.id)).sort((a, b) => a.date.localeCompare(b.date)), diag: { ...diag, pdfsFetched: pdfs, ...(rejected.length ? { rejectedSamples: rejected } : {}) } };
}

// ---- iCalendar feed (RFC 5545): one for everything and one per sector
function icsEscape(s) { return String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
function icsFold(line) { const out = []; let cur = ""; for (const ch of line) { if (Buffer.byteLength(cur + ch) > 74) { out.push(cur); cur = " " + ch; } else cur += ch; } out.push(cur); return out.join("\r\n"); }
function siteUrl() { const [o, r] = String(process.env.GITHUB_REPOSITORY || "mukul99vashist-sudo/intelligence-engine").split("/"); return `https://${o}.github.io/${r}/`; }
function buildIcs(events, name) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//The Connect//Dates to watch//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(name)}`, "X-WR-CALDESC:Officially scheduled dates behind the news: rate decisions\\, data releases\\, results and summits.",
    "REFRESH-INTERVAL;VALUE=DURATION:PT12H", "X-PUBLISHED-TTL:PT12H"];
  for (const e of events) {
    const endEx = addDays(e.end || e.date, 1).replace(/-/g, "");
    const desc = [e.why, e.time ? `Time: ${e.time}` : "", `Official source: ${e.source.url}`, `Stories and analysis: ${siteUrl()}`].filter(Boolean).join("\n\n");
    lines.push("BEGIN:VEVENT", `UID:${e.id}@the-connect`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${e.date.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${endEx}`,
      `SUMMARY:${icsEscape(e.title)}`, `DESCRIPTION:${icsEscape(desc)}`, `URL:${e.source.url}`, "TRANSP:TRANSPARENT",
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(e.title)}`, "TRIGGER:-PT15H", "END:VALARM", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(icsFold).join("\r\n") + "\r\n";
}
async function writeIfChanged(path, text) { let old = null; try { old = await fs.readFile(path, "utf8"); } catch {} if (old !== text) { await fs.writeFile(path, text); return true; } return false; }

async function refreshCalendar() {
  const cal = await readJson(CALENDAR_FILE, { groups: {}, events: [] });
  cal.groups ||= {}; cal.events ||= [];
  const today = indiaDay(), until = addDays(today, CAL_AHEAD_DAYS), staleBefore = new Date(Date.now() - CAL_REFRESH_DAYS * 864e5).toISOString();
  const due = CAL_GROUPS.filter(g => !(cal.groups[g.id]?.checkedAt > staleBefore))
    .sort((a, b) => String(cal.groups[a.id]?.checkedAt || "").localeCompare(String(cal.groups[b.id]?.checkedAt || ""))).slice(0, CAL_GROUPS_PER_RUN);
  const run = { at: new Date().toISOString(), groups: [] }; usage = {};
  if (due.length && budget && budget.spent > DAILY_BUDGET * CAL_MAX_SHARE) { run.skipped = "over 40% of today's budget already spent; checked in a later run"; due.length = 0; }
  for (const g of due) {
    try {
      lastCalCost = 0; lastCalIn = 0;
      const { events, diag: d0 } = parseCalendar(g, await callCalendar(g, calendarPrompt(g, today, until)), today, until);
      const diag = { ...d0, cost: Math.round(lastCalCost * 1e4) / 1e4, inputTokens: lastCalIn };
      // Replace a series' dates only when this check found dates for it; otherwise keep what we had.
      const found = new Set(events.map(e => e.series));
      cal.events = [...cal.events.filter(e => !found.has(e.series)), ...events];
      cal.groups[g.id] = { name: g.name, checkedAt: new Date().toISOString(), ...diag };
      run.groups.push({ id: g.id, ...diag });
    } catch (e) {
      if (e instanceof BudgetError) { run.budgetStopped = true; break; }
      console.error(`Calendar ${g.id} failed: ${e.message}`); run.groups.push({ id: g.id, error: str(e.message, 160) });
      cal.groups[g.id] = { ...(cal.groups[g.id] || {}), name: g.name, failedAt: new Date().toISOString() };
    }
  }
  // Drop past dates and dates for series no longer on the list; refresh the static fields from the definitions.
  const keepFrom = addDays(today, -CAL_KEEP_PAST_DAYS);
  cal.events = cal.events.filter(e => CAL_SERIES[e.series] && (e.end || e.date) >= keepFrom)
    .map(e => { const s = CAL_SERIES[e.series]; return { ...e, publisher: s.publisher, sectors: s.sectors, key: s.key, topic: s.topic, why: s.why }; })
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  cal.schema = 1; cal.feed = "data/calendar.ics";
  cal.sectorFeeds = Object.fromEntries(SECTORS.filter(s => cal.events.some(e => e.sectors.includes(s.id))).map(s => [s.id, `data/calendar-${s.id}.ics`]));
  if (due.length) { cal.lastRun = { ...run, spend: usage.calendar?.cost || 0, models: usage }; cal.updatedAt = new Date().toISOString(); }
  const json = JSON.stringify(cal, null, 1) + "\n";
  let old = null; try { old = await fs.readFile(CALENDAR_FILE, "utf8"); } catch {}
  const sameEvents = old && JSON.stringify(JSON.parse(old).events) === JSON.stringify(cal.events);
  if (!old || due.length || !sameEvents) {
    await fs.writeFile(CALENDAR_FILE, json);
    await writeIfChanged("data/calendar.ics", buildIcs(cal.events, "The Connect: dates to watch"));
    for (const s of SECTORS) {
      const evs = cal.events.filter(e => e.sectors.includes(s.id)), path = `data/calendar-${s.id}.ics`;
      if (evs.length) await writeIfChanged(path, buildIcs(evs, `The Connect: ${s.name} dates`));
      else await fs.rm(path, { force: true });
    }
  }
  console.log(`Calendar: ${run.skipped ? "skipped (" + run.skipped + "); " : due.length ? due.map(g => g.id).join(", ") + " checked; " : "nothing due; "}${cal.events.length} upcoming dates on file.`);
  return run;
}

async function callClaude(prompt, job, level = "core") {
  needBudget(level, EST[job] || 0.1);
  let lastErr;
  for (const model of MODELS[job]) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({ model, max_tokens: job.startsWith("analysis") ? 16000 : job === "filter" ? 8000 : 4000, messages: [{ role: "user", content: prompt }] })
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      const u = usage[job] ||= { model, calls: 0, inputTokens: 0, outputTokens: 0 };
      u.model = model; u.calls++; u.inputTokens += body.usage?.input_tokens || 0; u.outputTokens += body.usage?.output_tokens || 0;
      charge(job, model, body.usage);
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
  await loadBudget();
  await loadWars();
  console.log(`Budget: $${budget.spent.toFixed(2)} of $${DAILY_BUDGET} used today (${budget.day}, India time)`);
  let deskFailed = false;
  try {
    // Dates to watch: a couple of organisations' official calendars are re-checked each run (each one weekly).
    if (CALENDAR_JOB) { try { await refreshCalendar(); await saveBudget(); } catch (e) { console.error(`Calendar update failed: ${e.message}`); } }
    else console.log("Calendar: switched off (CALENDAR_JOB in update.yml).");
    for (const desk of DESKS) {
      console.log(`\n=== ${desk.id} desk ===`);
      const r = await runDesk(desk);
      if (r.failures && !r.added && !r.merged && r.analysed) deskFailed = true;
      await saveBudget();
    }
  } finally { await saveBudget(); }
  if (deskFailed) process.exit(1); // surface a desk whose analysis failed entirely in the Actions tab
}

async function runDesk(desk) {
  feedHealth = {}; usage = {}; skippedItems = [];
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
  const freshCut = Date.now() - FRESH_HOURS * 36e5;
  const stale = fetched.filter(it => it.date && Date.parse(it.date) < freshCut && !seen.has(it.url)).length;
  if (stale) console.log(`${stale} headlines older than ${FRESH_HOURS} hours skipped`);
  const fresh = fetched
    .filter(it => !it.date || Date.parse(it.date) >= sinceMs)
    .filter(it => !it.date || Date.parse(it.date) >= freshCut)
    .filter(it => !seen.has(it.url))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))   // take the newest headlines first...
    .slice(0, MAX_NEW_PER_RUN[desk.id] || 150)
    .reverse();                                                    // ...then process them in time order so the first report leads
  console.log(`${fresh.length} new headlines to analyse: ` + deskOutlets.map(k => `${OUTLETS[k]} ${fresh.filter(f => f.src === k).length}`).join(", "));
  console.log("Feed health: " + JSON.stringify(feedHealth));
  // Format skips since the previous run (unique links), with a few examples per rule so the rules can be reviewed.
  const prevRun = Date.parse(data.updatedAt || "") || Date.now() - 3 * 36e5;
  const skipped = { since: new Date(prevRun).toISOString(), counts: {}, examples: {} };
  for (const it of new Map(skippedItems.filter(x => !x.date || Date.parse(x.date) >= prevRun).map(x => [x.url, x])).values()) {
    skipped.counts[it.reason] = (skipped.counts[it.reason] || 0) + 1;
    const ex = skipped.examples[it.reason] ||= []; if (ex.length < 5) ex.push(it.headline.slice(0, 120));
  }
  console.log("Skipped formats since last run: " + JSON.stringify(skipped.counts));

  const rejected = data.schema === SCHEMA && seen.size ? await readJson(desk.rejected, []) : [];
  let added = 0, merged = 0, failures = 0, budgetStopped = false;
  const tally = {};                                         // filter outcomes this run
  const runStart = budget ? budget.spent : 0;
  // War ladder: tie older escalation stories to their war and set the starting level of new wars, before new stories are analysed.
  const warPrep = await prepareWars(allEvents());
  if (warPrep.linked || warPrep.seeded) console.log(`War ladder: ${warPrep.linked} older stories tied to a war, ${warPrep.seeded} wars given a starting level`);
  for (let k = 0; k < fresh.length; k += BATCH) {
    const batch = fresh.slice(k, k + BATCH);
    if (budgetLeft("core") < 0.25) { budgetStopped = true; break; }   // left unseen: picked up by a later run if still fresh
    const cutoff = Date.now() - MATCH_WINDOW_DAYS * 864e5;
    const recent = allEvents().filter(e => !e.date || Date.parse(e.date) >= cutoff).slice(0, 80);
    // Step 1: the fast model keeps or rejects each headline and spots follow-ups to known stories.
    let verdicts;
    try { verdicts = await callClaude(filterPrompt(batch, recent, desk.mode), "filter"); }
    catch (e) { if (e instanceof BudgetError) { budgetStopped = true; break; } console.error(`Filter batch failed: ${e.message}`); failures++; continue; } // not marked seen: retried next run
    const byId = new Map();
    for (const v of verdicts || []) if (v && Number.isInteger(+v.id) && batch[+v.id]) byId.set(+v.id, v);
    // Settle each verdict by the framework's rules; opinion stays out whatever the model said.
    const kindOfV = v => KINDS.includes(v.kind) ? v.kind : "hard";
    for (const v of byId.values()) {
      v.verdict = settleVerdict(v, desk.mode);
      if (v.verdict !== "reject" && kindOfV(v) === "opinion") { v.verdict = "reject"; v.reason = "Opinion piece: kept out of the analysis"; }
      v.relevant = v.verdict !== "reject";
      tally[v.verdict] = (tally[v.verdict] || 0) + 1;
    }
    const isFollowUp = (i, v) => {
      if (typeof v.sameAs !== "string" || !v.sameAs) return false;
      if (v.sameAs.startsWith("item:")) { const k = +v.sameAs.slice(5); return v.relevant && k < i && !!byId.get(k)?.relevant; }
      const target = findEvent(v.sameAs);
      if (!target) return false;
      // A routine update to a story already on the desk joins it even when it would not stand alone
      // (decision 23 Oct: a daily casualty count merges into its war's story), but never a statement.
      return v.relevant || (v.status !== "statement" && target.stage !== "expired" && target.stage !== "brief");
    };
    // Step 2: Opus writes the analysis for kept stories that are new to the desk, in one request per batch.
    // Layer 1 routing: opinion stays out; soft news and features are kept as context without analysis.
    const kindOf = v => KINDS.includes(v.kind) ? v.kind : "hard";
    for (const v of byId.values()) if (v.relevant && kindOf(v) === "opinion") { v.relevant = false; v.reason = "Opinion piece: kept out of the analysis"; }
    const needsAnalysis = v => !["soft", "feature"].includes(kindOf(v));
    const toAnalyse = [...byId.entries()].filter(([i, v]) => v.verdict === "analyse" && !isFollowUp(i, v) && needsAnalysis(v))
      .map(([i, v]) => ({ i, id: idFor(batch[i].url), headline: batch[i].headline, url: batch[i].url, kind: kindOf(v), relevance: "medium", reports: [{ source: batch[i].src, headline: batch[i].headline, summary: batch[i].summary, lede: batch[i].lede, date: batch[i].date, kind: kindOf(v) }] }));
    const analysis = new Map();
    if (toAnalyse.length) {
      try { for (const [id, o] of await analyseStories(toAnalyse, desk.mode)) analysis.set(id, o); }
      catch (e) { if (e instanceof BudgetError) { budgetStopped = true; break; } console.error(`Analysis batch failed: ${e.message}`); failures++; continue; } // whole batch retried next run
    }
    const reject = (s, reason, kind) => rejected.unshift({ source: s.src, headline: s.headline, url: s.url, date: s.date, ...(kind ? { kind } : {}),
      reason: typeof reason === "string" ? reason.slice(0, 160) : "", checkedAt: new Date().toISOString() });
    const placed = {}, dropped = new Set();                 // batch index -> event it went into / items rejected at step 2
    for (let i = 0; i < batch.length; i++) {
      const s = batch[i], v = byId.get(i);
      if (!v) continue;
      if (!v.relevant && !isFollowUp(i, v)) { reject(s, v.reason, KINDS.includes(v.kind) ? v.kind : undefined); continue; }
      const report = { source: s.src, headline: s.headline, url: s.url, date: s.date, kind: kindOf(v), ...(s.summary && s.summary.length >= 40 ? { summary: s.summary, summaryV: SUMMARY_V } : {}), ...(s.lede ? { lede: s.lede } : {}), ...(s.image ? { image: s.image } : {}), ...(s.imageLarge ? { imageLarge: s.imageLarge } : {}) };
      if (isFollowUp(i, v)) {
        const k = v.sameAs.startsWith("item:") ? +v.sameAs.slice(5) : null;
        const target = k === null ? findEvent(v.sameAs) : placed[k];
        if (!target) { if (k !== null && dropped.has(k)) { reject(s, "Same story as an item the analysis desk set aside"); dropped.add(i); } continue; }
        if (!target.reports.some(x => x.url === s.url)) target.reports.push(report);
        if (!target.image && s.image) { target.image = s.image; if (s.imageLarge) target.imageLarge = s.imageLarge; }
        if (target.stage === "watch" && target.watch) {          // a new report on a watched story: check its trigger this run
          target.watch.recheck = true;
          if (watchKind(target.filter?.channel) === "weather") target.watch.expires = watchExpiry(target.filter?.channel);   // weather watches renew
        }
        placed[i] = target; merged++;
        continue;
      }
      const full = needsAnalysis(v) && v.verdict === "analyse";
      const o = full ? analysis.get(i) : null;
      const r = full ? o?.r : { relevant: true, sector: v.sector, relevance: "medium", why: "", implications: [] };  // watch, brief or context: no analysis
      const stage = !needsAnalysis(v) ? "context" : v.verdict;
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
        ...(o?.plan?.war ? { conflict: o.plan.war } : {}),
        ...(cleanPlace(v.place) ? { place: cleanPlace(v.place) } : {}),
        stage, filter: filterInfo(v, v.verdict),
        ...(stage === "watch" ? { watch: { grows_if: str(v.grows_if, 120), since: new Date().toISOString(), expires: watchExpiry(v.channel) } } : {}),
        reports: [report]
      };
      sector.items.push(ev); placed[i] = ev; added++;
    }
    batch.forEach(s => seen.add(s.url));
  }

  const watch = await reviewWatch(data, desk.mode);           // expire old watch items; promote those whose trigger happened
  if (watch.checked || watch.expired) console.log(`Watching: ${watch.checked} checked, ${watch.promoted} promoted to analysis, ${watch.expired} expired, ${watch.open} open`);
  const finance = await moveToFinance(data);
  if (finance.moved || finance.checked) console.log(`Finance: ${finance.moved} of ${finance.checked} recent stories moved into the new Finance sector`);
  const stats = await addStatistics(data, desk.mode);     // statistics come before catch-up work
  const kinds = await classifyOlder(data);
  const places = await labelPlaces(data);
  if (places.labelled) console.log(`Places: ${places.labelled} recent stories placed on the map, ${places.waiting} waiting`);
  const frames = await reframeRecent(data, desk.mode);
  if (stats.searched) console.log(`Statistics: ${stats.searched} stories due, ${stats.found} new charts, ${stats.reused} reused saved series, ${stats.none} without, ${stats.failed} failed; ${stats.proposed} figures proposed, ${stats.droppedPoints} not found on an official page, ${stats.pagesFetched} official pages fetched`);
  for (const x of stats.samples || []) console.log(`  · ${x.result}: ${x.headline}` + (x.proposed !== undefined ? ` (${x.checked}/${x.proposed} figures checked, ${x.pagesFetched} pages)` : ""));
  if (frames.done || frames.failedBatches) console.log(`Framework analysis: ${frames.done} existing stories re-analysed, ${frames.waiting} still waiting`);
  if (kinds.labelled || kinds.waiting) console.log(`Report kinds: ${kinds.labelled} older reports labelled, ${kinds.waiting} waiting`);
  const og = await fillShareImages(data);
  if (og.tried) console.log(`Article pages checked: ${og.tried} (photos found ${og.found}, summaries found ${og.summaries})`);

  for (const s of data.sectors) for (const ev of s.items) ev.priority = priorityOf(ev);
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
  await saveWars();
  data.lastRun = { filter: tally, watch, wars: warPrep, places, skipped, finance, analysed: fresh.length, added, merged, rejected: fresh.length && !failures && !budgetStopped ? fresh.length - added - merged : undefined, failedBatches: failures, feeds: feedHealth, shareImages: og, threads: th, summaries: sm, kinds, frames, stats, models: usage,
    spend: budget ? { thisDesk: Math.round((budget.spent - runStart) * 1e4) / 1e4, today: Math.round(budget.spent * 1e4) / 1e4, cap: DAILY_BUDGET, ...(budgetStopped ? { stopped: true } : {}) } : undefined };

  await fs.writeFile(desk.data, JSON.stringify(data, null, 2) + "\n");
  await fs.writeFile(desk.seen, JSON.stringify([...seen].slice(-MAX_SEEN)) + "\n");
  await fs.writeFile(desk.rejected, JSON.stringify(rejected.slice(0, MAX_REJECTED), null, 2) + "\n");
  console.log(`Added ${added} new events, merged ${merged} reports into existing events. Failed batches: ${failures}.`);
  if (budget) console.log(`Spend: this desk $${(budget.spent - runStart).toFixed(2)}; today $${budget.spent.toFixed(2)} of $${DAILY_BUDGET}${budgetStopped ? " — daily budget reached, remaining headlines wait for a later run" : ""}`);
  return { added, merged, failures, analysed: fresh.length };
}
function latest(e) { return (e.reports || []).map(r => r.date || "").sort().pop() || e.date || ""; }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => { console.error(e); process.exit(1); });
