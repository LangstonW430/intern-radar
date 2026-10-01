import Link from "next/link";

export const metadata = { title: "Privacy — intern-radar" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Privacy</h1>
      <p className="text-muted">
        intern-radar is a small, free tool. Here is everything it stores and
        why.
      </p>
      <h2 className="mt-2 font-medium">What&apos;s stored</h2>
      <ul className="list-disc pl-5 text-muted">
        <li>Your email address (sign-in and digest delivery).</li>
        <li>
          The <em>text</em> of your resume and the preferences you set — used
          only to rank internship listings for you.
        </li>
        <li>
          Your feedback on matches (applied / thumbs up / thumbs down), which
          personalizes your ranking.
        </li>
      </ul>
      <h2 className="mt-2 font-medium">Resume PDFs are deleted</h2>
      <p className="text-muted">
        The PDF you upload is parsed to plain text and then deleted
        immediately — the file itself is never kept, only the extracted text.
      </p>
      <h2 className="mt-2 font-medium">What&apos;s never done</h2>
      <p className="text-muted">
        No data is sold or shared. No third-party AI APIs see your data; all
        matching runs on open models operated by this project.
      </p>
      <h2 className="mt-2 font-medium">Deleting your account</h2>
      <p className="text-muted">
        Settings → &quot;Delete my account and data&quot; removes your profile,
        resume text, matches, feedback, and keyword weights immediately and
        irreversibly. Digest emails also carry a one-click unsubscribe link.
      </p>
      <p className="mt-4 text-sm">
        <Link href="/" className="text-accent underline">
          Back to intern-radar
        </Link>
      </p>
    </main>
  );
}
