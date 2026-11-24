import { z } from "../validation.ts";
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const TurnSchema = z.strictObject({
  id: z.uuid(),
  prompt: z.string().check(z.maxLength(300)),
  text: z.string().check(z.minLength(1), z.maxLength(20000)),
  via: z.enum(["typed", "voice"]),
});
export const AttachmentSchema = z
  .strictObject({
    id: z.uuid(),
    name: z.string().check(z.maxLength(255)),
    type: z.string().check(z.maxLength(255)),
    bytes: z.int().check(z.gte(0), z.lte(MAX_FILE_BYTES)),
    blob: z.instanceof(Blob),
  })
  .check(z.refine((file) => file.blob.size === file.bytes, "The stored file size does not match its bytes."));

export const FileReadSchema = z.strictObject({
  id: z.uuid(),
  pages: z.int().check(z.gte(0)),
  unreadPages: z.int().check(z.gte(0)),
  status: z.enum(["read", "partial", "unread"]),
});

export type Turn = z.infer<typeof TurnSchema>;
export type Attachment = z.infer<typeof AttachmentSchema>;

export const LinkSchema = z.string().check(
  z.maxLength(2048),
  z.refine((value) => {
    try {
      const url = new URL(value);
      return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Use a complete http or https link without a password."),
);
