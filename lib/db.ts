import { PrismaClient } from "@prisma/client";

const globalDatabase = globalThis as unknown as {
  campusDatabase?: PrismaClient;
};

/** Prisma's URL includes connection_limit and connect_timeout in .env.example. */
export const db =
  globalDatabase.campusDatabase ??
  new PrismaClient({
    log: [],
    transactionOptions: { maxWait: 5_000, timeout: 10_000 },
  });

if (process.env.NODE_ENV !== "production") globalDatabase.campusDatabase = db;
