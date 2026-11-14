"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { USD_TO_UZS_RATE, calculateWizardRank } from "@/lib/constants";
import {
  SORTING_HAT_QUESTIONS,
  HOUSE_DETAILS,
  computeSortedHouse,
  type HouseDetails,
} from "@/data/sorting-hat-data";
import { LORE_ENCYCLOPEDIA } from "@/data/lore-encyclopedia";
import { RealtimeLiveSync } from "./RealtimeLiveSync";
import type { LiveLeaderboardRow, LiveOrderRow } from "@/lib/realtime";

export type ActiveTab =
  | "store"
  | "lore"
  | "sorting"
  | "trivia"
  | "leaderboard"
  | "profile"
  | "admin";

export interface Product {
  id: number;
  title: string;
  category_slug: string;
  category_name: string;
  price_usd: number | string;
  discount_percent: number;
  fixed_discount_usd: number | string;
  short_description: string;
  lore_description: string;
  image_url: string;
  storage_key?: string | null;
  origin_wizard?: string;
  rarity?: string;
  stock?: number;
}

export interface Category {
  id: number;
  slug: string;
  name_ru: string;
  name_en: string;
  description: string;
  icon: string;
  sort_order: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
  final_price_usd: number;
}

export interface UserProfile {
  id: number;
  login: string;
  email: string;
  phone: string;
  first_name?: string | null;
  last_name?: string | null;
  age?: number | null;
  gender?: string | null;
  house?: string | null;
  trivia_score: number;
  wizard_rank: string;
  games_played: number;
  delivery_address?: string | null;
  delivery_lat?: number | null;
  delivery_lng?: number | null;
  telegram_chat_id?: string | null;
  role: string;
}

export function getFinalPriceUsd(p: Product): number {
  const base = Number(p.price_usd || 0);
  const pct = Number(p.discount_percent || 0);
  const fixed = Number(p.fixed_discount_usd || 0);
  let after = base;
  if (pct > 0) {
    after = after * (1 - pct / 100);
  }
  if (fixed > 0) {
    after = Math.max(1, after - fixed);
  }
  return Number(after.toFixed(2));
}

export function formatMoney(amountUsd: number, currency: "USD" | "UZS"): string {
  if (currency === "UZS") {
    const uzs = Math.round(Number(amountUsd) * USD_TO_UZS_RATE);
    return `${uzs.toLocaleString("ru-RU")} сум`;
  }
  return `$${Number(amountUsd).toFixed(2)}`;
}

// Web Audio API magical chime synthesizer
function playMagicalTone(
  type: "chime" | "flip" | "spell" | "success",
  enabled: boolean
) {
  if (!enabled || typeof window === "undefined") return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const notes =
      type === "success"
        ? [523.25, 659.25, 783.99, 1046.5]
        : type === "spell"
        ? [440, 554.37, 659.25, 880]
        : type === "flip"
        ? [330, 392]
        : [587.33, 880];

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type === "flip" ? "triangle" : "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.065);
      gain.gain.setValueAtTime(0.06, now + idx * 0.065);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.065 + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.065);
      osc.stop(now + idx * 0.065 + 0.3);
    });
  } catch {
    // Ignore audio context autoplay restrictions
  }
}

