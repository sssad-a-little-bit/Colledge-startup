import { NextRequest, NextResponse } from "next/server";
import { actor } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiError, AppError } from "@/lib/errors";
import { newsScope, requestId } from "@/lib/portal";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const rid = requestId();
  try {
    let user = null;
    try {
      user = await actor();
    } catch (e) {
      if (!(e instanceof AppError) || e.status !== 401) throw e;
    }
    const data = await db.news.findMany({
      where: await newsScope(user),
      include: { author: { select: { name: true } } },
      orderBy: { publishedAt: "desc" },
      take: Math.min(50, Number(req.nextUrl.searchParams.get("limit")) || 30),
    });
    return NextResponse.json(
      { data },
      {
        headers: { "Cache-Control": "private, no-store", "X-Request-ID": rid },
      },
    );
  } catch (e) {
    return apiError(e, rid);
  }
}
