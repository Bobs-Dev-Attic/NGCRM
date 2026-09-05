import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Next-Gen CRM",
  description: "An AI-native CRM for non-profits. Just say what you need to get done.",
};

// Applies the saved theme to <html> before paint to avoid a flash of the wrong
// colors. Mirrors lib/theme.ts (localStorage key + data-theme + accent override).
const THEME_BOOT = `(function(){try{
  var s=JSON.parse(localStorage.getItem('ngcrm.theme.v1')||'{}');
  var el=document.documentElement;
  if(s.theme&&s.theme!=='system')el.setAttribute('data-theme',s.theme);
  if(s.accent){el.style.setProperty('--accent',s.accent);if(s.accentFg)el.style.setProperty('--accent-fg',s.accentFg);}
}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_BOOT}
        </Script>
        {children}
      </body>
    </html>
  );
}
