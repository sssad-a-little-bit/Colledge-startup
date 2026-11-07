import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export async function GET() {
  const requestId = crypto.randomUUID();
  const timeout = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), 3_000);
    timer.unref();
  });
  try {
    await Promise.race([db.$queryRaw`SELECT 1`, timeout]);
    return NextResponse.json(
      { status: "ready" },
      { headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
    );
  } catch {
    console.error(
      JSON.stringify({ level: "error", code: "READINESS_FAILED", requestId }),
    );
    return NextResponse.json(
      { status: "unavailable", requestId },
      {
        status: 503,
        headers: { "Cache-Control": "no-store", "X-Request-ID": requestId },
      },
    );
  }
}
