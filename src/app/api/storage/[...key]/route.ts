import { NextRequest, NextResponse } from "next/server";
import { downloadStorageObject } from "@/lib/storage";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ key: string[] }> }
) {
  try {
    const { key } = await context.params;
    const objectKey = Array.isArray(key) ? key.join("/") : String(key);
    const { bytes, contentType } = await downloadStorageObject(objectKey);

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err: any) {
    console.error("[GET /api/storage Error]:", err.message);
    return NextResponse.json({ error: "Object not found" }, { status: 404 });
  }
}

