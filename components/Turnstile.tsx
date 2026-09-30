"use client";

import { useEffect, useRef } from "react";

import { TURNSTILE_ACTION } from "@/lib/turnstile";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          action: string;
          callback: (token: string) => void;
        },
      ) => string;
    };
    __turnstileOnload?: () => void;
  }
}

/** Renders a Cloudflare Turnstile widget; renders nothing when no site key
 * is configured (local dev — the server skips verification then too). */
export default function Turnstile({
  onToken,
}: {
  onToken: (token: string) => void;
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);

  useEffect(() => {
    callback.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!siteKey || !container.current) return;
    const el = container.current;
    let rendered = false;
    const render = () => {
      if (rendered || !window.turnstile) return;
      rendered = true;
      window.turnstile.render(el, {
        sitekey: siteKey,
        // Stamped into the token and re-checked server-side in siteverify.
        action: TURNSTILE_ACTION,
        callback: (token) => callback.current(token),
      });
    };
    if (window.turnstile) {
      render();
      return;
    }
    window.__turnstileOnload = render;
    if (!document.querySelector("script[data-turnstile]")) {
      const script = document.createElement("script");
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=__turnstileOnload";
      script.async = true;
      script.dataset.turnstile = "true";
      document.head.appendChild(script);
    }
  }, [siteKey]);

  if (!siteKey) return null;
  return <div ref={container} className="my-2" />;
}
