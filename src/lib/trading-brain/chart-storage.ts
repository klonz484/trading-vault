import "server-only";

import { randomUUID } from "node:crypto";
import { createUserScopedSupabase } from "@/lib/supabase/user";

const BUCKET = "trader-charts";
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function assertOwnedChartPath(path: string, userId: string): void {
  const parts = path.split("/");
  if (
    parts.length !== 2 ||
    parts[0] !== userId ||
    !/^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(parts[1])
  ) {
    throw new Error("The chart path is invalid or does not belong to the authenticated trader.");
  }
}

/**
 * Creates a short-lived, user-scoped signed upload target.
 * The browser receives only the path and upload token, never a service key.
 */
export async function createTraderChartUploadTarget(input: {
  contentType: string;
  sizeBytes: number;
}) {
  const scope = await createUserScopedSupabase();
  if (!scope) throw new Error("Authentication is required to upload a chart.");

  const extension = EXTENSION_BY_MIME[input.contentType];
  if (!extension) throw new Error("Only JPEG, PNG, and WebP chart images are accepted.");
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > MAX_IMAGE_BYTES) {
    throw new Error("Chart images must be between 1 byte and 15 MiB.");
  }

  const path = `${scope.userId}/${randomUUID()}.${extension}`;
  const { data, error } = await scope.supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path, { upsert: false });

  if (error) throw new Error(`Could not prepare chart upload: ${error.message}`);
  return { path, token: data.token, signedUrl: data.signedUrl };
}

/** Returns a short-lived signed read URL after checking tenant ownership. */
export async function createTraderChartReadUrl(path: string) {
  const scope = await createUserScopedSupabase();
  if (!scope) throw new Error("Authentication is required to view a private chart.");

  assertOwnedChartPath(path, scope.userId);
  const { data, error } = await scope.supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60);

  if (error) throw new Error(`Could not prepare private chart URL: ${error.message}`);
  return data.signedUrl;
}

/** Deletes only a chart object whose path belongs to the current trader. */
export async function deleteTraderChart(path: string) {
  const scope = await createUserScopedSupabase();
  if (!scope) throw new Error("Authentication is required to delete a private chart.");

  assertOwnedChartPath(path, scope.userId);
  const { error } = await scope.supabase.storage.from(BUCKET).remove([path]);

  if (error) throw new Error(`Could not delete private chart: ${error.message}`);
}
