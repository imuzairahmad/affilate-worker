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
exports.processProductJob = processProductJob;
// worker.ts
const axios_1 = __importDefault(require("axios"));
const cheerio = __importStar(require("cheerio"));
// =========================
// ✅ Fetch HTML (Axios only)
// =========================
async function fetchHTML(url) {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 15000);
    const res = await axios_1.default.get(url, {
        signal: controller.signal,
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
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
function scrapeAmazonHTML(html) {
    const $ = cheerio.load(html);
    const title = $("#productTitle").text().trim() ||
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
async function processProductJob(data) {
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
            }
            catch (err) {
                if (i === 1)
                    throw err;
                console.log("🔁 Retry scraping...");
            }
        }
        console.log("✅ Scraped:", scraped);
        // ✅ Call API
        const res = await axios_1.default.post(`${process.env.SITE_URL}/api/products/process`, {
            url,
            affiliateLink,
            from,
            scraped,
        }, {
            headers: {
                "x-api-key": process.env.WORKER_SECRET,
            },
        });
        console.log("✅ API success:", res.data);
        return res.data;
    }
    catch (err) {
        console.error("❌ Worker failed:", err.message);
        // ❗ Notify failure
        await axios_1.default.post(`${process.env.SITE_URL}/api/send-fail`, { from }, {
            headers: {
                "x-api-key": process.env.WORKER_SECRET,
            },
        });
        throw err;
    }
}
