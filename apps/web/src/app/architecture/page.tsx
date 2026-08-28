import { readFile } from "fs/promises";
import { join } from "path";
import ReactMarkdown from "react-markdown";

async function getArchitectureContent(): Promise<string> {
  const paths = [
    join(process.cwd(), "content", "architecture.md"),
    join(process.cwd(), "../../architecture.md"),
  ];

  for (const filePath of paths) {
    try {
      return await readFile(filePath, "utf-8");
    } catch {
      // try next path
    }
  }

  return "# Architecture\n\nSee the GitHub repository for full architecture documentation.";
}

export default async function ArchitecturePage() {
  const content = await getArchitectureContent();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Architecture</h1>
      <article className="prose prose-sm max-w-none rounded-xl border border-[var(--border)] bg-white p-6">
        <ReactMarkdown>{content}</ReactMarkdown>
      </article>
    </div>
  );
}
