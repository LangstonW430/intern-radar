import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ConvexClientProvider from "./ConvexClientProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "intern-radar",
  description: "Personalized Summer 2027 internship matching",
};

// Resolves the stored theme (or the system preference) and stamps it on
// <html> before first paint, so neither theme ever flashes. Kept inline —
// a theme library would be ~20 lines of this exact logic plus a dependency.
const themeInit = `(function(){try{
var s=localStorage.getItem("theme");
var m=window.matchMedia("(prefers-color-scheme: dark)");
var t=(s==="light"||s==="dark")?s:(m.matches?"dark":"light");
document.documentElement.dataset.theme=t;
m.addEventListener("change",function(e){
var c=localStorage.getItem("theme");
if(c!=="light"&&c!=="dark"){document.documentElement.dataset.theme=e.matches?"dark":"light";}
});
}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <ConvexAuthNextjsServerProvider>
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
        suppressHydrationWarning
      >
        <body className="min-h-full flex flex-col bg-canvas text-ink">
          <script dangerouslySetInnerHTML={{ __html: themeInit }} />
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