export function DiagonAlleyApp({
  initialTab = "store",
}: {
  initialTab?: ActiveTab;
}) {
  const [activeTab, setActiveTab] = useState<ActiveTab>(initialTab);
  const [currency, setCurrency] = useState<"USD" | "UZS">("USD");
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [realtimeStatus, setRealtimeStatus] = useState<string>("connecting");

  // Storefront state
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [loadingStore, setLoadingStore] = useState<boolean>(true);
  const [selectedProductModal, setSelectedProductModal] = useState<Product | null>(
    null
  );

  // Cart & Promo & Checkout state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState<boolean>(false);
  const [promoInput, setPromoInput] = useState<string>("");
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    percent: number;
    label: string;
  } | null>(null);
  const [promoMessage, setPromoMessage] = useState<string>("");

  // Payment Modals & Receipt
  const [checkoutGateway, setCheckoutGateway] = useState<
    "stripe" | "payme" | "click" | null
  >(null);
  const [pendingCheckoutData, setPendingCheckoutData] = useState<any | null>(null);
  const [stripeCard, setStripeCard] = useState<string>("4242 4242 4242 4242");
  const [stripeExpiry, setStripeExpiry] = useState<string>("12/30");
  const [stripeCvc, setStripeCvc] = useState<string>("424");
  const [uzCardNumber, setUzCardNumber] = useState<string>("8600 0000 0000 0000");
  const [uzSmsCode, setUzSmsCode] = useState<string>("666666");
  const [uzStep, setUzStep] = useState<"card" | "sms">("card");
  const [paymentProcessing, setPaymentProcessing] = useState<boolean>(false);
  const [paymentError, setPaymentError] = useState<string>("");
  const [completedReceipt, setCompletedReceipt] = useState<{
    order: any;
    telegram_deep_link: string;
    provider_label: string;
  } | null>(null);

  // Built-in Telegram Bot quick simulator inside Receipt for easy testing alongside real link
  const [simAddressInput, setSimAddressInput] = useState<string>(
    "г. Ташкент, Чиланзарский район, ул. Катартал 12, кв. 45"
  );
  const [simBotReply, setSimBotReply] = useState<string>("");
  const [simBotLoading, setSimBotLoading] = useState<boolean>(false);

  // User & Favorites & Orders
  const [user, setUser] = useState<UserProfile | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);
  const [userOrders, setUserOrders] = useState<any[]>([]);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authForm, setAuthForm] = useState({
    login: "",
    email: "",
    phone: "",
    password: "",
    first_name: "",
    last_name: "",
    age: "",
  });
  const [authNotification, setAuthNotification] = useState<string>("");

  // Lore Encyclopedia state
  const [activeLoreIdx, setActiveLoreIdx] = useState<number>(0);

  // Game 1: Sorting Hat state
  const [sortingStep, setSortingStep] = useState<number>(0);
  const [sortingGender, setSortingGender] = useState<"male" | "female">("male");
  const [sortingAnswers, setSortingAnswers] = useState<number[]>([]);
  const [sortedResult, setSortedResult] = useState<HouseDetails | null>(null);

  // Game 2: Wizarding World Trivia (250 questions pool)
  const [triviaQuestions, setTriviaQuestions] = useState<any[]>([]);
  const [triviaPoolTotal, setTriviaPoolTotal] = useState<number>(250);
  const [triviaIndex, setTriviaIndex] = useState<number>(0);
  const [triviaScore, setTriviaScore] = useState<number>(0);
  const [triviaCorrectCount, setTriviaCorrectCount] = useState<number>(0);
  const [triviaSelectedOption, setTriviaSelectedOption] = useState<number | null>(
    null
  );
  const [triviaFinished, setTriviaFinished] = useState<boolean>(false);
  const [triviaLoading, setTriviaLoading] = useState<boolean>(false);
  const [questionStartTime, setQuestionStartTime] = useState<number>(Date.now());
  const [triviaResultSummary, setTriviaResultSummary] = useState<{
    sessionScore: number;
    totalScore: number;
    wizardRank: string;
  } | null>(null);

  // Leaderboard state
  const [leaderboard, setLeaderboard] = useState<any[]>([]);

  // Admin Panel state
  const [adminOrders, setAdminOrders] = useState<any[]>([]);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [adminForm, setAdminForm] = useState({
    title: "",
    category_slug: "artifacts",
    price_usd: "45",
    discount_percent: "0",
    fixed_discount_usd: "0",
    short_description: "",
    lore_description: "",
    image_url: "",
    storage_key: "",
    origin_wizard: "Мастерская Косого Переулка",
    rarity: "Редкий артефакт",
    stock: "15",
  });
  const [uploadingImage, setUploadingImage] = useState<boolean>(false);
  const [adminNotice, setAdminNotice] = useState<string>("");

  // Toast notification
  const [toast, setToast] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 3800);
  }, []);

  // Load initial data
  const fetchStoreData = useCallback(async () => {
    try {
      setLoadingStore(true);
      const res = await fetch("/api/products");
      const data = await res.json();
      if (data.categories) setCategories(data.categories);
      if (data.products) setProducts(data.products);
    } catch (e) {
      console.error("Failed to fetch products:", e);
    } finally {
      setLoadingStore(false);
    }
  }, []);

  const fetchLeaderboardData = useCallback(async () => {
    try {
      const res = await fetch("/api/leaderboard");
      const data = await res.json();
      if (data.leaderboard) setLeaderboard(data.leaderboard);
    } catch (e) {
      console.error("Failed to fetch leaderboard:", e);
    }
  }, []);

  const fetchAdminOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/orders");
      const data = await res.json();
      if (data.orders) setAdminOrders(data.orders);
    } catch (e) {
      console.error("Failed to fetch admin orders:", e);
    }
  }, []);

  const refreshUserProfile = useCallback(async (userId: number) => {
    try {
      const res = await fetch(`/api/user?userId=${userId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.user) {
        setUser(data.user);
        localStorage.setItem("gda_user", JSON.stringify(data.user));
      }
      if (data.orders) setUserOrders(data.orders);
      if (data.favorites) {
        setFavoriteIds(data.favorites.map((p: Product) => Number(p.id)));
      }
    } catch (e) {
      console.error("Failed to refresh user profile:", e);
    }
  }, []);

  useEffect(() => {
    fetchStoreData();
    fetchLeaderboardData();
    fetchAdminOrders();

    // Restore user and cart from localStorage
    try {
      const savedUser = localStorage.getItem("gda_user");
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        setUser(parsed);
        if (parsed?.id) refreshUserProfile(parsed.id);
      }
      const savedCart = localStorage.getItem("gda_cart");
      if (savedCart) {
        setCart(JSON.parse(savedCart));
      }
      const savedFavs = localStorage.getItem("gda_favs");
      if (savedFavs) {
        setFavoriteIds(JSON.parse(savedFavs));
      }

      // Check if returning from official checkout.stripe.com
      const params = new URLSearchParams(window.location.search);
      const stripeSessionId = params.get("stripe_session_id");
      const stripeCheckoutId = params.get("checkout_id");
      const stripeCanceled = params.get("stripe_canceled");

      if (stripeSessionId || stripeCheckoutId) {
        window.history.replaceState({}, "", window.location.pathname);
        fetch(
          `/api/checkout/stripe-session?session_id=${encodeURIComponent(
            stripeSessionId || ""
          )}&checkout_id=${encodeURIComponent(stripeCheckoutId || "")}`
        )
          .then((r) => r.json())
          .then((data) => {
            if (data?.order) {
              setCompletedReceipt({
                order: data.order,
                telegram_deep_link: `https://t.me/wizard_HP_store_bot?start=order_${data.order.id}`,
                provider_label:
                  "Stripe Hosted Checkout (checkout.stripe.com • Paid)",
              });
              localStorage.setItem("gda_cart", JSON.stringify([]));
              setCart([]);
              fetchAdminOrders();
              showToast(
                `🎉 Оплата через checkout.stripe.com прошла успешно! Заказ ${data.order.id}`
              );
            }
          })
          .catch((err) => {
            console.error("Stripe session verification error:", err);
          });
      } else if (stripeCanceled) {
        window.history.replaceState({}, "", window.location.pathname);
        showToast("ℹ️ Оплата на странице checkout.stripe.com была отменена.");
      }
    } catch {
      // Ignore storage errors
    }
  }, [fetchStoreData, fetchLeaderboardData, fetchAdminOrders, refreshUserProfile, showToast]);

  // Background poll of Telegram Bot updates so live location messages sent to @wizard_HP_store_bot sync automatically
  useEffect(() => {
    const interval = setInterval(() => {
      fetch("/api/telegram/webhook")
        .then((r) => r.json())
        .then((d) => {
          if (d?.polled > 0) {
            fetchAdminOrders();
            if (user?.id) refreshUserProfile(user.id);
          }
        })
        .catch(() => {});
    }, 6000);
    return () => clearInterval(interval);
  }, [fetchAdminOrders, refreshUserProfile, user?.id]);

  // Realtime callbacks from Neon Realtime
  const handleRealtimeLeaderboard = useCallback(
    (rows: readonly LiveLeaderboardRow[]) => {
      if (rows && rows.length > 0) {
        setLeaderboard([...rows]);
      }
    },
    []
  );

  const handleRealtimeOrders = useCallback(
    (rows: readonly LiveOrderRow[]) => {
      if (rows && rows.length >= 0) {
        fetchAdminOrders();
        if (user?.id) refreshUserProfile(user.id);
      }
    },
    [fetchAdminOrders, refreshUserProfile, user?.id]
  );

  // Filtered products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesCat =
        selectedCategory === "all" ||
        p.category_slug === selectedCategory ||
        p.category_name === selectedCategory;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        p.title.toLowerCase().includes(q) ||
        p.lore_description.toLowerCase().includes(q) ||
        p.category_name.toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  // Cart helpers
  const saveCart = (next: CartItem[]) => {
    setCart(next);
    try {
      localStorage.setItem("gda_cart", JSON.stringify(next));
    } catch {}
  };

  const addToCart = (product: Product) => {
    playMagicalTone("chime", soundEnabled);
    const finalPrice = getFinalPriceUsd(product);
    const existingIdx = cart.findIndex((c) => c.product.id === product.id);
    if (existingIdx > -1) {
      const updated = [...cart];
      updated[existingIdx].quantity += 1;
      saveCart(updated);
    } else {
      saveCart([...cart, { product, quantity: 1, final_price_usd: finalPrice }]);
    }
    showToast(`✨ «${product.title}» добавлен в ваш сундук (корзину)!`);
  };

  const updateCartQty = (productId: number, delta: number) => {
    const updated = cart
      .map((item) =>
        item.product.id === productId
          ? { ...item, quantity: item.quantity + delta }
          : item
      )
      .filter((item) => item.quantity > 0);
    saveCart(updated);
  };

  const toggleFavorite = async (product: Product) => {
    playMagicalTone("chime", soundEnabled);
    const pid = Number(product.id);
    const isFav = favoriteIds.includes(pid);
    const nextFavs = isFav
      ? favoriteIds.filter((id) => id !== pid)
      : [...favoriteIds, pid];
    setFavoriteIds(nextFavs);
    try {
      localStorage.setItem("gda_favs", JSON.stringify(nextFavs));
    } catch {}

    if (user?.id) {
      await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, productId: pid }),
      });
    }
    showToast(
      isFav
        ? `Удалено из Избранного: ${product.title}`
        : `❤️ Добавлено в Избранное: ${product.title}`
    );
  };

  const cartSubtotalUsd = useMemo(() => {
    return cart.reduce(
      (sum, item) => sum + item.final_price_usd * item.quantity,
      0
    );
  }, [cart]);

  const cartDiscountUsd = useMemo(() => {
    if (!appliedPromo) return 0;
    return Number(((cartSubtotalUsd * appliedPromo.percent) / 100).toFixed(2));
  }, [cartSubtotalUsd, appliedPromo]);

  const cartTotalUsd = useMemo(() => {
    return Math.max(0, Number((cartSubtotalUsd - cartDiscountUsd).toFixed(2)));
  }, [cartSubtotalUsd, cartDiscountUsd]);

  const handleApplyPromo = () => {
    const code = promoInput.trim().toUpperCase();
    const map: Record<string, { percent: number; label: string }> = {
      LUMOS10: { percent: 10, label: "Заклинание Света LUMOS10 (-10%)" },
      ALOHOMORA: { percent: 20, label: "Секретное заклинание ALOHOMORA (-20%)" },
      FELIX25: { percent: 25, label: "Жидкая Удача FELIX25 (-25%)" },
    };
    if (map[code]) {
      playMagicalTone("spell", soundEnabled);
      setAppliedPromo({ code, ...map[code] });
      setPromoMessage(`✨ Промокод применён: ${map[code].label}`);
    } else {
      setAppliedPromo(null);
      setPromoMessage(
        "⚠️ Неизвестное заклинание! Попробуйте LUMOS10 (10%) или ALOHOMORA (20%)."
      );
    }
  };

  // Start Checkout (Creates ONLY a pending_checkout row, NEVER an order before payment!)
  const initiatePaymentGateway = async (
    provider: "stripe" | "payme" | "click"
  ) => {
    if (cart.length === 0) return;
    setPaymentError("");
    setPaymentProcessing(true);
    try {
      const res = await fetch("/api/checkout/pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user?.id || null,
          customer_login: user?.login || "Гость_Хогвартса",
          customer_email: user?.email || "guest@hogwarts.ac.uk",
          customer_phone: user?.phone || "+998 90 000 00 00",
          items: cart.map((c) => ({
            id: c.product.id,
            title: c.product.title,
            quantity: c.quantity,
            price_usd: c.final_price_usd,
            final_price_usd: c.final_price_usd,
          })),
          promo_code: appliedPromo?.code || "",
          currency: provider === "stripe" ? "USD" : "UZS",
          payment_provider: provider,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка создания предзаказа");

      setPendingCheckoutData(data.checkout);
      setCheckoutGateway(provider);
      setUzStep("card");
      playMagicalTone("flip", soundEnabled);
    } catch (err: any) {
      setPaymentError(err.message);
    } finally {
      setPaymentProcessing(false);
    }
  };

  // Redirect to real official checkout.stripe.com Hosted Checkout page
  const redirectToStripeHostedCheckout = async () => {
    if (!pendingCheckoutData) return;
    setPaymentProcessing(true);
    setPaymentError("");
    try {
      const res = await fetch("/api/checkout/stripe-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkout_id: pendingCheckoutData.id,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(
          data.error || "Не удалось создать сессию checkout.stripe.com"
        );
      }
      playMagicalTone("flip", soundEnabled);
      window.location.href = data.url;
    } catch (err: any) {
      setPaymentError(err.message);
      setPaymentProcessing(false);
    }
  };

  // Complete Stripe Test Payment via /api/webhooks/stripe
  const confirmStripePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingCheckoutData) return;
    setPaymentProcessing(true);
    setPaymentError("");
    try {
      const res = await fetch("/api/webhooks/stripe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `evt_stripe_${Date.now()}`,
          type: "checkout.session.completed",
          data: {
            object: {
              id: `cs_test_${Date.now()}`,
              client_reference_id: pendingCheckoutData.id,
              card_number: stripeCard,
              amount_total: Math.round(Number(pendingCheckoutData.total_usd) * 100),
              currency: "usd",
              payment_status: "paid",
            },
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка платежа Stripe");

      playMagicalTone("success", soundEnabled);
      setCompletedReceipt({
        order: data.order,
        telegram_deep_link: data.telegram_deep_link,
        provider_label: "Stripe International (Test Mode • 4242)",
      });
      setCheckoutGateway(null);
      setCartOpen(false);
      saveCart([]);
      fetchAdminOrders();
      if (user?.id) refreshUserProfile(user.id);
    } catch (err: any) {
      setPaymentError(err.message);
    } finally {
      setPaymentProcessing(false);
    }
  };

  // Complete Payme / Click Sandbox Payment via /api/webhooks/payme or /api/webhooks/click
  const confirmUzSandboxPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingCheckoutData || !checkoutGateway) return;

    if (uzStep === "card") {
      const cleanCard = uzCardNumber.replace(/\s+/g, "");
      if (cleanCard !== "8600000000000000") {
        setPaymentError(
          "Для тестового шлюза Payme/Click введите карту: 8600 0000 0000 0000"
        );
        return;
      }
      setPaymentError("");
      setUzStep("sms");
      return;
    }

    setPaymentProcessing(true);
    setPaymentError("");
    try {
      if (checkoutGateway === "payme") {
        // Step 1: CheckPerformTransaction
        await fetch("/api/webhooks/payme", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "CheckPerformTransaction",
            params: {
              amount: Number(pendingCheckoutData.total_uzs) * 100,
              account: { checkout_id: pendingCheckoutData.id },
            },
          }),
        });

        // Step 2: CreateTransaction
        const txId = `payme_${Date.now()}`;
        await fetch("/api/webhooks/payme", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 2,
            method: "CreateTransaction",
            params: {
              id: txId,
              time: Date.now(),
              amount: Number(pendingCheckoutData.total_uzs) * 100,
              account: { checkout_id: pendingCheckoutData.id },
            },
          }),
        });

        // Step 3: PerformTransaction
        const res = await fetch("/api/webhooks/payme", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 3,
            method: "PerformTransaction",
            params: {
              id: txId,
              card_number: uzCardNumber,
              sms_code: uzSmsCode,
              account: { checkout_id: pendingCheckoutData.id },
            },
          }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(
            data.error?.message?.ru || "Ошибка подтверждения Payme"
          );
        }

        playMagicalTone("success", soundEnabled);
        setCompletedReceipt({
          order: data.result.order,
          telegram_deep_link: data.result.telegram_deep_link,
          provider_label: "Payme Sandbox (UZCard 8600 • JSON-RPC)",
        });
      } else {
        // Click Prepare (action = 0)
        const clickTxId = Date.now();
        await fetch("/api/webhooks/click", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            click_trans_id: clickTxId,
            merchant_trans_id: pendingCheckoutData.id,
            amount: Number(pendingCheckoutData.total_uzs),
            action: 0,
          }),
        });

        // Click Complete (action = 1)
        const res = await fetch("/api/webhooks/click", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            click_trans_id: clickTxId,
            merchant_trans_id: pendingCheckoutData.id,
            amount: Number(pendingCheckoutData.total_uzs),
            action: 1,
            card_number: uzCardNumber,
            sms_code: uzSmsCode,
          }),
        });
        const data = await res.json();
        if (!res.ok || data.error !== 0) {
          throw new Error(data.error_note || "Ошибка подтверждения Click");
        }

        playMagicalTone("success", soundEnabled);
        setCompletedReceipt({
          order: data.order,
          telegram_deep_link: data.telegram_deep_link,
          provider_label: "Click Sandbox (UZCard 8600 • SHOP-API)",
        });
      }

      setCheckoutGateway(null);
      setCartOpen(false);
      saveCart([]);
      fetchAdminOrders();
      if (user?.id) refreshUserProfile(user.id);
    } catch (err: any) {
      setPaymentError(err.message);
    } finally {
      setPaymentProcessing(false);
    }
  };

  // Simulate sending location to @wizard_HP_store_bot directly from receipt (also sends real notification to Admin 3540653!)
  const handleSimulateTelegramBotDelivery = async (orderId: string) => {
    setSimBotLoading(true);
    setSimBotReply("");
    try {
      // 1. Trigger /start order_<ORDER_ID>
      await fetch("/api/telegram/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            chat: { id: 3540653 },
            text: `/start order_${orderId}`,
          },
        }),
      });

      // 2. Send Delivery Address & Location
      const res = await fetch("/api/telegram/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            chat: { id: 3540653 },
            text: simAddressInput,
          },
        }),
      });
      const data = await res.json();
      if (data.ok) {
        playMagicalTone("spell", soundEnabled);
        setSimBotReply(
          `✅ Адрес «${simAddressInput}» сохранён в базе Neon! Статус заказа изменён на «Готовится к отправке», а в Telegram админу (ID 3540653) отправлено уведомление!`
        );
        // Update receipt order status locally
        setCompletedReceipt((prev) =>
          prev
            ? {
                ...prev,
                order: {
                  ...prev.order,
                  status: "Готовится к отправке",
                  delivery_address: simAddressInput,
                },
              }
            : null
        );
        fetchAdminOrders();
        if (user?.id) refreshUserProfile(user.id);
      }
    } catch (err: any) {
      setSimBotReply(`Ошибка: ${err.message}`);
    } finally {
      setSimBotLoading(false);
    }
  };

  // ==================== SORTING HAT LOGIC ====================
  const handleSortingAnswer = async (optionIdx: number) => {
    playMagicalTone("flip", soundEnabled);
    const currentQ = SORTING_HAT_QUESTIONS[sortingStep];
    const chosenOpt = currentQ.options[optionIdx];

    let nextGender = sortingGender;
    if (sortingStep === 0 && chosenOpt.genderValue) {
      nextGender = chosenOpt.genderValue;
      setSortingGender(nextGender);
    }

    const nextAnswers = [...sortingAnswers, optionIdx];
    setSortingAnswers(nextAnswers);

    if (sortingStep + 1 < SORTING_HAT_QUESTIONS.length) {
      setSortingStep(sortingStep + 1);
    } else {
      // Compute final House/School with strict Male->Durmstrang / Female->Beauxbatons rule
      const result = computeSortedHouse(nextGender, nextAnswers);
      setSortedResult(result);
      playMagicalTone("success", soundEnabled);

      try {
        const res = await fetch("/api/sorting", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user?.id || null,
            gender: nextGender,
            answers: nextAnswers,
            house: result.key,
          }),
        });
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          localStorage.setItem("gda_user", JSON.stringify(data.user));
        }
        fetchLeaderboardData();
      } catch {}
    }
  };

  const restartSortingHat = () => {
    playMagicalTone("flip", soundEnabled);
    setSortingStep(0);
    setSortingAnswers([]);
    setSortedResult(null);
  };

  // ==================== TRIVIA GAME LOGIC ====================
  const loadNewTriviaSession = useCallback(async () => {
    setTriviaLoading(true);
    setTriviaFinished(false);
    setTriviaIndex(0);
    setTriviaScore(0);
    setTriviaCorrectCount(0);
    setTriviaSelectedOption(null);
    setTriviaResultSummary(null);
    try {
      const res = await fetch("/api/trivia?count=10");
      const data = await res.json();
      if (data.questions) {
        setTriviaQuestions(data.questions);
        setTriviaPoolTotal(data.totalPoolSize || 250);
        setQuestionStartTime(Date.now());
      }
    } catch (e) {
      console.error("Failed to load trivia:", e);
    } finally {
      setTriviaLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "trivia" && triviaQuestions.length === 0) {
      loadNewTriviaSession();
    }
  }, [activeTab, triviaQuestions.length, loadNewTriviaSession]);

  const handleTriviaOptionClick = async (optIdx: number) => {
    if (triviaSelectedOption !== null) return;
    setTriviaSelectedOption(optIdx);

    const currentQ = triviaQuestions[triviaIndex];
    const isCorrect = optIdx === Number(currentQ.correct_index);
    const elapsedSec = Math.max(1, (Date.now() - questionStartTime) / 1000);
    // Speed bonus up to +10 pts if answered within 10 seconds
    const speedBonus = isCorrect ? Math.max(0, Math.round(10 - elapsedSec * 0.7)) : 0;
    const earned = isCorrect ? Number(currentQ.points || 20) + speedBonus : 0;

    if (isCorrect) {
      playMagicalTone("spell", soundEnabled);
    } else {
      playMagicalTone("flip", soundEnabled);
    }

    const nextScore = triviaScore + earned;
    const nextCorrect = triviaCorrectCount + (isCorrect ? 1 : 0);
    setTriviaScore(nextScore);
    setTriviaCorrectCount(nextCorrect);
  };

  const handleTriviaNext = async () => {
    if (triviaIndex + 1 < triviaQuestions.length) {
      setTriviaIndex(triviaIndex + 1);
      setTriviaSelectedOption(null);
      setQuestionStartTime(Date.now());
    } else {
      // Finish session & submit score
      setTriviaFinished(true);
      playMagicalTone("success", soundEnabled);
      const accuracy = Math.round(
        (triviaCorrectCount / Math.max(1, triviaQuestions.length)) * 100
      );
      try {
        const res = await fetch("/api/trivia", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user?.id || null,
            login: user?.login || "Юный_Волшебник",
            house: user?.house || sortedResult?.key || "Gryffindor",
            sessionScore: triviaScore,
            accuracyPercent: accuracy,
          }),
        });
        const data = await res.json();
        setTriviaResultSummary({
          sessionScore: triviaScore,
          totalScore: data.totalScore ?? triviaScore,
          wizardRank: data.wizardRank ?? calculateWizardRank(triviaScore),
        });
        if (data.user) {
          setUser(data.user);
          localStorage.setItem("gda_user", JSON.stringify(data.user));
        }
        fetchLeaderboardData();
      } catch {}
    }
  };

  // ==================== USER AUTH HANDLERS ====================
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthNotification("");
    try {
      if (authMode === "register") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(authForm),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Ошибка регистрации");
        setUser(data.user);
        localStorage.setItem("gda_user", JSON.stringify(data.user));
        playMagicalTone("success", soundEnabled);
        showToast(`🧙‍♂️ Добро пожаловать в Косой Переулок, ${data.user.login}!`);
        refreshUserProfile(data.user.id);
      } else {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            identifier: authForm.login || authForm.email,
            password: authForm.password,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Ошибка входа");
        setUser(data.user);
        localStorage.setItem("gda_user", JSON.stringify(data.user));
        playMagicalTone("success", soundEnabled);
        showToast(`✨ С возвращением, ${data.user.login}!`);
        refreshUserProfile(data.user.id);
      }
    } catch (err: any) {
      setAuthNotification(`⚠️ ${err.message}`);
    }
  };

  // ==================== ADMIN HANDLERS ====================
  const handleAdminImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    setAdminNotice("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка загрузки в Neon Storage");
      setAdminForm((prev) => ({
        ...prev,
        image_url: data.url,
        storage_key: data.key,
      }));
      setAdminNotice(
        `✅ Изображение загружено в Neon Object Storage (${data.key})!`
      );
    } catch (err: any) {
      setAdminNotice(`⚠️ Ошибка загрузки файла: ${err.message}`);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleAdminSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminNotice("");
    try {
      if (editingProduct) {
        const res = await fetch(`/api/products/${editingProduct.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(adminForm),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Ошибка обновления");
        setAdminNotice(`✅ Товар «${data.product.title}» успешно обновлён!`);
        setEditingProduct(null);
      } else {
        const res = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(adminForm),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Ошибка добавления");
        setAdminNotice(
          `✅ Новый артефакт «${data.product.title}» добавлен в каталог!`
        );
      }
      setAdminForm({
        title: "",
        category_slug: "artifacts",
        price_usd: "45",
        discount_percent: "0",
        fixed_discount_usd: "0",
        short_description: "",
        lore_description: "",
        image_url: "",
        storage_key: "",
        origin_wizard: "Мастерская Косого Переулка",
        rarity: "Редкий артефакт",
        stock: "15",
      });
      fetchStoreData();
    } catch (err: any) {
      setAdminNotice(`⚠️ ${err.message}`);
    }
  };

  const handleAdminDeleteProduct = async (id: number, title: string) => {
    try {
      const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
      if (res.ok) {
        showToast(`🗑️ Товар «${title}» удалён из лавки`);
        fetchStoreData();
      }
    } catch {}
  };

  const handleMarkOrderShipped = async (orderId: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}/ship`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        playMagicalTone("success", soundEnabled);
        showToast(
          `🦉 Заказ ${orderId} отправлен! Бот уведомил покупателя в Telegram.`
        );
        fetchAdminOrders();
        if (user?.id) refreshUserProfile(user.id);
      }
    } catch (err: any) {
      showToast(`Ошибка отправки: ${err.message}`);
    }
  };

  const switchTab = (tab: ActiveTab) => {
    playMagicalTone("flip", soundEnabled);
    setActiveTab(tab);
  };

  return (
    <div style={{ paddingTop: "12px" }}>
      {/* Neon Realtime Live Bridge */}
      <RealtimeLiveSync
        onLeaderboardUpdate={handleRealtimeLeaderboard}
        onOrdersUpdate={handleRealtimeOrders}
        onStatusChange={setRealtimeStatus}
      />

      {/* Toast Banner */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 2000,
            background: "#8b0000",
            color: "#fff3c9",
            border: "3px double #ffd700",
            padding: "14px 20px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
            maxWidth: "420px",
            fontWeight: "bold",
          }}
        >
          {toast}
        </div>
      )}

      {/* ==================== VINTAGE HEADER & NAVIGATION ==================== */}
      <header className="spellbook-shell" style={{ marginBottom: "22px" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            borderBottom: "2px solid #8b0000",
            paddingBottom: "10px",
            marginBottom: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span className="badge-pill">
              ⚡ Neon Postgres • Storage • Realtime (
              {realtimeStatus === "Error" ? "Live Sync" : realtimeStatus})
            </span>
            <button
              type="button"
              className="ink-btn-secondary"
              style={{ padding: "4px 10px", fontSize: "0.85rem" }}
              onClick={() => setSoundEnabled(!soundEnabled)}
            >
              {soundEnabled ? "🔊 Звуки магии" : "🔇 Без звука"}
            </button>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            {/* Currency Switcher (Bonus Feature) */}
            <div
              style={{
                display: "inline-flex",
                border: "2px solid #8b0000",
                background: "#facf7f",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  playMagicalTone("chime", soundEnabled);
                  setCurrency("USD");
                }}
                style={{
                  padding: "5px 12px",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontWeight: "bold",
                  background: currency === "USD" ? "#8b0000" : "transparent",
                  color: currency === "USD" ? "#fff3c9" : "#8b0000",
                }}
              >
                $ USD (Stripe)
              </button>
              <button
                type="button"
                onClick={() => {
                  playMagicalTone("chime", soundEnabled);
                  setCurrency("UZS");
                }}
                style={{
                  padding: "5px 12px",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontWeight: "bold",
                  background: currency === "UZS" ? "#8b0000" : "transparent",
                  color: currency === "UZS" ? "#fff3c9" : "#8b0000",
                }}
              >
                UZS Сум (Payme/Click)
              </button>
            </div>

            <button
              type="button"
              className="ink-btn"
              onClick={() => setCartOpen(true)}
            >
              🛒 Сундук ({cart.reduce((s, i) => s + i.quantity, 0)}) •{" "}
              {formatMoney(cartTotalUsd, currency)}
            </button>
          </div>
        </div>

        <div style={{ textAlign: "center", padding: "6px 0 12px" }}>
          <div style={{ fontSize: "0.95rem", color: "#5c3a1e", letterSpacing: "0.15em" }}>
            ✦ КОСОЙ ПЕРЕУЛОК • ОСНОВАНО В 1474 ГОДУ • OLDBOOK.CSS EDITION ✦
          </div>
          <h1 style={{ margin: "4px 0" }}>
            🦉 Good Diagon Alley 🪄
          </h1>
          <p style={{ margin: "4px auto 0", maxWidth: "760px", fontStyle: "italic", color: "#4a1c03" }}>
            Волшебная лавка артефактов, палочек Олливандера, мантий Хогвартса и древних реликвий с доставкой Совиной Почтой через Telegram-бота{" "}
            <a
              href="https://t.me/wizard_HP_store_bot"
              target="_blank"
              rel="noreferrer"
              style={{ color: "#8b0000", fontWeight: "bold" }}
            >
              @wizard_HP_store_bot
            </a>
          </p>
        </div>

        {/* Navigation Tabs */}
        <nav
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "8px",
            paddingTop: "10px",
            borderTop: "2px solid #8b0000",
          }}
        >
          <button
            type="button"
            className={`ink-btn-secondary ${
              activeTab === "store" ? "ink-btn-active" : ""
            }`}
            onClick={() => switchTab("store")}
          >
            🏪 Лавка Артефактов ({products.length})
          </button>
          <button
            type="button"
            className={`ink-btn-secondary ${
              activeTab === "lore" ? "ink-btn-active" : ""
            }`}
            onClick={() => switchTab("lore")}
          >
            📖 История Хогвартса (FAQ)
          </button>
          <button
            type="button"
            className={`ink-btn-secondary ${
              activeTab === "sorting" ? "ink-btn-active" : ""
            }`}
            onClick={() => switchTab("sorting")}
          >
            🎩 Распределяющая Шляпа
          </button>
          <button
            type="button"
            className={`ink-btn-secondary ${
              activeTab === "trivia" ? "ink-btn-active" : ""
            }`}
            onClick={() => switchTab("trivia")}
          >
            ⚡ Викторина ({triviaPoolTotal} вопр.)
          </button>
          <button
            type="button"
            className={`ink-btn-secondary ${
              activeTab === "leaderboard" ? "ink-btn-active" : ""
            }`}
            onClick={() => switchTab("leaderboard")}
          >
            🏆 Таблица Рекордов
          </button>
          <button
            type="button"
            className={`ink-btn-secondary ${
              activeTab === "profile" ? "ink-btn-active" : ""
            }`}
            onClick={() => switchTab("profile")}
          >
            🧙‍♂️ {user ? `Кабинет (${user.login})` : "Личный Кабинет"}
          </button>
          <button
            type="button"
            className={`ink-btn-secondary ${
              activeTab === "admin" ? "ink-btn-active" : ""
            }`}
            onClick={() => switchTab("admin")}
          >
            🗝️ Админ-Панель (/admin)
          </button>
        </nav>
      </header>

      {/* ==================== TAB 1: STOREFRONT & 6 CATEGORIES ==================== */}
      {activeTab === "store" && (
        <main className="parchment-page-turn">
          <div className="spellbook-shell" style={{ marginBottom: "20px" }}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "10px",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "14px",
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                <button
                  type="button"
                  className={`ink-btn-secondary ${
                    selectedCategory === "all" ? "ink-btn-active" : ""
                  }`}
                  onClick={() => {
                    playMagicalTone("flip", soundEnabled);
                    setSelectedCategory("all");
                  }}
                >
                  ✨ Все 6 категорий ({products.length})
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.slug}
                    type="button"
                    className={`ink-btn-secondary ${
                      selectedCategory === cat.slug ||
                      selectedCategory === cat.name_ru
                        ? "ink-btn-active"
                        : ""
                    }`}
                    onClick={() => {
                      playMagicalTone("flip", soundEnabled);
                      setSelectedCategory(cat.slug);
                    }}
                  >
                    {cat.icon} {cat.name_ru}
                  </button>
                ))}
              </div>

              <div style={{ minWidth: "240px", flex: "1", maxWidth: "320px" }}>
                <input
                  type="text"
                  className="ink-input"
                  placeholder="🔍 Поиск палочки, мантии, артефакта..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <blockquote>
              <b>Магическая акция Косого Переулка:</b> Введите в сундуке (корзине) заклинание{" "}
              <code>LUMOS10</code> для скидки 10% или секретное заклинание{" "}
              <code>ALOHOMORA</code> для скидки 20%! Нажмите на любой артефакт, чтобы открыть древний свиток с его полной историей.
            </blockquote>
          </div>

          {loadingStore ? (
            <div className="spellbook-shell" style={{ textAlign: "center", padding: "40px" }}>
              <h3>🪄 Призываем артефакты заклинанием Акцио...</h3>
            </div>
          ) : (
            <div className="grid-products">
              {filteredProducts.map((product) => {
                const origUsd = Number(product.price_usd);
                const finalUsd = getFinalPriceUsd(product);
                const hasDiscount = finalUsd < origUsd;
                const isFav = favoriteIds.includes(Number(product.id));

                return (
                  <article
                    key={product.id}
                    className="spellbook-card wand-sparkle-hover"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      playMagicalTone("flip", soundEnabled);
                      setSelectedProductModal(product);
                    }}
                  >
                    <div>
                      <div
                        style={{
                          position: "relative",
                          border: "2px solid #8b0000",
                          marginBottom: "12px",
                          background: "#f6dfa4",
                          overflow: "hidden",
                          height: "200px",
                        }}
                      >
                        <img
                          src={product.image_url}
                          alt={product.title}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            display: "block",
                          }}
                        />
                        <span
                          className="badge-pill"
                          style={{ position: "absolute", top: "8px", left: "8px" }}
                        >
                          {product.category_name}
                        </span>
                        {hasDiscount && (
                          <span
                            className="badge-pill"
                            style={{
                              position: "absolute",
                              bottom: "8px",
                              right: "8px",
                              background: "#8b0000",
                              color: "#ffd700",
                            }}
                          >
                            🔥 Скидка{" "}
                            {product.discount_percent > 0
                              ? `-${product.discount_percent}%`
                              : `-$${product.fixed_discount_usd}`}
                          </span>
                        )}
                      </div>

                      <h3 style={{ fontSize: "1.28rem", margin: "0 0 6px" }}>
                        {product.title}
                      </h3>
                      <p
                        style={{
                          fontSize: "0.95rem",
                          margin: "0 0 12px",
                          color: "#3d220a",
                        }}
                      >
                        {product.short_description ||
                          product.lore_description.slice(0, 110) + "..."}
                      </p>
                    </div>

                    <div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          borderTop: "1px dashed #8b0000",
                          paddingTop: "10px",
                          marginBottom: "10px",
                        }}
                      >
                        <div>
                          {hasDiscount && (
                            <span
                              style={{
                                textDecoration: "line-through",
                                color: "#7a5230",
                                fontSize: "0.9rem",
                                marginRight: "8px",
                              }}
                            >
                              {formatMoney(origUsd, currency)}
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: "1.35rem",
                              fontWeight: "bold",
                              color: "#8b0000",
                            }}
                          >
                            {formatMoney(finalUsd, currency)}
                          </span>
                        </div>
                        <span style={{ fontSize: "0.82rem", color: "#5c3a1e" }}>
                          📜 История →
                        </span>
                      </div>

                      <div
                        style={{ display: "flex", gap: "8px" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="ink-btn"
                          style={{ flex: 1 }}
                          onClick={() => addToCart(product)}
                        >
                          🛒 В корзину
                        </button>
                        <button
                          type="button"
                          className="ink-btn-secondary"
                          title="В избранное"
                          onClick={() => toggleFavorite(product)}
                        >
                          {isFav ? "❤️" : "🤍"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </main>
      )}

      {/* ==================== TAB 2: LORE ENCYCLOPEDIA & FAQ ==================== */}
      {activeTab === "lore" && (
        <section className="spellbook-shell parchment-page-turn">
          <h2>📖 История Хогвартса и Волшебного Мира (Энциклопедия)</h2>
          <p>
            Иллюстрированный древний фолиант знаний о Четырёх Основателях Хогвартса, зарубежных школах Дурмстранг, Шармбатон и Ильверморни, Министерстве Магии и законах волшебных палочек.
          </p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              marginBottom: "18px",
            }}
          >
            {LORE_ENCYCLOPEDIA.map((chap, idx) => (
              <button
                key={chap.id}
                type="button"
                className={`ink-btn-secondary ${
                  activeLoreIdx === idx ? "ink-btn-active" : ""
                }`}
                onClick={() => {
                  playMagicalTone("flip", soundEnabled);
                  setActiveLoreIdx(idx);
                }}
              >
                {chap.icon} {chap.title}
              </button>
            ))}
          </div>

          {(() => {
            const chapter = LORE_ENCYCLOPEDIA[activeLoreIdx] || LORE_ENCYCLOPEDIA[0];
            return (
              <article key={chapter.id} className="spellbook-card parchment-page-turn">
                <h3>
                  {chapter.icon} {chapter.title}
                </h3>
                <h4>{chapter.subtitle}</h4>
                <p className="has-dropcap" style={{ marginTop: "14px" }}>
                  {chapter.dropcapParagraph}
                </p>
                {chapter.bodyParagraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
                <blockquote>{chapter.quote}</blockquote>

                <h4 style={{ marginTop: "16px" }}>Архивные сведения Министерства Магии:</h4>
                <table>
                  <thead>
                    <tr>
                      <th>Реликвия / Понятие</th>
                      <th>Историческое описание канона</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chapter.facts.map((f, i) => (
                      <tr key={i}>
                        <td>
                          <b>{f.label}</b>
                        </td>
                        <td>{f.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </article>
            );
          })()}
        </section>
      )}

      {/* ==================== TAB 3: EXTENDED SORTING HAT CEREMONY ==================== */}
      {activeTab === "sorting" && (
        <section className="spellbook-shell parchment-page-turn">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <h2>🎩 Церемония Распределяющей Шляпы (10 вопросов)</h2>
            <button
              type="button"
              className="ink-btn-secondary"
              onClick={restartSortingHat}
            >
              🔄 Начать заново (Restart Game)
            </button>
          </div>

          <blockquote>
            <b>Особый закон распределения магических школ:</b> По ответам на 10 вопросов вы можете поступить на один из 4 факультетов Хогвартса (Гриффиндор, Слизерин, Когтевран, Пуффендуй) ИЛИ в зарубежные школы магии: <b>Дурмстранг</b> (доступен только если в Вопросе №1 выбран <b>мужской пол</b>) или <b>Шармбатон</b> (доступен только если в Вопросе №1 выбран <b>женский пол</b>).
          </blockquote>

          {!sortedResult ? (
            <div className="spellbook-card parchment-page-turn" key={sortingStep}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "8px",
                }}
              >
                <span className="badge-pill">
                  Вопрос {sortingStep + 1} из {SORTING_HAT_QUESTIONS.length}
                </span>
                {sortingStep > 0 && (
                  <span className="badge-pill">
                    Пол: {sortingGender === "male" ? "🧙‍♂️ Мужской" : "🧙‍♀️ Женский"}
                  </span>
                )}
              </div>

              <h3>{SORTING_HAT_QUESTIONS[sortingStep].question}</h3>
              <p style={{ fontStyle: "italic", color: "#5c3a1e" }}>
                {SORTING_HAT_QUESTIONS[sortingStep].subtitle}
              </p>

              <div
                style={{
                  display: "grid",
                  gap: "12px",
                  marginTop: "16px",
                }}
              >
                {SORTING_HAT_QUESTIONS[sortingStep].options.map((opt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="ink-btn-secondary"
                    style={{
                      justifyContent: "flex-start",
                      textAlign: "left",
                      padding: "14px 18px",
                      fontSize: "1.08rem",
                    }}
                    onClick={() => handleSortingAnswer(idx)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div
              className="spellbook-card parchment-page-turn"
              style={{ textAlign: "center", padding: "28px" }}
            >
              <div style={{ fontSize: "4.2rem" }}>{sortedResult.badgeEmoji}</div>
              <h2>{sortedResult.name_ru}</h2>
              <h4>Девиз: «{sortedResult.motto}»</h4>
              <p
                style={{
                  maxWidth: "680px",
                  margin: "14px auto",
                  fontSize: "1.15rem",
                }}
              >
                {sortedResult.description}
              </p>

              <table style={{ maxWidth: "620px", margin: "18px auto" }}>
                <tbody>
                  <tr>
                    <th>Основатель</th>
                    <td>{sortedResult.founder}</td>
                  </tr>
                  <tr>
                    <th>Цвета и Герб</th>
                    <td>
                      {sortedResult.colors} • {sortedResult.animal}
                    </td>
                  </tr>
                  <tr>
                    <th>Стихия</th>
                    <td>{sortedResult.element}</td>
                  </tr>
                </tbody>
              </table>

              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: "12px",
                  marginTop: "18px",
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  className="ink-btn"
                  onClick={restartSortingHat}
                >
                  🔄 Начать заново (Без перезагрузки страницы)
                </button>
                <button
                  type="button"
                  className="ink-btn-secondary"
                  onClick={() => switchTab("profile")}
                >
                  🧙‍♂️ Посмотреть значок в Личном Кабинете
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ==================== TAB 4: WIZARDING WORLD TRIVIA (250 QUESTIONS) ==================== */}
      {activeTab === "trivia" && (
        <section className="spellbook-shell parchment-page-turn">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <h2>⚡ Викторина «Знание мира Гарри Поттера»</h2>
            <button
              type="button"
              className="ink-btn-secondary"
              onClick={() => {
                playMagicalTone("flip", soundEnabled);
                loadNewTriviaSession();
              }}
            >
              🔄 Начать заново (Restart Game)
            </button>
          </div>

          <blockquote>
            В банке базы данных Neon хранится <b>{triviaPoolTotal} уникальных вопросов</b> на русском языке (заклинания, зелья вроде Безоара, спасающего от яда, артефакты, история и существа). В каждой партии случайно выбирается <b>10 вопросов</b> без повторов.
          </blockquote>

          {triviaLoading || triviaQuestions.length === 0 ? (
            <div className="spellbook-card" style={{ textAlign: "center", padding: "32px" }}>
              <h3>📜 Извлекаем 10 случайных свитков из {triviaPoolTotal} вопросов...</h3>
            </div>
          ) : !triviaFinished ? (
            <div className="spellbook-card parchment-page-turn" key={triviaIndex}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "8px",
                  marginBottom: "12px",
                }}
              >
                <span className="badge-pill">
                  Вопрос {triviaIndex + 1} из {triviaQuestions.length} • Тема:{" "}
                  {triviaQuestions[triviaIndex].category}
                </span>
                <span className="badge-pill">
                  Очки текущей игры: {triviaScore} pts
                </span>
              </div>

              <h3>{triviaQuestions[triviaIndex].question_ru}</h3>

              <div style={{ display: "grid", gap: "10px", marginTop: "16px" }}>
                {(triviaQuestions[triviaIndex].options || []).map(
                  (opt: string, idx: number) => {
                    const isPicked = triviaSelectedOption === idx;
                    const isRight =
                      idx === Number(triviaQuestions[triviaIndex].correct_index);
                    let bg = "#facf7f";
                    let color = "#8b0000";

                    if (triviaSelectedOption !== null) {
                      if (isRight) {
                        bg = "#1a472a";
                        color = "#fff3c9";
                      } else if (isPicked && !isRight) {
                        bg = "#8b0000";
                        color = "#fff3c9";
                      }
                    }

                    return (
                      <button
                        key={idx}
                        type="button"
                        className="ink-btn-secondary"
                        style={{
                          justifyContent: "flex-start",
                          textAlign: "left",
                          padding: "13px 16px",
                          background: bg,
                          color,
                        }}
                        onClick={() => handleTriviaOptionClick(idx)}
                      >
                        <b>{["A", "B", "C", "D"][idx]}.</b> {opt}
                      </button>
                    );
                  }
                )}
              </div>

              {triviaSelectedOption !== null && (
                <div
                  style={{
                    marginTop: "16px",
                    padding: "14px",
                    border: "2px solid #8b0000",
                    background: "#fff5d0",
                  }}
                >
                  <p style={{ margin: "0 0 10px" }}>
                    <b>
                      {triviaSelectedOption ===
                      Number(triviaQuestions[triviaIndex].correct_index)
                        ? "✅ Блестяще! +Очки Гриффиндору!"
                        : "❌ Осечка волшебной палочки!"}
                    </b>{" "}
                    {triviaQuestions[triviaIndex].explanation_ru}
                  </p>
                  <button
                    type="button"
                    className="ink-btn"
                    onClick={handleTriviaNext}
                  >
                    {triviaIndex + 1 < triviaQuestions.length
                      ? "Следующий вопрос →"
                      : "🏆 Завершить партию и узнать Ранг"}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div
              className="spellbook-card parchment-page-turn"
              style={{ textAlign: "center", padding: "28px" }}
            >
              <h2>🏆 Итоги Экзамена С.О.В. / Ж.А.Б.А.</h2>
              <h3>
                Правильных ответов: {triviaCorrectCount} из{" "}
                {triviaQuestions.length} • Набрано за раунд: +{triviaScore} очков
              </h3>
              <p style={{ fontSize: "1.2rem" }}>
                Общий счёт в профиле:{" "}
                <b>{triviaResultSummary?.totalScore ?? triviaScore} очков</b>
              </p>
              <div
                style={{
                  display: "inline-block",
                  padding: "12px 24px",
                  border: "3px double #8b0000",
                  background: "#facf7f",
                  marginBottom: "18px",
                }}
              >
                <b>Ваш текущий Ранг Волшебника:</b>{" "}
                <span style={{ color: "#8b0000", fontSize: "1.25rem" }}>
                  {triviaResultSummary?.wizardRank ??
                    calculateWizardRank(triviaScore)}
                </span>
              </div>

              <table style={{ maxWidth: "600px", margin: "0 auto 18px" }}>
                <thead>
                  <tr>
                    <th>Очки</th>
                    <th>Магический Ранг в Профиле</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>0–50 pts</td>
                    <td>Магл (Muggle)</td>
                  </tr>
                  <tr>
                    <td>51–150 pts</td>
                    <td>Первокурсник (First-Year)</td>
                  </tr>
                  <tr>
                    <td>151–300 pts</td>
                    <td>Староста (Prefect)</td>
                  </tr>
                  <tr>
                    <td>301–500 pts</td>
                    <td>Мракоборец (Auror)</td>
                  </tr>
                  <tr>
                    <td>500+ pts</td>
                    <td>Орден Мерлина I степени (Order of Merlin, First Class)</td>
                  </tr>
                </tbody>
              </table>

              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  className="ink-btn"
                  onClick={loadNewTriviaSession}
                >
                  🔄 Начать заново (Новые 10 случайных вопросов)
                </button>
                <button
                  type="button"
                  className="ink-btn-secondary"
                  onClick={() => switchTab("leaderboard")}
                >
                  🏆 Открыть Таблицу Рекордов
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ==================== TAB 5: GLOBAL LEADERBOARD ==================== */}
      {activeTab === "leaderboard" && (
        <section className="spellbook-shell parchment-page-turn">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <h2>🏆 Глобальная Таблица Рекордов (Neon Realtime)</h2>
            <button
              type="button"
              className="ink-btn-secondary"
              onClick={fetchLeaderboardData}
            >
              🔄 Обновить свиток
            </button>
          </div>
          <p>
            Лучшие знатоки канона Гарри Поттера, отсортированные по очкам викторины с указанием логина, Магического Ранга и герба распределённого факультета или школы.
          </p>

          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Место</th>
                  <th>Логин Волшебника</th>
                  <th>Факультет / Школа</th>
                  <th>Магический Ранг</th>
                  <th>Очки Викторины</th>
                  <th>Партий</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row, idx) => {
                  const houseInfo =
                    HOUSE_DETAILS[row.house || "Gryffindor"] ||
                    HOUSE_DETAILS.Gryffindor;
                  return (
                    <tr key={row.id || idx}>
                      <td>
                        <b>
                          {idx === 0
                            ? "🥇 1"
                            : idx === 1
                            ? "🥈 2"
                            : idx === 2
                            ? "🥉 3"
                            : `#${idx + 1}`}
                        </b>
                      </td>
                      <td>
                        <b>{row.login}</b>
                      </td>
                      <td>
                        <span className="badge-pill">
                          {houseInfo.badgeEmoji} {houseInfo.name_ru}
                        </span>
                      </td>
                      <td>{row.wizard_rank}</td>
                      <td>
                        <b>{row.trivia_score} pts</b>
                      </td>
                      <td>{row.games_played}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ==================== TAB 6: USER ACCOUNTS & PERSONAL CABINET (/profile) ==================== */}
      {activeTab === "profile" && (
        <section className="spellbook-shell parchment-page-turn">
          <h2>🧙‍♂️ Личный Кабинет Волшебника (/profile)</h2>

          {!user ? (
            <div className="spellbook-card" style={{ maxWidth: "560px", margin: "0 auto" }}>
              <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                <button
                  type="button"
                  className={`ink-btn-secondary ${
                    authMode === "login" ? "ink-btn-active" : ""
                  }`}
                  style={{ flex: 1 }}
                  onClick={() => setAuthMode("login")}
                >
                  🔑 Вход в Кабинет
                </button>
                <button
                  type="button"
                  className={`ink-btn-secondary ${
                    authMode === "register" ? "ink-btn-active" : ""
                  }`}
                  style={{ flex: 1 }}
                  onClick={() => setAuthMode("register")}
                >
                  📜 Регистрация Мага
                </button>
              </div>

              {authNotification && (
                <p style={{ color: "#8b0000", fontWeight: "bold" }}>
                  {authNotification}
                </p>
              )}

              <form onSubmit={handleAuthSubmit} style={{ display: "grid", gap: "12px" }}>
                <div>
                  <label>
                    <b>Логин (Username) *</b>
                  </label>
                  <input
                    type="text"
                    className="ink-input"
                    required
                    placeholder="Например: Harry_Potter или Ваше имя"
                    value={authForm.login}
                    onChange={(e) =>
                      setAuthForm({ ...authForm, login: e.target.value })
                    }
                  />
                </div>

                {authMode === "register" && (
                  <>
                    <div>
                      <label>
                        <b>Email (Совиная почта) *</b>
                      </label>
                      <input
                        type="email"
                        className="ink-input"
                        required
                        placeholder="wizard@hogwarts.ac.uk"
                        value={authForm.email}
                        onChange={(e) =>
                          setAuthForm({ ...authForm, email: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label>
                        <b>Номер телефона *</b>
                      </label>
                      <input
                        type="tel"
                        className="ink-input"
                        required
                        placeholder="+998 90 123 45 67"
                        value={authForm.phone}
                        onChange={(e) =>
                          setAuthForm({ ...authForm, phone: e.target.value })
                        }
                      />
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 90px",
                        gap: "8px",
                      }}
                    >
                      <div>
                        <label>Имя (необяз.)</label>
                        <input
                          type="text"
                          className="ink-input"
                          value={authForm.first_name}
                          onChange={(e) =>
                            setAuthForm({ ...authForm, first_name: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <label>Фамилия (необяз.)</label>
                        <input
                          type="text"
                          className="ink-input"
                          value={authForm.last_name}
                          onChange={(e) =>
                            setAuthForm({ ...authForm, last_name: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <label>Возраст</label>
                        <input
                          type="number"
                          className="ink-input"
                          value={authForm.age}
                          onChange={(e) =>
                            setAuthForm({ ...authForm, age: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label>
                    <b>Пароль</b>
                  </label>
                  <input
                    type="password"
                    className="ink-input"
                    placeholder="Секретный пароль (или hogwarts123 для демо-героев)"
                    value={authForm.password}
                    onChange={(e) =>
                      setAuthForm({ ...authForm, password: e.target.value })
                    }
                  />
                </div>

                <button type="submit" className="ink-btn">
                  {authMode === "register"
                    ? "✨ Зарегистрироваться в Магическом Реестре"
                    : "🔑 Войти в Личный Кабинет"}
                </button>
              </form>

              <blockquote style={{ marginTop: "16px", fontSize: "0.92rem" }}>
                <b>Быстрый вход для проверки:</b> Вы можете войти под логином{" "}
                <code>Harry_Potter</code>, <code>Hermione_Granger</code> или{" "}
                <code>Albus_Dumbledore</code> (пароль: <code>hogwarts123</code>) или создать новый аккаунт!
              </blockquote>
            </div>
          ) : (
            <div style={{ display: "grid", gap: "20px" }}>
              {/* 1. User Info & Game Progress */}
              <div className="spellbook-card">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "10px",
                  }}
                >
                  <h3>1. Профиль Волшебника и Игровой Прогресс</h3>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      type="button"
                      className="ink-btn-secondary"
                      onClick={() => refreshUserProfile(user.id)}
                    >
                      🔄 Синхронизировать с Neon DB
                    </button>
                    <button
                      type="button"
                      className="ink-btn-secondary"
                      onClick={() => {
                        setUser(null);
                        localStorage.removeItem("gda_user");
                      }}
                    >
                      Выйти
                    </button>
                  </div>
                </div>

                <table>
                  <tbody>
                    <tr>
                      <th>Логин / Имя</th>
                      <td>
                        <b>{user.login}</b>{" "}
                        {user.first_name || user.last_name
                          ? `(${user.first_name || ""} ${user.last_name || ""})`
                          : ""}
                      </td>
                      <th>Email и Телефон</th>
                      <td>
                        {user.email} • {user.phone}
                      </td>
                    </tr>
                    <tr>
                      <th>Факультет / Школа</th>
                      <td>
                        {user.house && HOUSE_DETAILS[user.house] ? (
                          <span className="badge-pill">
                            {HOUSE_DETAILS[user.house].badgeEmoji}{" "}
                            {HOUSE_DETAILS[user.house].name_ru}
                          </span>
                        ) : (
                          <span>
                            Не распределён —{" "}
                            <button
                              type="button"
                              className="ink-btn-secondary"
                              style={{ padding: "2px 8px", fontSize: "0.85rem" }}
                              onClick={() => switchTab("sorting")}
                            >
                              Надеть Шляпу
                            </button>
                          </span>
                        )}
                      </td>
                      <th>Магический Ранг</th>
                      <td>
                        <b style={{ color: "#8b0000" }}>{user.wizard_rank}</b> (
                        {user.trivia_score} очков • Игр: {user.games_played})
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 2. Delivery Address synced from Telegram Bot */}
              <div className="spellbook-card">
                <h3>2. Адрес Доставки Совиной Почты (Синхронизация с Telegram-ботом)</h3>
                <p>
                  Текущий адрес доставки в базе Neon:{" "}
                  <b>
                    {user.delivery_address ||
                      "Ожидает отправки локации через @wizard_HP_store_bot"}
                  </b>
                </p>
                <a
                  href="https://t.me/wizard_HP_store_bot"
                  target="_blank"
                  rel="noreferrer"
                  className="ink-btn-secondary"
                >
                  🦉 Открыть @wizard_HP_store_bot в Telegram
                </a>
              </div>

              {/* 3. Order History */}
              <div className="spellbook-card">
                <h3>3. История Оплаченных Заказов ({userOrders.length})</h3>
                {userOrders.length === 0 ? (
                  <p>У вас пока нет оплаченных заказов.</p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Номер Заказа</th>
                          <th>Дата оплаты</th>
                          <th>Метод Оплаты</th>
                          <th>Сумма</th>
                          <th>Адрес доставки</th>
                          <th>Статус заказа (Live)</th>
                          <th>Telegram Бот</th>
                        </tr>
                      </thead>
                      <tbody>
                        {userOrders.map((ord) => (
                          <tr key={ord.id}>
                            <td>
                              <code>{ord.id}</code>
                            </td>
                            <td>
                              {new Date(ord.paid_at).toLocaleString("ru-RU")}
                            </td>
                            <td>
                              <span className="badge-pill">
                                {String(ord.payment_provider).toUpperCase()}
                              </span>
                            </td>
                            <td>
                              <b>${Number(ord.total_usd).toFixed(2)}</b> (
                              {Number(ord.total_uzs).toLocaleString("ru-RU")} сум)
                            </td>
                            <td>
                              {ord.delivery_address || "Не указан (перейдите в бот)"}
                            </td>
                            <td>
                              <b>{ord.status}</b>
                            </td>
                            <td>
                              <a
                                href={`https://t.me/wizard_HP_store_bot?start=order_${ord.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="ink-btn-secondary"
                                style={{ padding: "4px 10px", fontSize: "0.85rem" }}
                              >
                                🦉 Указать адрес
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* 4. Favorites */}
              <div className="spellbook-card">
                <h3>4. Избранные Артефакты и Палочки ({favoriteIds.length})</h3>
                {favoriteIds.length === 0 ? (
                  <p>Нажмите на сердечко 🤍 на любом товаре в Лавке, чтобы сохранить его сюда.</p>
                ) : (
                  <div className="grid-products">
                    {products
                      .filter((p) => favoriteIds.includes(Number(p.id)))
                      .map((p) => (
                        <div key={p.id} className="spellbook-card">
                          <h4>{p.title}</h4>
                          <p>
                            <b>{formatMoney(getFinalPriceUsd(p), currency)}</b>
                          </p>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button
                              type="button"
                              className="ink-btn"
                              onClick={() => addToCart(p)}
                            >
                              В корзину
                            </button>
                            <button
                              type="button"
                              className="ink-btn-secondary"
                              onClick={() => toggleFavorite(p)}
                            >
                              Удалить
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ==================== TAB 7: ADMIN PANEL (/admin) ==================== */}
      {activeTab === "admin" && (
        <section className="spellbook-shell parchment-page-turn">
          <h2>🗝️ Панель Хранителя Лавки (/admin)</h2>
          <p>
            Управление товарами (с загрузкой изображений в <b>Neon Object Storage</b>), скидками и оплаченными заказами с отправкой уведомлений покупателям через Telegram-бота.
          </p>

          {/* Manage Orders Section */}
          <div className="spellbook-card" style={{ marginBottom: "24px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "10px",
                marginBottom: "12px",
              }}
            >
              <h3>📦 Управление Оплаченными Заказами ({adminOrders.length})</h3>
              <button
                type="button"
                className="ink-btn-secondary"
                onClick={fetchAdminOrders}
              >
                🔄 Обновить список заказов
              </button>
            </div>

            {adminOrders.length === 0 ? (
              <p>Оплаченных заказов пока нет. Оформите тестовый заказ через Stripe или Payme/Click!</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Order ID</th>
                      <th>Покупатель</th>
                      <th>Шлюз Оплаты</th>
                      <th>Сумма</th>
                      <th>Адрес из Telegram</th>
                      <th>Текущий Статус</th>
                      <th>Действие Хранителя</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminOrders.map((ord) => (
                      <tr key={ord.id}>
                        <td>
                          <code>{ord.id}</code>
                        </td>
                        <td>
                          <b>{ord.customer_login}</b>
                          <br />
                          <small>{ord.customer_phone}</small>
                        </td>
                        <td>
                          <span className="badge-pill">
                            {String(ord.payment_provider).toUpperCase()}
                          </span>
                        </td>
                        <td>
                          <b>${Number(ord.total_usd).toFixed(2)}</b>
                          <br />
                          <small>
                            {Number(ord.total_uzs).toLocaleString("ru-RU")} сум
                          </small>
                        </td>
                        <td>
                          {ord.delivery_address || (
                            <span style={{ color: "#7a5230" }}>
                              Ожидает от @wizard_HP_store_bot
                            </span>
                          )}
                        </td>
                        <td>
                          <b>{ord.status}</b>
                        </td>
                        <td>
                          {ord.status.includes("Отправлен") ? (
                            <span className="badge-pill">
                              ✅ Отправлен совой
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="ink-btn"
                              style={{ padding: "6px 12px", fontSize: "0.9rem" }}
                              onClick={() => handleMarkOrderShipped(ord.id)}
                            >
                              🦉 Отправить заказ (Mark as Shipped)
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Add / Edit Product Form */}
          <div className="spellbook-card" style={{ marginBottom: "24px" }}>
            <h3>
              {editingProduct
                ? `✏️ Редактирование артефакта #${editingProduct.id}: ${editingProduct.title}`
                : "➕ Добавить новый магический товар в каталог"}
            </h3>

            {adminNotice && (
              <blockquote style={{ margin: "10px 0" }}>{adminNotice}</blockquote>
            )}

            <form
              onSubmit={handleAdminSaveProduct}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                gap: "12px",
              }}
            >
              <div>
                <label>
                  <b>Название товара *</b>
                </label>
                <input
                  type="text"
                  className="ink-input"
                  required
                  value={adminForm.title}
                  onChange={(e) =>
                    setAdminForm({ ...adminForm, title: e.target.value })
                  }
                  placeholder="Например: Меч Годрика Гриффиндора"
                />
              </div>

              <div>
                <label>
                  <b>Категория (из 6 разделов) *</b>
                </label>
                <select
                  className="ink-select"
                  value={adminForm.category_slug}
                  onChange={(e) =>
                    setAdminForm({ ...adminForm, category_slug: e.target.value })
                  }
                >
                  <option value="uniforms">1. Форма (Uniforms)</option>
                  <option value="wands">2. Палочки (Wands)</option>
                  <option value="sweets">3. Сладости (Sweets)</option>
                  <option value="quidditch">4. Спорт инвентарь (Quidditch)</option>
                  <option value="artifacts">5. Артефакты (Artifacts)</option>
                  <option value="figurines">6. Фигурки (Figurines)</option>
                </select>
              </div>

              <div>
                <label>
                  <b>Цена в USD ($) *</b>
                </label>
                <input
                  type="number"
                  step="0.01"
                  className="ink-input"
                  required
                  value={adminForm.price_usd}
                  onChange={(e) =>
                    setAdminForm({ ...adminForm, price_usd: e.target.value })
                  }
                />
              </div>

              <div>
                <label>
                  <b>Скидка в процентах (%)</b>
                </label>
                <input
                  type="number"
                  min="0"
                  max="90"
                  className="ink-input"
                  value={adminForm.discount_percent}
                  onChange={(e) =>
                    setAdminForm({
                      ...adminForm,
                      discount_percent: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label>
                  <b>Фиксированная скидка ($)</b>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="ink-input"
                  value={adminForm.fixed_discount_usd}
                  onChange={(e) =>
                    setAdminForm({
                      ...adminForm,
                      fixed_discount_usd: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label>
                  <b>Загрузить фото в Neon Object Storage</b>
                </label>
                <input
                  type="file"
                  accept="image/*"
                  className="ink-input"
                  onChange={handleAdminImageUpload}
                />
                {uploadingImage && <small>⏳ Загрузка в бакет Neon...</small>}
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label>
                  <b>URL изображения (заполняется автоматически при загрузке в Neon Storage или укажите ссылку) *</b>
                </label>
                <input
                  type="text"
                  className="ink-input"
                  required
                  placeholder="/api/storage/products/... или https://..."
                  value={adminForm.image_url}
                  onChange={(e) =>
                    setAdminForm({ ...adminForm, image_url: e.target.value })
                  }
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label>
                  <b>Краткое описание для карточки</b>
                </label>
                <input
                  type="text"
                  className="ink-input"
                  value={adminForm.short_description}
                  onChange={(e) =>
                    setAdminForm({
                      ...adminForm,
                      short_description: e.target.value,
                    })
                  }
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label>
                  <b>Полная магическая история и лор (Lore Description) *</b>
                </label>
                <textarea
                  rows={3}
                  className="ink-textarea"
                  required
                  value={adminForm.lore_description}
                  onChange={(e) =>
                    setAdminForm({
                      ...adminForm,
                      lore_description: e.target.value,
                    })
                  }
                />
              </div>

              <div style={{ gridColumn: "1 / -1", display: "flex", gap: "10px" }}>
                <button type="submit" className="ink-btn">
                  {editingProduct ? "💾 Сохранить изменения" : "➕ Добавить товар в базу Neon"}
                </button>
                {editingProduct && (
                  <button
                    type="button"
                    className="ink-btn-secondary"
                    onClick={() => setEditingProduct(null)}
                  >
                    Отмена
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Existing Products Table */}
          <div className="spellbook-card">
            <h3>📜 Все товары в каталоге ({products.length})</h3>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Название</th>
                    <th>Категория</th>
                    <th>Цена ($)</th>
                    <th>Скидка</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id}>
                      <td>#{p.id}</td>
                      <td>
                        <b>{p.title}</b>
                      </td>
                      <td>{p.category_name}</td>
                      <td>${Number(p.price_usd).toFixed(2)}</td>
                      <td>
                        {p.discount_percent > 0
                          ? `-${p.discount_percent}%`
                          : Number(p.fixed_discount_usd) > 0
                          ? `-$${p.fixed_discount_usd}`
                          : "Нет"}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            type="button"
                            className="ink-btn-secondary"
                            style={{ padding: "4px 10px", fontSize: "0.85rem" }}
                            onClick={() => {
                              setEditingProduct(p);
                              setAdminForm({
                                title: p.title,
                                category_slug: p.category_slug,
                                price_usd: String(p.price_usd),
                                discount_percent: String(p.discount_percent || 0),
                                fixed_discount_usd: String(
                                  p.fixed_discount_usd || 0
                                ),
                                short_description: p.short_description || "",
                                lore_description: p.lore_description,
                                image_url: p.image_url,
                                storage_key: p.storage_key || "",
                                origin_wizard: p.origin_wizard || "",
                                rarity: p.rarity || "",
                                stock: String(p.stock || 20),
                              });
                              window.scrollTo({ top: 250, behavior: "smooth" });
                            }}
                          >
                            ✏️ Изменить
                          </button>
                          <button
                            type="button"
                            className="ink-btn-secondary"
                            style={{ padding: "4px 10px", fontSize: "0.85rem" }}
                            onClick={() => handleAdminDeleteProduct(p.id, p.title)}
                          >
                            🗑️ Удалить
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ==================== MODAL 1: DETAILED PRODUCT LORE MODAL ==================== */}
      {selectedProductModal && (
        <div
          className="modal-backdrop"
          onClick={() => setSelectedProductModal(null)}
        >
          <div
            className="modal-scroll parchment-page-turn"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "12px",
              }}
            >
              <div>
                <span className="badge-pill">
                  {selectedProductModal.category_name} •{" "}
                  {selectedProductModal.rarity || "Реликвия"}
                </span>
                <h2 style={{ marginTop: "8px" }}>{selectedProductModal.title}</h2>
              </div>
              <button
                type="button"
                className="ink-btn-secondary"
                onClick={() => setSelectedProductModal(null)}
              >
                ✕ Закрыть
              </button>
            </div>

            <div
              style={{
                border: "3px solid #8b0000",
                margin: "14px 0",
                maxHeight: "260px",
                overflow: "hidden",
                background: "#f6dfa4",
              }}
            >
              <img
                src={selectedProductModal.image_url}
                alt={selectedProductModal.title}
                style={{
                  width: "100%",
                  height: "250px",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            </div>

            <h4>Магическая история и происхождение артефакта:</h4>
            <p className="has-dropcap" style={{ fontSize: "1.1rem" }}>
              {selectedProductModal.lore_description}
            </p>

            <blockquote>
              <b>Происхождение:</b>{" "}
              {selectedProductModal.origin_wizard || "Мастерские Косого Переулка"}
            </blockquote>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "12px",
                marginTop: "18px",
                paddingTop: "14px",
                borderTop: "2px solid #8b0000",
              }}
            >
              <div>
                {getFinalPriceUsd(selectedProductModal) <
                  Number(selectedProductModal.price_usd) && (
                  <span
                    style={{
                      textDecoration: "line-through",
                      color: "#7a5230",
                      marginRight: "10px",
                    }}
                  >
                    {formatMoney(
                      Number(selectedProductModal.price_usd),
                      currency
                    )}
                  </span>
                )}
                <span
                  style={{
                    fontSize: "1.65rem",
                    fontWeight: "bold",
                    color: "#8b0000",
                  }}
                >
                  {formatMoney(getFinalPriceUsd(selectedProductModal), currency)}
                </span>
              </div>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="ink-btn"
                  onClick={() => {
                    addToCart(selectedProductModal);
                    setSelectedProductModal(null);
                  }}
                >
                  🛒 В корзину (Add to Cart)
                </button>
                <button
                  type="button"
                  className="ink-btn-secondary"
                  onClick={() => toggleFavorite(selectedProductModal)}
                >
                  {favoriteIds.includes(Number(selectedProductModal.id))
                    ? "❤️ В избранном"
                    : "🤍 В избранное (Add to Favorites)"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL 2: CART & DUAL PAYMENT CHECKOUT ==================== */}
      {cartOpen && (
        <div className="modal-backdrop" onClick={() => setCartOpen(false)}>
          <div
            className="modal-scroll parchment-page-turn"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h2>🛒 Ваш Магический Сундук (Корзина)</h2>
              <button
                type="button"
                className="ink-btn-secondary"
                onClick={() => setCartOpen(false)}
              >
                ✕ Закрыть
              </button>
            </div>

            {cart.length === 0 ? (
              <p style={{ textAlign: "center", padding: "24px 0" }}>
                Ваш сундук пуст! Выберите палочку, мантию или сладости в Лавке.
              </p>
            ) : (
              <>
                <table style={{ marginBottom: "16px" }}>
                  <thead>
                    <tr>
                      <th>Артефакт</th>
                      <th>Цена</th>
                      <th>Кол-во</th>
                      <th>Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item) => (
                      <tr key={item.product.id}>
                        <td>
                          <b>{item.product.title}</b>
                        </td>
                        <td>{formatMoney(item.final_price_usd, currency)}</td>
                        <td>
                          <div
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            <button
                              type="button"
                              className="ink-btn-secondary"
                              style={{ padding: "2px 8px" }}
                              onClick={() => updateCartQty(item.product.id, -1)}
                            >
                              -
                            </button>
                            <b>{item.quantity}</b>
                            <button
                              type="button"
                              className="ink-btn-secondary"
                              style={{ padding: "2px 8px" }}
                              onClick={() => updateCartQty(item.product.id, 1)}
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td>
                          <b>
                            {formatMoney(
                              item.final_price_usd * item.quantity,
                              currency
                            )}
                          </b>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Promo Code Input (Bonus Feature) */}
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    marginBottom: "12px",
                    flexWrap: "wrap",
                  }}
                >
                  <input
                    type="text"
                    className="ink-input"
                    style={{ flex: 1 }}
                    placeholder="Промокод-заклинание (LUMOS10 или ALOHOMORA)"
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.target.value)}
                  />
                  <button
                    type="button"
                    className="ink-btn-secondary"
                    onClick={handleApplyPromo}
                  >
                    🪄 Применить заклинание
                  </button>
                </div>
                {promoMessage && (
                  <p style={{ margin: "4px 0 12px", fontWeight: "bold" }}>
                    {promoMessage}
                  </p>
                )}

                <div
                  className="spellbook-card"
                  style={{ marginBottom: "16px", background: "#facf7f" }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>Подытог:</span>
                    <b>{formatMoney(cartSubtotalUsd, currency)}</b>
                  </div>
                  {cartDiscountUsd > 0 && (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        color: "#8b0000",
                      }}
                    >
                      <span>Скидка ({appliedPromo?.code}):</span>
                      <b>-{formatMoney(cartDiscountUsd, currency)}</b>
                    </div>
                  )}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "1.3rem",
                      marginTop: "6px",
                      borderTop: "2px solid #8b0000",
                      paddingTop: "6px",
                    }}
                  >
                    <b>ИТОГО К ОПЛАТЕ:</b>
                    <b>
                      ${cartTotalUsd.toFixed(2)} /{" "}
                      {Math.round(cartTotalUsd * USD_TO_UZS_RATE).toLocaleString(
                        "ru-RU"
                      )}{" "}
                      сум
                    </b>
                  </div>
                </div>

                <blockquote>
                  <b>Важное правило безопасности Гринготтса:</b> Заказ сохраняется в итоговую таблицу <code>orders</code> базы данных <b>ТОЛЬКО ПОСЛЕ успешного подтверждения оплаты</b>! До оплаты товары находятся исключительно в корзине / временном состоянии <code>pending_checkouts</code>.
                </blockquote>

                <h4>Выберите платёжный шлюз для оплаты заказа:</h4>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
                    gap: "10px",
                  }}
                >
                  <button
                    type="button"
                    className="ink-btn"
                    disabled={paymentProcessing}
                    onClick={() => initiatePaymentGateway("stripe")}
                  >
                    💳 1. Stripe (Test Mode • $ USD)
                  </button>
                  <button
                    type="button"
                    className="ink-btn"
                    style={{
                      background: "linear-gradient(180deg, #0e5a6f 0%, #073b4c 100%)",
                    }}
                    disabled={paymentProcessing}
                    onClick={() => initiatePaymentGateway("payme")}
                  >
                    🇺🇿 2. Payme Sandbox (UZS сум)
                  </button>
                  <button
                    type="button"
                    className="ink-btn"
                    style={{
                      background: "linear-gradient(180deg, #1b4332 0%, #081c15 100%)",
                    }}
                    disabled={paymentProcessing}
                    onClick={() => initiatePaymentGateway("click")}
                  >
                    🇺🇿 3. Click Sandbox (UZS сум)
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ==================== MODAL 3: STRIPE TEST MODE GATEWAY ==================== */}
      {checkoutGateway === "stripe" && pendingCheckoutData && (
        <div className="modal-backdrop">
          <div className="modal-scroll parchment-page-turn">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h2>💳 Stripe Checkout (Test Mode • International)</h2>
              <button
                type="button"
                className="ink-btn-secondary"
                onClick={() => setCheckoutGateway(null)}
              >
                ✕ Отмена
              </button>
            </div>

            <blockquote>
              <b>Официальная оплата Stripe (Test Mode):</b> Вы можете перейти на официальную защищённую страницу{" "}
              <code>checkout.stripe.com</code> или оплатить тестовой картой{" "}
              <code>4242 4242 4242 4242</code> прямо в окне ниже. Обе опции создают реальную транзакцию в вашем аккаунте Stripe (<code>acct_1UacpqAmUn3wtQDD</code>) и сохраняют заказ в таблицу <code>orders</code>.
            </blockquote>

            {paymentError && (
              <p style={{ color: "#8b0000", fontWeight: "bold" }}>
                ⚠️ {paymentError}
              </p>
            )}

            <div
              className="spellbook-card"
              style={{
                marginBottom: "16px",
                background: "linear-gradient(180deg, #fff5d6 0%, #f5deb3 100%)",
                border: "2px solid #635bff",
              }}
            >
              <h4 style={{ marginTop: 0, color: "#3b368c" }}>
                🌐 Способ 1 (Рекомендуется): Официальная страница checkout.stripe.com
              </h4>
              <p style={{ margin: "6px 0 12px", fontSize: "0.95rem" }}>
                Создаёт настоящую сессию <code>Stripe Checkout Session</code> и перенаправляет вас на{" "}
                <b>https://checkout.stripe.com</b> для ввода тестовой карты <code>4242 4242 4242 4242</code>. После оплаты вы автоматически вернётесь обратно к выбору точки доставки на Карте Мародёров!
              </p>
              <button
                type="button"
                className="ink-btn"
                style={{
                  width: "100%",
                  background: "linear-gradient(180deg, #635bff 0%, #4338ca 100%)",
                  borderColor: "#ffd700",
                  fontSize: "1.05rem",
                }}
                disabled={paymentProcessing}
                onClick={redirectToStripeHostedCheckout}
              >
                {paymentProcessing
                  ? "⏳ Перенаправление на checkout.stripe.com..."
                  : `🔒 Перейти к оплате $${Number(
                      pendingCheckoutData.total_usd
                    ).toFixed(2)} на checkout.stripe.com ↗`}
              </button>
            </div>

            <h4 style={{ marginBottom: "8px" }}>
              ⚡ Способ 2: Быстрая оплата прямо внутри сайта (Direct Stripe API)
            </h4>

            <form
              onSubmit={confirmStripePayment}
              style={{ display: "grid", gap: "12px" }}
            >
              <div>
                <label>
                  <b>Номер карты Stripe (Test Card)</b>
                </label>
                <input
                  type="text"
                  className="ink-input"
                  value={stripeCard}
                  onChange={(e) => setStripeCard(e.target.value)}
                  required
                />
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "10px",
                }}
              >
                <div>
                  <label>Срок действия</label>
                  <input
                    type="text"
                    className="ink-input"
                    value={stripeExpiry}
                    onChange={(e) => setStripeExpiry(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label>CVC</label>
                  <input
                    type="text"
                    className="ink-input"
                    value={stripeCvc}
                    onChange={(e) => setStripeCvc(e.target.value)}
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="ink-btn"
                disabled={paymentProcessing}
              >
                {paymentProcessing
                  ? "⏳ Обработка вебхука Stripe..."
                  : `✅ Оплатить $${Number(pendingCheckoutData.total_usd).toFixed(
                      2
                    )} через Stripe Test Mode`}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL 4: PAYME / CLICK SANDBOX GATEWAY ==================== */}
      {(checkoutGateway === "payme" || checkoutGateway === "click") &&
        pendingCheckoutData && (
          <div className="modal-backdrop">
            <div className="modal-scroll parchment-page-turn">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <h2>
                  🇺🇿 Тестовый шлюз{" "}
                  {checkoutGateway === "payme"
                    ? "Payme (JSON-RPC 2.0 Sandbox)"
                    : "Click (SHOP-API Prepare/Complete)"}
                </h2>
                <button
                  type="button"
                  className="ink-btn-secondary"
                  onClick={() => setCheckoutGateway(null)}
                >
                  ✕ Отмена
                </button>
              </div>

              <blockquote>
                <b>Инструкция песочницы Payme / Click:</b>
                <br />• Тестовая карта UZCard: <code>8600 0000 0000 0000</code>
                <br />• Тестовый SMS-код подтверждения: <code>666666</code>
                <br />• Сумма к оплате:{" "}
                <b>
                  {Number(pendingCheckoutData.total_uzs).toLocaleString("ru-RU")}{" "}
                  сум
                </b>{" "}
                (${Number(pendingCheckoutData.total_usd).toFixed(2)})
              </blockquote>

              {paymentError && (
                <p style={{ color: "#8b0000", fontWeight: "bold" }}>
                  ⚠️ {paymentError}
                </p>
              )}

              <form
                onSubmit={confirmUzSandboxPayment}
                style={{ display: "grid", gap: "14px" }}
              >
                <div>
                  <label>
                    <b>Номер карты UZCard / Humo (Тестовая карта)</b>
                  </label>
                  <input
                    type="text"
                    className="ink-input"
                    value={uzCardNumber}
                    onChange={(e) => setUzCardNumber(e.target.value)}
                    required
                  />
                </div>

                {uzStep === "sms" && (
                  <div>
                    <label>
                      <b>Код из SMS (введите 666666)</b>
                    </label>
                    <input
                      type="text"
                      className="ink-input"
                      value={uzSmsCode}
                      onChange={(e) => setUzSmsCode(e.target.value)}
                      required
                    />
                  </div>
                )}

                <button
                  type="submit"
                  className="ink-btn"
                  disabled={paymentProcessing}
                >
                  {paymentProcessing
                    ? "⏳ Выполнение транзакции..."
                    : uzStep === "card"
                    ? "📲 Получить SMS-код (Шаг 1)"
                    : `✅ Подтвердить SMS 666666 и оплатить ${Number(
                        pendingCheckoutData.total_uzs
                      ).toLocaleString("ru-RU")} сум`}
                </button>
              </form>
            </div>
          </div>
        )}

      {/* ==================== MODAL 5: ORDER RECEIPT SCREEN (FOR HOMEWORK SCREENSHOT!) ==================== */}
      {completedReceipt && (
        <div className="modal-backdrop">
          <div className="modal-scroll parchment-page-turn">
            <div style={{ textAlign: "center" }}>
              <span className="badge-pill" style={{ fontSize: "1rem" }}>
                ✅ ОПЛАТА ПОДТВЕРЖДЕНА • ЗАПИСАНО В БАЗУ NEON POSTGRES
              </span>
              <h2 style={{ marginTop: "10px" }}>
                🦉 Официальная Квитанция Банка «Гринготтс»
              </h2>
              <p style={{ margin: "4px 0 14px", fontStyle: "italic" }}>
                Готово для скриншота домашнего задания! Заказ сохранён в таблицу{" "}
                <code>orders</code>.
              </p>
            </div>

            <table style={{ marginBottom: "18px" }}>
              <tbody>
                <tr>
                  <th>Номер Заказа (Order ID)</th>
                  <td>
                    <code style={{ fontSize: "1.15rem", fontWeight: "bold" }}>
                      {completedReceipt.order.id}
                    </code>
                  </td>
                </tr>
                <tr>
                  <th>Платёжный провайдер</th>
                  <td>
                    <span className="badge-pill">
                      {completedReceipt.provider_label}
                    </span>
                  </td>
                </tr>
                <tr>
                  <th>Дата и время оплаты</th>
                  <td>
                    {new Date(completedReceipt.order.paid_at).toLocaleString(
                      "ru-RU"
                    )}
                  </td>
                </tr>
                <tr>
                  <th>Сумма заказа</th>
                  <td>
                    <b>${Number(completedReceipt.order.total_usd).toFixed(2)}</b>{" "}
                    (
                    {Number(completedReceipt.order.total_uzs).toLocaleString(
                      "ru-RU"
                    )}{" "}
                    сум)
                  </td>
                </tr>
                <tr>
                  <th>Текущий Статус</th>
                  <td>
                    <b style={{ color: "#8b0000" }}>
                      {completedReceipt.order.status}
                    </b>
                  </td>
                </tr>
              </tbody>
            </table>

            <div
              className="spellbook-card"
              style={{
                textAlign: "center",
                background: "#facf7f",
                marginBottom: "16px",
              }}
            >
              <h3>🦉 Шаг 2: Укажите локацию доставки в Telegram-боте!</h3>
              <p>
                Нажмите на кнопку ниже, чтобы перейти в нашего Telegram-бота{" "}
                <b>@wizard_HP_store_bot</b> и отправить ваш адрес или геолокацию:
              </p>
              <a
                href={completedReceipt.telegram_deep_link}
                target="_blank"
                rel="noreferrer"
                className="ink-btn"
                style={{ fontSize: "1.1rem", padding: "12px 22px" }}
              >
                🚀 Перейти в Telegram Бот: t.me/wizard_HP_store_bot?start=order_
                {completedReceipt.order.id}
              </a>
            </div>

            {/* Interactive Telegram Bot Delivery Simulator right on the Receipt */}
            <div className="spellbook-card">
              <h4>
                ⚡ Быстрая отправка адреса в @wizard_HP_store_bot прямо отсюда:
              </h4>
              <p style={{ fontSize: "0.92rem", margin: "4px 0 10px" }}>
                Вы можете либо перейти по ссылке выше в приложение Telegram, либо отправить адрес боту прямо здесь — бот мгновенно обновит заказ в базе Neon и пришлёт реальное уведомление Админу (ID <code>3540653</code>) в Telegram!
              </p>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <input
                  type="text"
                  className="ink-input"
                  style={{ flex: 1 }}
                  value={simAddressInput}
                  onChange={(e) => setSimAddressInput(e.target.value)}
                  placeholder="Введите ваш адрес доставки..."
                />
                <button
                  type="button"
                  className="ink-btn-secondary"
                  disabled={simBotLoading}
                  onClick={() =>
                    handleSimulateTelegramBotDelivery(completedReceipt.order.id)
                  }
                >
                  {simBotLoading
                    ? "⏳ Отправка..."
                    : "📍 Отправить адрес через Бота"}
                </button>
              </div>
              {simBotReply && (
                <p
                  style={{
                    marginTop: "10px",
                    color: "#1a472a",
                    fontWeight: "bold",
                  }}
                >
                  {simBotReply}
                </p>
              )}
            </div>

            <div style={{ textAlign: "right", marginTop: "16px" }}>
              <button
                type="button"
                className="ink-btn-secondary"
                onClick={() => setCompletedReceipt(null)}
              >
                Закрыть квитанцию
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
