import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { createClient, getAuthState } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const auth = await getAuthState();

  if (auth.isConfigured && auth.isAuthenticated) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  revalidatePath("/", "layout");

  return NextResponse.redirect(new URL("/sign-in", request.url), {
    status: 302,
  });
}
