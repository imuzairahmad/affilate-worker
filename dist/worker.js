"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const axios_1 = __importDefault(require("axios"));
const redis_1 = require("./redis");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
console.log("✅ Worker started");
new bullmq_1.Worker("product-scrape", async (job) => {
    const { url, affiliateLink, from } = job.data;
    try {
        const res = await axios_1.default.post(`${process.env.NEXT_PUBLIC_SITE_URL}/api/products/process`, { url, affiliateLink, from }, { headers: { "x-api-key": process.env.WORKER_SECRET } });
        console.log("✅ Product processed:", res.data);
    }
    catch (err) {
        console.error("❌ API call failed:", err.response?.data || err.message);
        throw err;
    }
}, { connection: redis_1.redisConnection });
