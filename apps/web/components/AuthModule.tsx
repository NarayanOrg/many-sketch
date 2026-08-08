"use client"
import React from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "./ui/button"
import Image from "next/image"
import { signInWithPopup, GoogleAuthProvider, getAdditionalUserInfo } from "firebase/auth"
import { auth } from "@/firebase/firebase"
import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation";

const provider = new GoogleAuthProvider()

export default function AuthModule() {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const router = useRouter()

  async function handleGoogleSignIn() {
    setLoading(true)
    setError(null)
    try {
    const results = await signInWithPopup(auth, provider)
    
    // Check if the user is new
    const additionalUserInfo = getAdditionalUserInfo(results)
    if(additionalUserInfo?.isNewUser) {
      return router.push("/profile")
    }
      
      setOpen(false)
    } catch (err) {
      console.error("Sign in failed", err)
      setError("Couldn't sign you in. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Sign in</DialogTrigger>
      <DialogContent className="sm:max-w-106.25">
        <DialogHeader>
          <DialogTitle>Sign in</DialogTitle>
          <DialogDescription>
            Sign in to create a lobby and draw with your friends.
          </DialogDescription>
        </DialogHeader>
        <div>
          <Button
            variant="outline"
            className="mb-2 w-full"
            onClick={handleGoogleSignIn}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Image
                src="/google.svg"
                alt=""
                width={20}
                height={20}
                className="mr-2"
              />
            )}
            {loading ? "Signing in..." : "Sign in with Google"}
          </Button>
          {error && (
            <p className="text-center text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}