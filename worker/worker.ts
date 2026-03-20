import * as dotenv from "dotenv";
import path from "path";

dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});

import { Worker } from "bullmq";
import axios from "axios";
import * as cheerio from "cheerio";
import { redisConnection } from "./redis";

console.log("✅ Worker (Cheerio) started");

function scrapeAmazonHTML(html: string) {
  const $ = cheerio.load(html);

  const title = $("#productTitle").text().trim() || $("title").text().trim();

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

new Worker(
  "product-scrape",
  async (job) => {
    const { url, affiliateLink, from } = job.data;

    try {
      console.log(`🚀 Scraping (Cheerio): ${url}`);

      const response = await axios.get(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      const html = response.data;

      const scraped = scrapeAmazonHTML(html);

      console.log("✅ Scraped:", scraped);

      // ❌ Guard against bad scrape
      if (!scraped.title || scraped.title === "Amazon.com") {
        throw new Error("Invalid product title (blocked or bad HTML)");
      }

      // ✅ Send to API
      const res = await axios.post(
        `${process.env.SITE_URL}/api/products/process`,
        {
          url,
          affiliateLink,
          from,
          scraped,
        },
        {
          headers: { "x-api-key": process.env.WORKER_SECRET! },
        },
      );

      console.log("✅ Product processed:", res.data);

      return res.data;
    } catch (err: any) {
      console.error("❌ Worker failed:", err.message);

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
