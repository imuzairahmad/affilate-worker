import { Worker } from "bullmq";
import axios from "axios";
import { redisConnection } from "./redis";
import * as dotenv from "dotenv";

dotenv.config();

console.log("✅ Worker started");

new Worker(
  "product-scrape",
  async (job) => {
    const { url, affiliateLink, from } = job.data;

    try {
      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_SITE_URL}/api/products/process`,
        { url, affiliateLink, from },
        { headers: { "x-api-key": process.env.WORKER_SECRET! } },
      );
      console.log("✅ Product processed:", res.data);
    } catch (err: any) {
      console.error("❌ API call failed:", err.response?.data || err.message);
      throw err;
    }
  },
  { connection: redisConnection },
);
