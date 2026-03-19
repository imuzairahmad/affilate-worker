import * as dotenv from "dotenv";
import path from "path";

dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});

if (!process.env.REDIS_URL) throw new Error("REDIS_URL not defined");
const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  console.error("❌ REDIS_URL missing");
  process.exit(1); // better than crash
}

export const redisConnection = {
  url: process.env.REDIS_URL!,
};
