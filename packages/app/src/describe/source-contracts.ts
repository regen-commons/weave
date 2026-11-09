import { z } from "../validation.ts";
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const TurnSchema = z.strictObject({
  id: z.string().uuid(),
  prompt: z.string().max(300),
  text: z.string().min(1).max(20000),
  via: z.enum(["typed", "voice"]),
});
export const AttachmentSchema = z
  .strictObject({
    id: z.string().uuid(),
    name: z.string().max(255),
    type: z.string().max(255),
    bytes: z.number().int().min(0).max(MAX_FILE_BYTES),
    blob: z.instanceof(Blob),
  })
  .refine((file) => file.blob.size === file.bytes, "The stored file size does not match its bytes.");

export const FileReadSchema = z.strictObject({
  id: z.string().uuid(),
  pages: z.number().int().min(0),
  unreadPages: z.number().int().min(0),
  status: z.enum(["read", "partial", "unread"]),
});

export type Turn = z.infer<typeof TurnSchema>;
export type Attachment = z.infer<typeof AttachmentSchema>;

export const LinkSchema = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Use a complete http or https link without a password.");
