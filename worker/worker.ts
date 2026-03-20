// worker.ts
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});

import { Worker } from "bullmq";
import axios from "axios";
import puppeteer from "puppeteer";
import { redisConnection } from "./redis";

console.log("✅ Worker started");

new Worker(
  "product-scrape",
  async (job) => {
    const { url, affiliateLink, from } = job.data;

    let browser;

    try {
      console.log(`🚀 Scraping: ${url}`);

      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });

      const page = await browser.newPage();

      await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: 60000,
      });

      // ✅ SCRAPE DATA
      const scraped = await page.evaluate(() => {
        return {
          title: document.querySelector("title")?.innerText || "",
          pros: [],
          cons: [],
        };
      });

      console.log("✅ Scraped:", scraped);

      // ✅ SEND TO API
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

      // ✅ only send on FINAL attempt
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
    } finally {
      if (browser) await browser.close();
    }
  },
  {
    connection: redisConnection,
    maxStalledCount: 1,
  },
);
