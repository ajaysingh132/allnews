import { writeFile } from "node:fs/promises";

const SOURCES = [
  { name: "PIB Hindi", url: "https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1", category: "भारत" },
  { name: "UN News", url: "https://news.un.org/feed/subscribe/en/news/all/rss.xml", category: "अंतरराष्ट्रीय संस्था" },
  { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", category: "विश्व" },
  { name: "DW News", url: "https://rss.dw.com/rdf/rss-en-all", category: "विश्व" }
];

const stripHtml = (value = "") => value
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
  .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/\s+/g, " ").trim();

function tag(block, name) {
  const re = new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)<\\/" + name + "\\s*>", "i");
  const m = block.match(re);
  return m ? stripHtml(m[1]) : "";
}
function parseFeed(xml, source) {
  const entries = [];
  const blocks = xml.match(/<item\b[\s\S]*?<\/item\s*>|<entry\b[\s\S]*?<\/entry\s*>/gi) || [];
  for (const block of blocks) {
    const title = tag(block, "title");
    const description = tag(block, "description") || tag(block, "summary") || tag(block, "content");
    let link = tag(block, "link");
    if (!link) {
      const m = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?\s*>/i);
      if (m) link = m[1];
    }
    const date = tag(block, "pubDate") || tag(block, "published") || tag(block, "updated") || tag(block, "dc:date");
    if (!title || !link || !/^https?:\/\//i.test(link)) continue;
    entries.push({
      title: title.slice(0, 260),
      summary: description.slice(0, 360),
      url: link,
      source: source.name,
      category: source.category,
      publishedAt: date,
      rightsNote: "शीर्षक/लिंक/सीमित विवरण; मूल लेख का पूर्ण पाठ या फोटो इस फ़ीड से पुनर्प्रकाशित न करें।"
    });
  }
  return entries;
}

const all = [];
const results = [];
for (const source of SOURCES) {
  try {
    const response = await fetch(source.url, { signal: AbortSignal.timeout(12000), headers: { "user-agent": "GBSBFORYOU-FreeNewsFeed/1.0 (+https://ajaysingh132.github.io/allnews/)" } });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const xml = await response.text();
    const items = parseFeed(xml, source);
    all.push(...items);
    results.push({ source: source.name, ok: true, count: items.length });
  } catch (error) {
    results.push({ source: source.name, ok: false, error: String(error).slice(0, 180) });
  }
}
const unique = [...new Map(all.map(item => [item.url, item])).values()]
  .sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0))
  .slice(0, 100);
const output = {
  generatedAt: new Date().toISOString(),
  mode: "free RSS metadata and short descriptions only; no automatic publication",
  items: unique,
  sourceResults: results,
  editorialNotice: "समाचार अपने शब्दों में हिंदी में लिखें। पूर्ण एजेंसी लेख, फोटो या वीडियो तभी पुनर्प्रकाशित करें जब अधिकार स्पष्ट रूप से उपलब्ध हों। सभी रिकॉर्ड संपादकीय समीक्षा के लिए हैं।"
};
await writeFile("feed-data.json", JSON.stringify(output, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ generatedAt: output.generatedAt, totalItems: unique.length, sources: results }, null, 2));
