import { adminAuth } from "@/firebase/admin";

export async function verifyFirebaseToken(idToken: string) {
  const decoded = await adminAuth.verifyIdToken(idToken);
  return {
    uid: decoded.uid,
    email: decoded.email ?? null,
    name: decoded.name ?? null,
    picture: decoded.picture ?? null,
  };
}