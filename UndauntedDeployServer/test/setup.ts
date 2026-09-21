// Import this first in every test file: quiet, plain JSON logs, and no pino-pretty worker.
process.env.NODE_ENV = "production";
process.env.LOG_LEVEL = process.env.TEST_LOG_LEVEL ?? "silent";

export {};
