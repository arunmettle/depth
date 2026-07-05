import type { AlertRecord } from "@/lib/history/schema";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

type AlertHistoryRow = {
  created_at: string;
  delivery_status: AlertRecord["deliveryStatus"];
  id: string;
  market_symbol: AlertRecord["marketSymbol"];
  message: string;
  proof_content: string;
  proof_content_hash: string;
  proof_height: number;
  proof_media_type: AlertRecord["proof"]["mediaType"];
  proof_width: number;
  rule_name: string;
  side: AlertRecord["side"];
  timeframe: AlertRecord["timeframe"];
  user_id: string;
};

function mapAlertHistoryRow(row: AlertHistoryRow): AlertRecord {
  return {
    createdAt: row.created_at,
    deliveryStatus: row.delivery_status,
    id: row.id,
    marketSymbol: row.market_symbol,
    message: row.message,
    proof: {
      content: row.proof_content,
      contentHash: row.proof_content_hash,
      height: row.proof_height,
      mediaType: row.proof_media_type,
      width: row.proof_width,
    },
    ruleName: row.rule_name,
    side: row.side,
    timeframe: row.timeframe,
  };
}

export async function getPersistedAlertHistoryForCurrentUser(): Promise<AlertRecord[] | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("alert_history")
    .select(
      "created_at,delivery_status,id,market_symbol,message,proof_content,proof_content_hash,proof_height,proof_media_type,proof_width,rule_name,side,timeframe,user_id"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return null;
  }

  return data.map((row) => mapAlertHistoryRow(row as AlertHistoryRow));
}

export async function getPersistedAlertHistoryRecordForCurrentUser(
  id: string
): Promise<{ available: boolean; item: AlertRecord | null }> {
  if (!isSupabaseConfigured()) {
    return { available: false, item: null };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { available: false, item: null };
  }

  const { data, error } = await supabase
    .from("alert_history")
    .select(
      "created_at,delivery_status,id,market_symbol,message,proof_content,proof_content_hash,proof_height,proof_media_type,proof_width,rule_name,side,timeframe,user_id"
    )
    .eq("user_id", user.id)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return { available: false, item: null };
  }

  return {
    available: true,
    item: data ? mapAlertHistoryRow(data as AlertHistoryRow) : null,
  };
}
