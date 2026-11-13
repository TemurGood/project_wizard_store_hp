import { NextRequest, NextResponse } from "next/server";
import { uploadProductImage } from "@/lib/storage";

export async function POST(req: NextRequest) {
  try {
    const contentTypeHeader = req.headers.get("content-type") || "";

    if (contentTypeHeader.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
      }
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const key = `products/${Date.now()}-${safeName}`;
      const result = await uploadProductImage(
        key,
        buffer,
        file.type || "image/png"
      );
      return NextResponse.json(result, { status: 201 });
    } else {
      const body = await req.json();
      const { filename = "artifact.png", base64, contentType = "image/png" } = body;
      if (!base64) {
        return NextResponse.json({ error: "base64 данные не переданы" }, { status: 400 });
      }
      const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(cleanBase64, "base64");
      const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const key = `products/${Date.now()}-${safeName}`;
      const result = await uploadProductImage(key, buffer, contentType);
      return NextResponse.json(result, { status: 201 });
    }
  } catch (err: any) {
    console.error("[POST /api/upload Error]:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

