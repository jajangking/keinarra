import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-6">
      <h1 className="text-4xl font-bold mb-4">Keinarra</h1>
      <p className="text-zinc-400 mb-8">Robot Vision Platform</p>
      <div className="flex gap-3">
        <Link
          href="/vision"
          className="px-6 py-3 bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Vision Simulator
        </Link>
        <Link
          href="/compare"
          className="px-6 py-3 bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors"
        >
          Compare Models
        </Link>
        <Link
          href="/mediapipe"
          className="px-6 py-3 bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
        >
          MediaPipe Vision
        </Link>
      </div>
    </div>
  );
}
