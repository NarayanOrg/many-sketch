"use client"
import { io, type Socket } from "socket.io-client"
import { auth } from "@/firebase/firebase"

let socket: Socket | null = null
let connectingPromise: Promise<Socket> | null = null

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL!

/**
 * Returns a connected Socket.io client, authenticated with the current
 * user's Firebase ID token. Lazily creates + connects on first call,
 * then reuses the same connection for the rest of the session.
 *
 * Must only be called when a user is signed in — throws otherwise.
 */
export async function getSocket(): Promise<Socket> {
  if (socket?.connected) return socket

  if (connectingPromise) return connectingPromise

  connectingPromise = (async () => {
    const user = auth.currentUser
    if (!user) {
      throw new Error("getSocket() called with no signed-in user")
    }
    const idToken = await user.getIdToken()

    // Reuse the same socket instance across reconnects rather than
    // creating a new one each time; just refresh the auth token.
    if (!socket) {
      socket = io(SOCKET_URL, {
        autoConnect: false,
        auth: { idToken },
      })
    } else {
      socket.auth = { idToken }
    }

    if (!socket.connected) {
      socket.connect()
      await new Promise<void>((resolve, reject) => {
        socket!.once("connect", () => resolve())
        socket!.once("connect_error", (err) => reject(err))
      })
    }

    connectingPromise = null
    return socket
  })()

  return connectingPromise
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}