import { notFound } from "next/navigation";
import PreviewClient from "./PreviewClient";

/** Dev-only component gallery with fixture data, used to screenshot the
 * design in both themes without a signed-in session. 404s in production. */
export default function PreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PreviewClient />;
}
