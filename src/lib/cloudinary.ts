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
  const folder = `grade-submissions/${instructorKey}/${assignmentKey}/${studentId}`;

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