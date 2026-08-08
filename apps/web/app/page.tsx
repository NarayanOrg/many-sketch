import Header from "@/components/layout/Header"
import WaitingLobbies from "@/components/WaitingLobbies"

export default function Home() {
  return (
    <div className="mx-6 space-y-10">
      <Header />
      <WaitingLobbies />
    </div>
  )
}
