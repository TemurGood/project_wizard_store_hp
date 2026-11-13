import { Files } from "files-sdk";
import { neon } from "files-sdk/neon";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const BUCKET_NAME = "assets";

let filesInstance: Files | null = null;
let s3Instance: S3Client | null = null;

export function getNeonFiles(): Files {
  if (!filesInstance) {
    filesInstance = new Files({
      adapter: neon({ bucket: BUCKET_NAME }),
    });
  }
  return filesInstance;
}

export function getS3Client(): S3Client {
  if (!s3Instance) {
    s3Instance = new S3Client({
      forcePathStyle: true,
      endpoint: process.env.AWS_ENDPOINT_URL_S3,
      region: process.env.AWS_REGION || "eu-central-1",
      credentials:
        process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
  }
  return s3Instance;
}

export async function uploadProductImage(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<{ key: string; url: string }> {
  try {
    const files = getNeonFiles();
    await files.upload(key, buffer, { contentType });
  } catch (err) {
    // Fallback to raw S3Client with forcePathStyle: true
    const s3 = getS3Client();
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      })
    );
  }

  // Return internal proxy URL that streams or presigns from Neon Object Storage
  return {
    key,
    url: `/api/storage/${key}`,
  };
}

export async function getStorageSignedUrl(key: string): Promise<string> {
  try {
    const files = getNeonFiles();
    return await files.url(key, { expiresIn: 3600 });
  } catch {
    const s3 = getS3Client();
    return await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }),
      { expiresIn: 3600 }
    );
  }
}

export async function downloadStorageObject(
  key: string
): Promise<{ bytes: Uint8Array; contentType: string }> {
  try {
    const files = getNeonFiles();
    const blob = await files.download(key);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { bytes, contentType: blob.type || "image/png" };
  } catch {
    const s3 = getS3Client();
    const res = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key })
    );
    const bytes = (await res.Body?.transformToByteArray()) || new Uint8Array();
    return {
      bytes,
      contentType: res.ContentType || "image/png",
    };
  }
}

