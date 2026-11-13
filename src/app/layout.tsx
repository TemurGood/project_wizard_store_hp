import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Good Diagon Alley — Магазин Артефактов Гарри Поттера",
  description:
    "Интерактивная волшебная лавка Косого Переулка: 6 категорий артефактов, палочки Олливандера, Распределяющая шляпа, Викторина 250 вопросов, Stripe и Payme/Click, доставка Совиной Почтой через Telegram-бота.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}

