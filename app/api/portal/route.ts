import { NextRequest, NextResponse } from "next/server";
import { actor } from "@/lib/auth";
import { apiError, AppError } from "@/lib/errors";
import { readPortal, writePortal, requestId } from "@/lib/portal";

export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 65_536;

async function readObject(req: NextRequest): Promise<Record<string, unknown>> {
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    throw new AppError(415, "Ожидается запрос в формате JSON");
  if (Number(req.headers.get("content-length") || 0) > MAX_BODY_BYTES)
    throw new AppError(413, "Запрос слишком большой");
  const reader = req.body?.getReader();
  if (!reader) throw new AppError(400, "Пустой запрос");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new AppError(413, "Запрос слишком большой");
    }
    chunks.push(value);
  }
  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError(400, "Некорректный JSON");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new AppError(422, "Ожидается объект с полями действия");
  }
  return body as Record<string, unknown>;
}

export async function GET(req: NextRequest) {
  const rid = requestId();
  try {
    const user = await actor();
    const data = await readPortal(
      user,
      req.nextUrl.searchParams.get("resource") || "overview",
      req.nextUrl.searchParams,
    );
    return NextResponse.json(
      { data },
      {
        headers: { "Cache-Control": "private, no-store", "X-Request-ID": rid },
      },
    );
  } catch (error) {
    return apiError(error, rid);
  }
}

export async function POST(req: NextRequest) {
  const rid = requestId();
  try {
    const origin = req.headers.get("origin");
    if (
      !origin ||
      origin !== new URL(process.env.NEXTAUTH_URL || req.url).origin
    )
      throw new AppError(403, "Недопустимый источник запроса");
    const body = await readObject(req);
    const user = await actor();
    const data = await writePortal(user, body);
    return NextResponse.json(
      { data },
      {
        headers: { "Cache-Control": "private, no-store", "X-Request-ID": rid },
      },
    );
  } catch (error) {
    return apiError(error, rid);
  }
}
