"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv.config({
    path: path_1.default.resolve(__dirname, "../../.env"),
});
const bullmq_1 = require("bullmq");
const axios_1 = __importDefault(require("axios"));
const cheerio = __importStar(require("cheerio"));
const redis_1 = require("./redis");
console.log("✅ Worker (Cheerio) started");
function scrapeAmazonHTML(html) {
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
new bullmq_1.Worker("product-scrape", async (job) => {
    const { url, affiliateLink, from } = job.data;
    try {
        console.log(`🚀 Scraping (Cheerio): ${url}`);
        const response = await axios_1.default.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
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
        const res = await axios_1.default.post(`${process.env.SITE_URL}/api/products/process`, {
            url,
            affiliateLink,
            from,
            scraped,
        }, {
            headers: { "x-api-key": process.env.WORKER_SECRET },
        });
        console.log("✅ Product processed:", res.data);
        return res.data;
    }
    catch (err) {
        console.error("❌ Worker failed:", err.message);
        const totalAttempts = job.opts.attempts ?? 1;
        if (job.attemptsMade === totalAttempts - 1) {
            await axios_1.default.post(`${process.env.SITE_URL}/api/send-fail`, { from }, {
                headers: { "x-api-key": process.env.WORKER_SECRET },
            });
        }
        throw err;
    }
}, {
    connection: redis_1.redisConnection,
    maxStalledCount: 1,
});
