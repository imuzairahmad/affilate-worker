import * as dotenv from "dotenv";

dotenv.config();

if (!process.env.REDIS_URL) throw new Error("REDIS_URL not defined");

export const redisConnection = {
  url: process.env.REDIS_URL!,
};
