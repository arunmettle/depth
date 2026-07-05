import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type TelegramConnection = {
  connectedAt: string;
  firstName: string | null;
  lastSeenAt: string;
  telegramChatId: string;
  telegramUsername: string | null;
  userId: string;
};

type TelegramProfile = {
  chatId: string;
  firstName: string | null;
  username: string | null;
};

type SupabaseLikeError = {
  code?: string;
};

function mapTelegramConnection(row: {
  connected_at: string;
  last_seen_at: string;
  telegram_chat_id: string;
  telegram_first_name: string | null;
  telegram_username: string | null;
  user_id: string;
}): TelegramConnection {
  return {
    connectedAt: row.connected_at,
    firstName: row.telegram_first_name,
    lastSeenAt: row.last_seen_at,
    telegramChatId: row.telegram_chat_id,
    telegramUsername: row.telegram_username,
    userId: row.user_id,
  };
}

async function getExistingTelegramConnectionByUserId(userId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("telegram_connections")
    .select(
      "connected_at,last_seen_at,telegram_chat_id,telegram_first_name,telegram_username,user_id"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapTelegramConnection(data);
}

export async function getTelegramConnectionForCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("telegram_connections")
    .select(
      "connected_at,last_seen_at,telegram_chat_id,telegram_first_name,telegram_username,user_id"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapTelegramConnection(data);
}

export async function deleteTelegramConnectionForCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return;
  }

  await supabase.from("telegram_connections").delete().eq("user_id", user.id);
}

export function canPersistTelegramConnection() {
  return isSupabaseAdminConfigured();
}

export function isTelegramConnectionConflictError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as SupabaseLikeError).code === "23505"
  );
}

export async function upsertTelegramConnection(
  userId: string,
  profile: TelegramProfile
) {
  const supabase = createAdminClient();
  const timestamp = new Date().toISOString();
  const existingConnection = await getExistingTelegramConnectionByUserId(userId);

  const { error } = await supabase.from("telegram_connections").upsert(
    {
      connected_at: existingConnection?.connectedAt ?? timestamp,
      last_seen_at: timestamp,
      telegram_chat_id: profile.chatId,
      telegram_first_name: profile.firstName,
      telegram_username: profile.username,
      user_id: userId,
    },
    {
      onConflict: "user_id",
    }
  );

  if (error) {
    throw error;
  }
}
