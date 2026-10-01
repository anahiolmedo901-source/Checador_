import { supabase } from '@/lib/supabase';

const EVIDENCE_BUCKET = 'attendance-evidence';
const SIGNED_URL_TTL_SECONDS = 3600;

export async function getEvidenceUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}