import "./globals.css";

export const metadata = {
  title: "NATS (Neural Access & Translation System)",
  description: "Consent-first brain data. Raw signals never leave the device.",
  icons: { icon: "/logo.png", apple: "/logo.png" }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
