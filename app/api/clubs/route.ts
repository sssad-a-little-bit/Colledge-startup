import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { actor } from "@/lib/auth";
import { readClubs, writeClub } from "@/lib/clubs";
import { apiError, AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 8192;

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
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new AppError(422, "Ожидается объект с полями действия");
  return body as Record<string, unknown>;
}

function response(data: unknown, requestId: string) {
  return NextResponse.json(
    { data },
    {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Request-ID": requestId,
      },
    },
  );
}

export async function GET() {
  const requestId = randomUUID();
  try {
    return response(await readClubs(await actor()), requestId);
  } catch (error) {
    return apiError(error, requestId);
  }
}

export async function POST(req: NextRequest) {
  const requestId = randomUUID();
  try {
    const origin = req.headers.get("origin");
    if (
      !origin ||
      origin !== new URL(process.env.NEXTAUTH_URL || req.url).origin
    )
      throw new AppError(403, "Недопустимый источник запроса");
    const body = await readObject(req);
    return response(await writeClub(await actor(), body), requestId);
  } catch (error) {
    return apiError(error, requestId);
  }
}
