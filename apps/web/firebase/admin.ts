// lib/firebase-admin.js

import { initializeApp, getApps, cert } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"

function createFirebaseAdmin() {
  const apps = getApps()

  if (apps.length > 0) {
    return apps[0]
  }

  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  })
}

const app = createFirebaseAdmin()

export const adminAuth = getAuth(app)