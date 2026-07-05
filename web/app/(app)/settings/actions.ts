"use server";

import { revalidatePath } from "next/cache";

import { deleteTelegramConnectionForCurrentUser } from "@/lib/telegram/connections";

export async function disconnectTelegramConnection() {
  await deleteTelegramConnectionForCurrentUser();
  revalidatePath("/settings");
}
