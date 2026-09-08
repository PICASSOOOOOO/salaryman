import { z } from "zod";

export const RequestUploadUrlBody = z.object({
  name: z.string().min(1),
  size: z.number().optional(),
  contentType: z.string().min(1),
});

export const RequestUploadUrlResponse = z.object({
  uploadURL: z.string(),
  objectPath: z.string(),
  metadata: z.object({
    name: z.string(),
    size: z.number().optional(),
    contentType: z.string(),
  }).optional(),
});

export type RequestUploadUrlBodyType = z.infer<typeof RequestUploadUrlBody>;
export type RequestUploadUrlResponseType = z.infer<typeof RequestUploadUrlResponse>;
