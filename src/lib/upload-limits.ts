export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = "25MB";
export const WORKBOOK_BUCKET = "tender-workbooks";
export const ALLOWED_WORKBOOK_EXTENSIONS = [".xlsx", ".xls"];
export const ALLOWED_WORKBOOK_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/octet-stream", // some browsers send this for .xlsx
];

export function workbookExtension(filename: string) {
  return "." + (filename.split(".").pop() || "").toLowerCase();
}

/** Storage keys can't hold arbitrary characters; the original name is kept in the DB. */
export function safeStorageName(filename: string) {
  return filename.replace(/[^\w.\- ]+/g, "_");
}

/**
 * Cheap signature check (xlsx is a zip, xls is an OLE container) so a bogus
 * file is rejected at registration, before it can replace a good workbook —
 * the full parse happens later, in the resumable processing steps.
 */
export function looksLikeWorkbook(buffer: Buffer) {
  const isZip = buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  const isOle = buffer.length > 8 && buffer.readUInt32BE(0) === 0xd0cf11e0 && buffer.readUInt32BE(4) === 0xa1b11ae1;
  return isZip || isOle;
}
