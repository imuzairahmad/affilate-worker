// worker.ts
import * as dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { Worker } from "bullmq";
import puppeteer from "puppeteer";
import axios from "axios";
import * as cheerio from "cheerio";
import { redisConnection } from "./redis";

// =========================
// ✅ Hybrid fetch HTML
// =========================
async function fetchHTML(url: string): Promise<string> {
  try {
    // First attempt with Axios (fast)
    const res = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      validateStatus: () => true, // don't throw on non-200
    });

    console.log("🌐 Axios status:", res.status);

    if (res.status === 200) return res.data;

    throw new Error("Axios blocked or non-200 response");
  } catch (err) {
    console.log("⚠️ Axios failed → using Puppeteer");

    // Puppeteer fallback
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-infobars",
      ],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    );
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });

    // Wait for title selector to appear
    await page
      .waitForSelector("#productTitle", { timeout: 30000 })
      .catch(() => {});

    const html = await page.content();
    await browser.close();
    return html;
  }
}

// =========================
// ✅ Scrape HTML
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
// ✅ Worker
// =========================
new Worker(
  "product-scrape",
  async (job) => {
    const { url, affiliateLink, from } = job.data;

    try {
      console.log(`🚀 Scraping product: ${url}`);

      const html = await fetchHTML(url);
      const scraped = scrapeAmazonHTML(html);

      console.log("✅ Scraped data:", scraped);

      // Strong validation
      if (
        !scraped.title ||
        scraped.title.toLowerCase().includes("amazon.com") ||
        scraped.title.toLowerCase().includes("robot")
      ) {
        throw new Error("Blocked or invalid product page");
      }

      // -------------------------
      // Send to API for processing
      // -------------------------
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

      console.log("✅ Product processed:", res.data);
      return res.data;
    } catch (err: any) {
      console.error("❌ Worker failed:", err.message);

      // Notify after final attempt
      const totalAttempts = job.opts.attempts ?? 1;
      if (job.attemptsMade === totalAttempts - 1) {
        await axios.post(
          `${process.env.SITE_URL}/api/send-fail`,
          { from },
          {
            headers: { "x-api-key": process.env.WORKER_SECRET! },
          },
        );
      }

      throw err;
    }
  },
  {
    connection: redisConnection,
    maxStalledCount: 1,
  },
);

console.log("✅ Worker started (Hybrid Amazon Scraper)");
