import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Audio Notes",
  description: "Upload audio, get transcript and summary",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-[var(--border)] bg-white">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
            <Link href="/" className="text-lg font-semibold">
              Audio Notes
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/" className="text-[var(--muted)] hover:text-[var(--foreground)]">
                Upload
              </Link>
              <Link href="/notes" className="text-[var(--muted)] hover:text-[var(--foreground)]">
                Notes
              </Link>
              <Link
                href="/architecture"
                className="text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                Architecture
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
