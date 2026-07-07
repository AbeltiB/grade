import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key:    process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

export { cloudinary };

export interface CloudinaryUploadResult {
  secure_url: string;
  public_id:  string;
}

export interface CloudinarySignature {
  signature: string;
  timestamp: number;
  apiKey:    string;
  cloudName: string;
  folder:    string;
  publicId:  string;
}

function buildFolder(
  instructorKey: string,
  assignmentKey: string,
  studentId:     string
): string {
  return `grade-submissions/${instructorKey}/${assignmentKey}/${studentId}`;
}

/**
 * Upload a zip Buffer to Cloudinary under a structured folder path.
 * Folder: grade-submissions/{instructorKey}/{assignmentKey}/{studentId}
 */
export async function uploadZip(
  buffer:        Buffer,
  originalName:  string,
  instructorKey: string,
  assignmentKey: string,
  studentId:     string
): Promise<CloudinaryUploadResult> {
  const folder = buildFolder(instructorKey, assignmentKey, studentId);

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",
        folder,
        public_id:     originalName.replace(/\.zip$/i, ""),
        use_filename:  true,
        unique_filename: true,
        overwrite:     false,
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error("Cloudinary upload failed"));
          return;
        }
        resolve({
          secure_url: result.secure_url,
          public_id:  result.public_id,
        });
      }
    );
    stream.end(buffer);
  });
}

/**
 * Generate a signed upload signature so the browser can upload the zip
 * directly to Cloudinary. This avoids shipping large files through the
 * Next.js server and sidesteps platform body-size limits.
 */
function sanitizePublicId(name: string): string {
  return name
    .replace(/\.zip$/i, "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9-_]+/g, "_") // whitelist only
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 100); // Cloudinary public_id length sanity
}

export function getUploadSignature(
  originalName:  string,
  instructorKey: string,
  assignmentKey: string,
  studentId:     string
): CloudinarySignature {
  const folder    = buildFolder(instructorKey, assignmentKey, studentId);
  const publicId  = sanitizePublicId(originalName);
  const timestamp = Math.round(Date.now() / 1000);

  const paramsToSign: Record<string, string> = {
    folder,
    public_id: publicId,
    timestamp: String(timestamp),
    unique_filename: "true",
    use_filename: "true",
  };

  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    process.env.CLOUDINARY_API_SECRET!
  );

  return {
    signature,
    timestamp,
    apiKey:    process.env.CLOUDINARY_API_KEY!,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
    folder,
    publicId
  };
}

/**
 * Best-effort delete of a Cloudinary asset. Used to roll back an upload when
 * the database write fails so we don't leave orphaned files.
 */
export async function deleteAsset(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: "raw" });
  } catch {
    // Swallow cleanup errors; the original error is more important.
  }
}