export const documentVisibilityValues = ["private", "unlisted", "public"] as const;

export type DocumentVisibility = (typeof documentVisibilityValues)[number];

export const isDocumentVisibility = (value: string): value is DocumentVisibility =>
  documentVisibilityValues.includes(value as DocumentVisibility);
