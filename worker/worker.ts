// worker.ts
import axios from "axios";
import * as cheerio from "cheerio";

// =========================
// ✅ Fetch HTML (Axios only)
// =========================
async function fetchHTML(url: string): Promise<string> {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 15000);

  const res = await axios.get(url, {
    signal: controller.signal,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
    validateStatus: () => true,
  });

  console.log("🌐 Status:", res.status);

  if (res.status !== 200) {
    throw new Error("Failed to fetch page");
  }

  return res.data;
}

// =========================
// ✅ Scraper
// =========================
function scrapeAmazonHTML(html: string) {
  const $ = cheerio.load(html);

  const title =
    $("#productTitle").text().trim() ||
    $("meta[name='title']").attr("content") ||
    $("title").text().trim();

  const pros = $("#feature-bullets li span")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((t) => t.length > 10)
    .slice(0, 5);

  return {
    title,
    pros,
    cons: [],
  };
}

// =========================
// ✅ Worker Function
// =========================
export async function processProductJob(data: {
  url: string;
  affiliateLink: string;
  from: string;
}) {
  const { url, affiliateLink, from } = data;

  try {
    console.log("🚀 Worker started:", url);

    // ✅ Validate Amazon URL
    if (!url.includes("/dp/") && !url.includes("/gp/product/")) {
      throw new Error("Invalid Amazon product link");
    }

    // ✅ Retry logic
    let scraped;
    for (let i = 0; i < 2; i++) {
      try {
        const html = await fetchHTML(url);
        scraped = scrapeAmazonHTML(html);

        if (scraped.title && scraped.title !== "Amazon.com") {
          break;
        }

        throw new Error("Invalid scraped content");
      } catch (err) {
        if (i === 1) throw err;
        console.log("🔁 Retry scraping...");
      }
    }

    console.log("✅ Scraped:", scraped);

    // ✅ Call API
    const res = await axios.post(
      `${process.env.SITE_URL}/api/products/process`,
      {
        url,
        affiliateLink,
        from,
        scraped,
      },
      {
        headers: {
          "x-api-key": process.env.WORKER_SECRET!,
        },
      },
    );

    console.log("✅ API success:", res.data);

    return res.data;
  } catch (err: any) {
    console.error("❌ Worker failed:", err.message);

    // ❗ Notify failure
    await axios.post(
      `${process.env.SITE_URL}/api/send-fail`,
      { from },
      {
        headers: {
          "x-api-key": process.env.WORKER_SECRET!,
        },
      },
    );

    throw err;
  }
}
