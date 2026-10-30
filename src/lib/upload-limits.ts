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
