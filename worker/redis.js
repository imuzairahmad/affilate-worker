"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisConnection = void 0;
if (!process.env.REDIS_URL)
    throw new Error("REDIS_URL not defined");
exports.redisConnection = {
    url: process.env.REDIS_URL,
};
