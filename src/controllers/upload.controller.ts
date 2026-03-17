import { Request, Response } from "express";
import {
  presignDownload,
  presignUpload,
} from "../models/services/upload.service";
import { getBucketName } from "../utils/functions";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2 } from "../config/r2Client";

export const createPresignedUrl = async (
  req: any,
  res: Response
): Promise<any> => {
  const { filename, contentType, folder } = req.body;
  const { sub } = req?.user;

  if (!filename || !contentType) {
    return res.status(400).json({ message: "filename & contentType required" });
  }

  try {
    const data = await presignUpload({
      filename,
      contentType,
      userId: sub,
      folderKey: folder,
    });
    return res.status(200).json(data);
  } catch (err) {
    console.error("Presign error:", err);
    return res.status(500).json({ message: "Failed to presign URL" });
  }
};

export const getPresignedDownloadUrl = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const { keys } = req.body;

    // Validate payload
    if (!keys || (typeof keys !== "string" && !Array.isArray(keys))) {
      return res
        .status(400)
        .json({ message: "'keys' must be a string or string[]" });
    }

    // Generate signed URL(s)
    const result = await presignDownload(keys);

    // Handle missing files (NoSuchKey)
    if (Array.isArray(keys)) {
      // For arrays, filter out null values and return with status info
      const urls = Array.isArray(result) ? result : [];
      const missingFiles = urls.map((url, index) => url === null ? keys[index] : null).filter(Boolean);
      
      if (missingFiles.length > 0) {
        console.warn(`⚠️ Some files not found in storage:`, missingFiles);
      }
      
      // Return urls array (may contain null values for missing files)
      return res.status(200).json({ urls });
    } else {
      // For single key, return 404 if file doesn't exist
      if (!result || result === null) {
        return res.status(404).json({ 
          message: "File not found in storage",
          key: keys 
        });
      }
      return res.status(200).json({ url: result as string });
    }
  } catch (error) {
    console.error("Presign download failed:", error);
    return res
      .status(500)
      .json({ message: "Failed to generate download URL(s)" });
  }
};
