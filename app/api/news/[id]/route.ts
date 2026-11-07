import { NextRequest, NextResponse } from "next/server";
import { actor } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiError, AppError } from "@/lib/errors";
import { newsScope, requestId } from "@/lib/portal";
export const dynamic = "force-dynamic";
export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rid = requestId();
  try {
    let user = null;
    try {
      user = await actor();
    } catch (e) {
      if (!(e instanceof AppError) || e.status !== 401) throw e;
    }
    const { id } = await params;
    const data = await db.news.findFirst({
      where: { AND: [{ id }, await newsScope(user)] },
      include: { author: { select: { name: true } } },
    });
    if (!data) throw new AppError(404, "Новость не найдена");
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
