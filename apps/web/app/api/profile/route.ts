import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/supabase/server";
import { verifyFirebaseToken } from "@/lib/verifyFirebaseToken";

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

/**
 * POST /api/profile
 * Body: { username: string, stickerId: string }
 *
 * Creates the profile row for a newly signed-in user. Only ever
 * inserts — if a profile already exists for this uid, this fails
 * rather than silently overwriting (use a separate PATCH route if
 * you want to support editing later).
 */
export async function POST(req: NextRequest) {
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

  const body = await req.json().catch(() => null);
  const username = body?.username?.trim();
  const stickerId = body?.stickerId?.trim();

  if (!username || !USERNAME_REGEX.test(username)) {
    return NextResponse.json(
      { error: "Username must be 3-20 characters (letters, numbers, underscore)" },
      { status: 400 }
    );
  }
  if (!stickerId) {
    return NextResponse.json({ error: "Sticker is required" }, { status: 400 });
  }

  const { error } = await supabase.from("users").insert({
    id: uid,
    username,
    sticker_id: stickerId,
  });

  if (error) {
    // Postgres unique_violation on username, or profile already exists for this uid
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "That username is already taken" },
        { status: 409 }
      );
    }
    console.error("Failed to create profile", error);
    return NextResponse.json(
      { error: "Failed to create profile" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}