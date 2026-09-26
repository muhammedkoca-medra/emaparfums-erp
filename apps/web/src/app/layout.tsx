import { type Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { type ReactNode } from "react";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  return { title: t("title"), description: t("tagline") };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const messages = await getMessages();
  return (
    <html lang="tr">
      <head>
        {/*
          Marka fontları <link> ile yüklenir. next/font/google yerel/çevrimdışı modda Turbopack ile
          build hatası (500) veriyordu; <link> çevrimiçiyken fontu getirir, çevrimdışıyken sessizce
          globals.css'teki yedek zincire (Georgia/system-ui) düşer. Ağa çıkınca self-host değerlendirilecek.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* App Router kök layout head'i tüm sayfalar için geçerli; kural pages router içindir. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Manrope:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen antialiased">
        <NextIntlClientProvider locale="tr" messages={messages} timeZone="Europe/Istanbul">
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
