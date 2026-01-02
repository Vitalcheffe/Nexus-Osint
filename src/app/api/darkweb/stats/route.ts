import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ACTIVE",
    note: "Stats served from /api/darkweb/ingest buffer — start Python collector for live data",
    sources: {
      clearnet: [
        { id: "4chan_pol",  name: "4chan /pol/",              status: "ACTIVE", pollMin: 10 },
        { id: "4chan_k",    name: "4chan /k/",                status: "ACTIVE", pollMin: 10 },
        { id: "reddit",     name: "Reddit (8 subreddits)",    status: "ACTIVE", pollMin: 10 },
        { id: "hackernews", name: "Hacker News",              status: "ACTIVE", pollMin: 15 },
        { id: "pastebin",   name: "Pastebin (scrape API)",    status: "NEEDS_IP", pollMin: 20, note: "Scrape API requires server IP whitelist at pastebin.com/doc_scraping_api" },
      ],
      onion: [
        { id: "ddosecrets",   name: "DDoSecrets .onion",    status: "TOR_REQUIRED", pollMin: 30 },
        { id: "the_intercept",name: "The Intercept .onion",  status: "TOR_REQUIRED", pollMin: 60 },
        { id: "propublica",   name: "ProPublica .onion",     status: "TOR_REQUIRED", pollMin: 60 },
        { id: "nytimes_onion",name: "NYT .onion",            status: "TOR_REQUIRED", pollMin: 60 },
        { id: "bbc_onion",    name: "BBC .onion",            status: "TOR_REQUIRED", pollMin: 30 },
        { id: "dw_onion",     name: "Deutsche Welle .onion", status: "TOR_REQUIRED", pollMin: 30 },
        { id: "rferl_onion",  name: "RFE/RL .onion",         status: "TOR_REQUIRED", pollMin: 30 },
        { id: "bellingcat",   name: "Bellingcat",            status: "ACTIVE",       pollMin: 30 },
      ],
      threat_intel: [
        { id: "lockbit3",  name: "LockBit 3.0 (monitor)",  status: "TOR_REQUIRED", pollMin: 60 },
        { id: "alphv",     name: "ALPHV/BlackCat (monitor)",status: "TOR_REQUIRED", pollMin: 60 },
        { id: "clop",      name: "CLOP (monitor)",          status: "TOR_REQUIRED", pollMin: 60 },
      ],
    },
    setup: {
      tor: "apt install tor (Linux) or brew install tor (macOS)",
      python_deps: "pip install requests[socks] stem beautifulsoup4 lxml pysocks",
      launch: "TOR_SOCKS_PORT=9050 NEXUS_API_URL=http://localhost:3000 python3 scripts/nexus_darkweb_collector.py",
    },
    timestamp: new Date().toISOString(),
  });
}
