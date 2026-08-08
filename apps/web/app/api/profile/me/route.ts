import { NextRequest, NextResponse } from "next/server";
import { verifyFirebaseToken } from "@/lib/verifyFirebaseToken";
import { supabase } from "@/supabase/server";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const idToken = authHeader?.replace("Bearer ", "");

  if (!idToken) {
    return NextResponse.json({ error: "Missing ID token" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await verifyFirebaseToken(idToken);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid ID token" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("users")
    .select("id, username, sticker_id, created_at")
    .eq("id", uid)
    .maybeSingle(); // returns null instead of throwing when no row exists

  if (error) {
    console.error("Failed to look up profile", error);
    return NextResponse.json(
      { error: "Failed to look up profile" },
      { status: 500 }
    );
  }

  if (!data) {
    // New user — no profile yet.
    return NextResponse.json({ exists: false });
  }

  return NextResponse.json({
    exists: true,
    profile: {
      id: data.id,
      username: data.username,
      stickerId: data.sticker_id,
      createdAt: data.created_at,
    },
  });
}