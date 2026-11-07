import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json(
    { status: "alive" },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Request-ID": crypto.randomUUID(),
      },
    },
  );
}
