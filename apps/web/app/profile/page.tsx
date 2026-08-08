"use client"
import React from "react"
import { useRouter } from "next/navigation"
import { onAuthStateChanged, type User } from "firebase/auth"
import { auth } from "@/firebase/firebase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import StickerPicker from "@/components/StickerPicker"
import { Loader2 } from "lucide-react"
import { toast } from "sonner";

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/

export default function ProfileSetupPage() {
  const router = useRouter()
  const [user, setUser] = React.useState<User | null | undefined>(undefined)
  const [username, setUsername] = React.useState("")
  const [stickerId, setStickerId] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
      if (!u) router.replace("/") // must be signed in to set up a profile
    })
    return () => unsub()
  }, [router])

  const usernameError =
    username.length > 0 && !USERNAME_REGEX.test(username)
      ? "3-20 characters — letters, numbers, and underscores only"
      : null

  const canSubmit =
    !!user && USERNAME_REGEX.test(username) && !!stickerId && !submitting

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !stickerId) return

    setSubmitting(true)
    setError(null)
    try {
      const idToken = await user.getIdToken()
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ username, stickerId }),
      })

      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "Something went wrong. Please try again.")
        setError(data.error ?? "Something went wrong. Please try again.")
        return
      }

      toast.success("Profile setup complete! Redirecting to home...")
      router.push("/")
    } catch (err) {
      console.error("Profile setup failed", err)
      toast.error("Something went wrong. Please try again.")
      setError("Something went wrong. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  if (user === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold">Set up your profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a username and a sticker — this is how others will see you in
          a lobby.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. sketch_wizard"
            autoComplete="off"
            autoFocus
          />
          {usernameError && (
            <p className="text-sm text-destructive">{usernameError}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Choose a sticker</Label>
          <StickerPicker value={stickerId} onChange={setStickerId} />
        </div>

        {error && (
          <p className="text-center text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={!canSubmit}>
          {submitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          {submitting ? "Saving..." : "Continue"}
        </Button>
      </form>
    </div>
  )
}