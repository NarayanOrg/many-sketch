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
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import CreateLobbyModule from "../CreateLobbyModule"
import Image from "next/image"

export default function Header() {
  const router = useRouter()
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
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 py-3 backdrop-blur-md supports-backdrop-filter:bg-background/60">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4">
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-1.5 text-lg font-medium transition-opacity hover:opacity-80"
        >
          <Image
            src="/icon.png"
            alt="ManySketch Logo"
            width={28}
            height={28}
            className="inline-block"
          />
          <span className="flex items-center">
            Many
            <span className="rounded-md bg-foreground px-1.5 py-0.5 text-background transition-colors group-hover:bg-foreground/90">
              Sketch
            </span>
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
            className="pl-9 transition-shadow focus-visible:ring-2 focus-visible:ring-offset-0"
          />
        </form>

        <div className="flex items-center gap-2">
          <Link href="/gallery">
            <Button
              variant="outline"
              className="hidden transition-colors sm:inline-flex"
            >
              Gallery
            </Button>
          </Link>

          {user === undefined ? (
            <Skeleton className="h-9 w-28 rounded-md" />
          ) : user ? (
            <>
              <CreateLobbyModule />
              <DropdownMenu>
                <DropdownMenuTrigger className="rounded-full outline-none ring-offset-background transition-shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  <Avatar className="h-9 w-9 cursor-pointer ring-1 ring-border transition-all hover:ring-2 hover:ring-foreground/20">
                    <AvatarImage src={user.photoURL ?? undefined} />
                    <AvatarFallback>
                      {(user.displayName ?? user.email ?? "?")
                        .charAt(0)
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem className="cursor-pointer">
                    <Link href="/profile">Profile</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer sm:hidden">
                    <Link href="/gallery">Gallery</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleSignOut}
                    className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
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