"use client"
import Link from "next/link"
import { useRouter } from "next/navigation"
import React from "react"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Skeleton } from "../ui/skeleton"
import { onAuthStateChanged, signOut, type User } from "firebase/auth"
import { auth } from "@/firebase/firebase"
import AuthModule from "../AuthModule"
import { Search } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import CreateLobbyModule from "../CreateLobbyModule"

export default function Header() {
  const router = useRouter()
  // undefined = still resolving, null = signed out, User = signed in
  const [user, setUser] = React.useState<User | null | undefined>(undefined)
  const [query, setQuery] = React.useState("")

  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u))
    return () => unsub()
  }, [])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return
    router.push(`/${encodeURIComponent(trimmed)}`)
  }

  async function handleSignOut() {
    await signOut(auth)
    router.push("/")
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 py-3 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="shrink-0 text-lg font-medium">
          Many
          <span className="rounded-md bg-foreground p-1 text-background">
            Sketch
          </span>
        </Link>

        <form
          onSubmit={handleSearch}
          className="relative hidden max-w-sm flex-1 sm:block"
        >
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a lobby by name or code"
            className="pl-9"
          />
        </form>

        <div className="flex items-center gap-2">
          <Link href="/gallery">
            <Button variant="outline" className="hidden sm:inline-flex">
              Gallery
            </Button>
          </Link>

          {user === undefined ? (
            <Skeleton className="h-9 w-28 rounded-md" />
          ) : user ? (
            <>
              <CreateLobbyModule />
              <DropdownMenu>
                <DropdownMenuTrigger className="rounded-full">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={user.photoURL ?? undefined} />
                    <AvatarFallback>
                      {(user.displayName ?? user.email ?? "?")
                        .charAt(0)
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>
                    <Link href="/profile">Profile</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Link href="/gallery" className="sm:hidden">
                      Gallery
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleSignOut}
                    className="text-destructive focus:text-destructive"
                  >
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <AuthModule />
          )}
        </div>
      </div>
    </header>
  )
}
