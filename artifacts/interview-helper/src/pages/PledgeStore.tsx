import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Check, Crown, Loader2, Phone, ShoppingBag, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { usePlan, type FeatureKey } from "@/hooks/use-plan";
import { apiFetch } from "@/lib/api-client";
import { getCurrentLanguage, setLanguage, SUPPORTED_LANGUAGES, type LanguageCode } from "@/i18n";

interface MembershipItem {
  id: string;
  name: string;
  blurb: string;
  effect: string;
  priceUsd: number;
  subscriptionFeature: FeatureKey;
}

const PAGE_COPY: Record<LanguageCode, {
  title: string; intro: string; free: string; alwaysFree: string; freeSummary: string;
  included: string; monthly: string; phoneSummary: string; phoneBullets: string[];
  primeSummary: string; primeBullets: string[]; customPrice: string; customSummary: string;
  contact: string; currency: string; language: string; chargeNote: string;
}> = {
  en: { title: "Choose your plan", intro: "Display prices in your currency. Checkout remains in USD.", free: "Core SALARYMAN access, internal COMMS, and the Meshtastic bridge.", alwaysFree: "Always free", freeSummary: "FREE", included: "Included", monthly: "Per month", phoneSummary: "Automated business calling and messaging, connected to your CRM.", phoneBullets: ["Automated and predictive dialing", "Two-way SMS, campaigns, and recordings", "AI secretary and default business number"], primeSummary: "PABLO PRIME includes every FREE and CALLL HOME benefit.", primeBullets: ["Pablo AI and specialist agents", "Business workflows and bot chaining", "All CALLL HOME calling and messaging"], customPrice: "Personal quote", customSummary: "A direct, personal quote for the services and features your organization needs.", contact: "Request a quote", currency: "Display currency", language: "Language", chargeNote: "Approximate conversion from USD. Checkout and recurring charges remain in USD.", },
  vi: { title: "Chọn gói dịch vụ", intro: "Hiển thị giá bằng tiền tệ của bạn. Thanh toán vẫn bằng USD.", free: "Truy cập SALARYMAN cơ bản, COMMS nội bộ và cầu nối Meshtastic.", alwaysFree: "Miễn phí mãi mãi", freeSummary: "MIỄN PHÍ", included: "Đã bao gồm", monthly: "Mỗi tháng", phoneSummary: "Gọi điện và nhắn tin doanh nghiệp tự động, kết nối CRM.", phoneBullets: ["Gọi tự động và gọi dự đoán", "SMS hai chiều, chiến dịch và ghi âm", "Trợ lý AI và số điện thoại doanh nghiệp mặc định"], primeSummary: "PABLO PRIME bao gồm mọi quyền lợi FREE và CALLL HOME.", primeBullets: ["Pablo AI và các trợ lý chuyên môn", "Quy trình doanh nghiệp và kết nối bot", "Toàn bộ tính năng gọi và nhắn tin CALLL HOME"], customPrice: "Báo giá riêng", customSummary: "Báo giá trực tiếp, cá nhân hóa theo dịch vụ và tính năng tổ chức của bạn cần.", contact: "Yêu cầu báo giá", currency: "Tiền tệ hiển thị", language: "Ngôn ngữ", chargeNote: "Tỷ giá USD mang tính tham khảo. Thanh toán và gia hạn vẫn bằng USD.", },
  ja: { title: "プランを選択", intro: "お好みの通貨で表示できます。決済は USD です。", free: "SALARYMAN の基本機能、内部 COMMS、Meshtastic ブリッジ。", alwaysFree: "ずっと無料", freeSummary: "無料", included: "含まれています", monthly: "月額", phoneSummary: "CRM に接続された自動ビジネス通話・メッセージ機能。", phoneBullets: ["自動発信と予測発信", "双方向 SMS、キャンペーン、録音", "AI 秘書と標準ビジネス番号"], primeSummary: "PABLO PRIME には FREE と CALLL HOME の全特典が含まれます。", primeBullets: ["Pablo AI と専門エージェント", "業務ワークフローとボット連携", "CALLL HOME の通話・メッセージ全機能"], customPrice: "個別見積もり", customSummary: "必要なサービスや機能に合わせた個別の直接見積もりです。", contact: "見積もりを依頼", currency: "表示通貨", language: "言語", chargeNote: "USD からの概算です。決済と定期請求は USD です。", },
  ko: { title: "요금제 선택", intro: "원하는 통화로 표시됩니다. 결제는 USD로 진행됩니다.", free: "SALARYMAN 기본 이용, 내부 COMMS, Meshtastic 브리지.", alwaysFree: "항상 무료", freeSummary: "무료", included: "포함됨", monthly: "월간", phoneSummary: "CRM에 연결되는 자동 비즈니스 통화 및 메시지.", phoneBullets: ["자동 및 예측 다이얼링", "양방향 SMS, 캠페인, 녹음", "AI 비서 및 기본 비즈니스 번호"], primeSummary: "PABLO PRIME에는 FREE와 CALLL HOME의 모든 혜택이 포함됩니다.", primeBullets: ["Pablo AI 및 전문 에이전트", "비즈니스 워크플로와 봇 연결", "CALLL HOME 통화 및 메시지 전체 기능"], customPrice: "맞춤 견적", customSummary: "조직에 필요한 서비스와 기능에 대해 직접 맞춤 견적을 제공합니다.", contact: "견적 요청", currency: "표시 통화", language: "언어", chargeNote: "USD 기준 환산액입니다. 결제와 정기 청구는 USD입니다.", },
  zh: { title: "选择套餐", intro: "可用您的货币查看价格；结账仍以美元进行。", free: "SALARYMAN 基础功能、内部 COMMS 和 Meshtastic 桥接。", alwaysFree: "永久免费", freeSummary: "免费", included: "已包含", monthly: "每月", phoneSummary: "连接 CRM 的自动商务通话和消息服务。", phoneBullets: ["自动拨号和预测拨号", "双向短信、营销活动和录音", "AI 秘书和默认商务号码"], primeSummary: "PABLO PRIME 包含 FREE 和 CALLL HOME 的全部权益。", primeBullets: ["Pablo AI 和专业代理", "业务工作流和机器人串联", "CALLL HOME 的全部通话与消息功能"], customPrice: "专属报价", customSummary: "根据您的组织需求提供直接、个性化的服务与功能报价。", contact: "申请报价", currency: "显示货币", language: "语言", chargeNote: "美元换算仅供参考；结账和续费仍以美元计价。", },
  es: { title: "Elige tu plan", intro: "Consulta los precios en tu moneda. El pago seguirá siendo en USD.", free: "Acceso básico a SALARYMAN, COMMS interno y puente Meshtastic.", alwaysFree: "Gratis siempre", freeSummary: "GRATIS", included: "Incluido", monthly: "Al mes", phoneSummary: "Llamadas y mensajes empresariales automatizados conectados al CRM.", phoneBullets: ["Marcación automática y predictiva", "SMS bidireccionales, campañas y grabaciones", "Secretaría de IA y número empresarial predeterminado"], primeSummary: "PABLO PRIME incluye todos los beneficios de FREE y CALLL HOME.", primeBullets: ["Pablo AI y agentes especializados", "Flujos de trabajo y conexión de bots", "Todas las funciones de llamadas y mensajes de CALLL HOME"], customPrice: "Cotización personal", customSummary: "Cotización directa y personalizada para los servicios y funciones que necesite.", contact: "Solicitar cotización", currency: "Moneda de visualización", language: "Idioma", chargeNote: "Conversión aproximada desde USD. El pago y la renovación siguen en USD.", },
  fr: { title: "Choisissez votre offre", intro: "Affichez les prix dans votre devise. Le paiement reste en USD.", free: "Accès SALARYMAN de base, COMMS interne et passerelle Meshtastic.", alwaysFree: "Toujours gratuit", freeSummary: "GRATUIT", included: "Inclus", monthly: "Par mois", phoneSummary: "Appels et messages professionnels automatisés, reliés au CRM.", phoneBullets: ["Numérotation automatique et prédictive", "SMS bidirectionnels, campagnes et enregistrements", "Secrétaire IA et numéro professionnel par défaut"], primeSummary: "PABLO PRIME inclut tous les avantages FREE et CALLL HOME.", primeBullets: ["Pablo AI et agents spécialisés", "Flux de travail et chaînage de bots", "Toutes les fonctions d'appel et de messagerie CALLL HOME"], customPrice: "Devis personnalisé", customSummary: "Devis direct et personnalisé selon les services et fonctions nécessaires.", contact: "Demander un devis", currency: "Devise d’affichage", language: "Langue", chargeNote: "Conversion USD indicative. Le paiement et le renouvellement restent en USD.", },
  pt: { title: "Escolha seu plano", intro: "Veja os preços na sua moeda. A cobrança continua em USD.", free: "Acesso básico ao SALARYMAN, COMMS interno e ponte Meshtastic.", alwaysFree: "Sempre grátis", freeSummary: "GRÁTIS", included: "Incluído", monthly: "Por mês", phoneSummary: "Chamadas e mensagens empresariais automatizadas, conectadas ao CRM.", phoneBullets: ["Discagem automática e preditiva", "SMS bidirecional, campanhas e gravações", "Secretária de IA e número empresarial padrão"], primeSummary: "PABLO PRIME inclui todos os benefícios de FREE e CALLL HOME.", primeBullets: ["Pablo AI e agentes especialistas", "Fluxos de trabalho e conexão de bots", "Todos os recursos de chamadas e mensagens CALLL HOME"], customPrice: "Orçamento pessoal", customSummary: "Orçamento direto e personalizado para os serviços e recursos que sua organização precisa.", contact: "Solicitar orçamento", currency: "Moeda de exibição", language: "Idioma", chargeNote: "Conversão aproximada de USD. Pagamento e renovação continuam em USD.", },
};

const ACTION_COPY: Record<LanguageCode, { services: string; settings: string; active: string; subscribe: string; opening: string; existingNote: string }> = {
  en: { services: "SALARYMAN services", settings: "Settings", active: "Active", subscribe: "Subscribe monthly", opening: "Opening checkout", existingNote: "Subscriptions renew monthly. Existing subscribers keep their current rates." },
  vi: { services: "Dịch vụ SALARYMAN", settings: "Cài đặt", active: "Đang hoạt động", subscribe: "Đăng ký hàng tháng", opening: "Đang mở thanh toán", existingNote: "Gói dịch vụ gia hạn hàng tháng. Khách hàng hiện tại giữ nguyên mức giá." },
  ja: { services: "SALARYMAN サービス", settings: "設定", active: "利用中", subscribe: "月額プランに登録", opening: "決済画面を開いています", existingNote: "サブスクリプションは毎月更新されます。既存ユーザーの料金は変わりません。" },
  ko: { services: "SALARYMAN 서비스", settings: "설정", active: "활성", subscribe: "월간 구독", opening: "결제 화면 여는 중", existingNote: "구독은 매월 갱신됩니다. 기존 구독자의 요금은 유지됩니다." },
  zh: { services: "SALARYMAN 服务", settings: "设置", active: "已启用", subscribe: "按月订阅", opening: "正在打开结账", existingNote: "订阅按月续费。现有订阅用户的价格保持不变。" },
  es: { services: "Servicios SALARYMAN", settings: "Configuración", active: "Activo", subscribe: "Suscribirse mensualmente", opening: "Abriendo el pago", existingNote: "Las suscripciones se renuevan mensualmente. Los clientes actuales conservan su tarifa." },
  fr: { services: "Services SALARYMAN", settings: "Paramètres", active: "Actif", subscribe: "S’abonner par mois", opening: "Ouverture du paiement", existingNote: "Les abonnements sont renouvelés chaque mois. Les tarifs des abonnés actuels restent inchangés." },
  pt: { services: "Serviços SALARYMAN", settings: "Configurações", active: "Ativo", subscribe: "Assinar mensalmente", opening: "Abrindo o pagamento", existingNote: "As assinaturas são renovadas mensalmente. Os clientes atuais mantêm seus preços." },
};

function getInitialPricingCurrency() {
  try {
    const saved = localStorage.getItem("sm_pricing_currency");
    if (saved) return saved;
  } catch {}
  const locale = typeof navigator === "undefined" ? "en-US" : navigator.language.toLowerCase();
  const region = locale.split("-")[1]?.toUpperCase();
  const byRegion: Record<string, string> = {
    VN: "VND", JP: "JPY", KR: "KRW", CN: "CNY", GB: "GBP", EU: "EUR", FR: "EUR",
    DE: "EUR", ES: "EUR", IT: "EUR", PT: "EUR", BR: "BRL", CA: "CAD", AU: "AUD",
    NZ: "NZD", SG: "SGD", HK: "HKD", IN: "INR", CH: "CHF", MX: "MXN",
  };
  if (region && byRegion[region]) return byRegion[region];
  if (locale.startsWith("vi")) return "VND";
  if (locale.startsWith("ja")) return "JPY";
  if (locale.startsWith("ko")) return "KRW";
  if (locale.startsWith("zh")) return "CNY";
  return "USD";
}

export default function PledgeStore() {
  const [, navigate] = useLocation();
  const { isAuthenticated, isLoading: authLoading, login } = useAuth();
  const { features } = usePlan();
  const [language, setLanguageState] = useState<LanguageCode>(getCurrentLanguage);
  const copy = PAGE_COPY[language] ?? PAGE_COPY.en;
  const actions = ACTION_COPY[language] ?? ACTION_COPY.en;
  const [currency, setCurrency] = useState(getInitialPricingCurrency);
  const [currencies, setCurrencies] = useState<Record<string, string>>({ USD: "US Dollar" });
  const [rates, setRates] = useState<Record<string, number>>({ USD: 1 });
  const [rateError, setRateError] = useState("");
  const currencyNames = useMemo(() => {
    try { return new Intl.DisplayNames([language], { type: "currency" }); } catch { return null; }
  }, [language]);
  const [items, setItems] = useState<MembershipItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [buying, setBuying] = useState<FeatureKey | null>(null);
  const [notice, setNotice] = useState("");
  const legacyPrimeView =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("view") === "prime";

  useEffect(() => {
    let cancelled = false;
    fetch("https://open.er-api.com/v6/latest/USD")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((latest) => {
      if (cancelled) return;
      if (latest.result !== "success" || !latest.rates || typeof latest.rates !== "object") throw new Error();
      const supported = Object.keys(latest.rates);
      setCurrencies(Object.fromEntries(supported.map((code) => [code, code])));
      setRates({ USD: 1, ...latest.rates });
      if (!supported.includes(currency) && currency !== "USD") {
        setCurrency("USD");
        try { localStorage.setItem("sm_pricing_currency", "USD"); } catch {}
        setRateError(`Rates for ${currency} are unavailable; prices are shown in USD.`);
      } else {
      setRateError("");
      }
    }).catch(() => {
      if (!cancelled) {
        setCurrency("USD");
        try { localStorage.setItem("sm_pricing_currency", "USD"); } catch {}
        setRateError("Exchange rates are unavailable; prices are shown in USD.");
      }
    });
    return () => { cancelled = true; };
  }, []);

  const formatPrice = (amount: number) => {
    const converted = amount * (rates[currency] ?? 1);
    try {
      return new Intl.NumberFormat(language, { style: "currency", currency }).format(converted);
    } catch {
      return `${currency} ${converted.toFixed(2)}`;
    }
  };

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/pledge/catalog")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load membership plans.");
        const result = await response.json();
        if (!cancelled) {
          setItems((result.items ?? []).filter((item: MembershipItem) => item.subscriptionFeature));
        }
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Could not load plans.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success" || params.get("purchase") === "success") {
      setNotice("Checkout completed. Your purchase is being fulfilled.");
    } else if (params.get("checkout") === "cancel" || params.get("purchase") === "cancel") {
      setNotice("Checkout canceled. No charge was made.");
    }
  }, []);

  const startCheckout = async (feature: FeatureKey) => {
    if (authLoading) {
      setNotice("Restoring your session. Try again in a moment.");
      return;
    }
    if (!isAuthenticated) {
      login(`${window.location.pathname}${window.location.search}`);
      return;
    }
    if (features.has(feature)) {
      setNotice("This monthly plan is already active on your account.");
      return;
    }

    setBuying(feature);
    setNotice("");
    try {
      const response = await apiFetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.url) {
        throw new Error(result.message || result.error || "Monthly checkout is unavailable.");
      }
      window.location.assign(result.url);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Monthly checkout is unavailable.");
      setBuying(null);
    }
  };

  const calllHome = items.find((item) => item.subscriptionFeature === "phone_system");
  const prime = items.find((item) => item.subscriptionFeature === "claw_bot");

  return (
    <main className="min-h-screen bg-[#fffdf8] px-4 py-6 text-black sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl">
        {isAuthenticated && !authLoading && (
          <button
            type="button"
            onClick={() => navigate("/settings")}
            data-testid="button-membership-back-settings"
            className="mb-8 inline-flex min-h-10 items-center gap-2 border border-black px-3 text-xs font-bold uppercase tracking-wider transition-colors hover:bg-black hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> {actions.settings}
          </button>
        )}

        <header className="mb-8 max-w-2xl">
          <div className="mb-3 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-black/55">
            <ShoppingBag className="h-4 w-4" /> {actions.services}
          </div>
          <h1 className="text-3xl font-black tracking-tight sm:text-5xl">{copy.title}</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-black/65">
            {copy.intro}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <label className="grid gap-1 text-xs font-bold uppercase tracking-wider">
              {copy.currency}
              <select value={currency} onChange={(event) => {
                const value = event.target.value;
                setCurrency(value);
                try { localStorage.setItem("sm_pricing_currency", value); } catch {}
              }} className="min-h-10 border border-black bg-white px-3 text-sm font-normal normal-case tracking-normal">
                {Object.entries(currencies).sort(([a], [b]) => a.localeCompare(b)).map(([code, name]) =>
                  <option key={code} value={code}>{code} — {currencyNames?.of(code) ?? name}</option>
                )}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-bold uppercase tracking-wider">
              {copy.language}
              <select value={language} onChange={(event) => {
                const value = event.target.value as LanguageCode;
                setLanguage(value);
                setLanguageState(value);
              }} className="min-h-10 border border-black bg-white px-3 text-sm font-normal normal-case tracking-normal">
                {SUPPORTED_LANGUAGES.map((option) =>
                  <option key={option.code} value={option.code}>{option.nativeName}</option>
                )}
              </select>
            </label>
          </div>
          <p className="mt-2 text-xs text-black/55">{rateError || copy.chargeNote}</p>
        </header>

        {notice && (
          <div role="status" className="mb-5 border border-black px-4 py-3 text-sm">
            {notice}
          </div>
        )}

        {loading ? (
          <div className="flex min-h-44 items-center justify-center" aria-label="Loading plans">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : loadError ? (
          <div role="alert" className="border border-black px-4 py-3 text-sm">{loadError}</div>
        ) : (
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Membership plans">
            <article className="flex flex-col border border-black bg-white p-5">
              <div className="mb-5 flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center border border-black">
                  <Check className="h-4 w-4" />
                </span>
                <h2 className="text-lg font-black">FREE</h2>
              </div>
              <p className="text-3xl font-black">{formatPrice(0)}</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-wider text-black/50">{copy.alwaysFree}</p>
              <p className="mt-5 text-sm leading-relaxed text-black/70">{copy.free}</p>
              <div className="mt-auto pt-6">
                <span className="block border border-black/20 px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-black/55">
                  {copy.included}
                </span>
              </div>
            </article>

            {calllHome && (
              <MembershipCard
                item={calllHome}
                icon={<Phone className="h-4 w-4" />}
                price={calllHome.priceUsd}
                formatPrice={formatPrice}
                copy={copy}
                actions={actions}
                active={features.has("phone_system")}
                loading={buying === "phone_system"}
                highlighted={false}
                onSubscribe={() => startCheckout("phone_system")}
              />
            )}

            {prime && (
              <MembershipCard
                item={prime}
                icon={<Crown className="h-4 w-4" />}
                price={prime.priceUsd}
                formatPrice={formatPrice}
                copy={copy}
                actions={actions}
                active={features.has("claw_bot")}
                loading={buying === "claw_bot"}
                highlighted={legacyPrimeView}
                onSubscribe={() => startCheckout("claw_bot")}
              />
            )}

            <article className="flex flex-col border border-black bg-white p-5">
              <div className="mb-5 flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center border border-black">
                  <Sparkles className="h-4 w-4" />
                </span>
                <h2 className="text-lg font-black">CUSTOM</h2>
              </div>
              <p className="text-2xl font-black">{copy.customPrice}</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-wider text-black/50">CUSTOM</p>
              <p className="mt-5 text-sm leading-relaxed text-black/70">{copy.customSummary}</p>
              <div className="mt-auto pt-6">
                <a href="/contacts" className="block border border-black bg-black px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-white hover:bg-white hover:text-black">
                  {copy.contact}
                </a>
              </div>
            </article>
          </section>
        )}

        <p className="mt-6 text-xs leading-relaxed text-black/55">
          {actions.existingNote}
        </p>
      </div>
    </main>
  );
}

function MembershipCard({
  item,
  icon,
  price,
  formatPrice,
  copy,
  actions,
  active,
  loading,
  highlighted,
  onSubscribe,
}: {
  item: MembershipItem;
  icon: ReactNode;
  price: number;
  formatPrice: (amount: number) => string;
  copy: (typeof PAGE_COPY)[LanguageCode];
  actions: (typeof ACTION_COPY)[LanguageCode];
  active: boolean;
  loading: boolean;
  highlighted: boolean;
  onSubscribe: () => void;
}) {
  const displayName = item.subscriptionFeature === "claw_bot" ? "PABLO PRIME" : "CALLL HOME";
  const summary = item.subscriptionFeature === "claw_bot" ? copy.primeSummary : copy.phoneSummary;
  const bullets = item.subscriptionFeature === "claw_bot" ? copy.primeBullets : copy.phoneBullets;

  return (
    <article
      className={`flex flex-col border border-black bg-white p-5 ${highlighted ? "ring-2 ring-black ring-offset-2" : ""}`}
    >
      <div className="mb-5 flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center border border-black">{icon}</span>
        <h2 className="text-lg font-black">{displayName}</h2>
      </div>
      <p className="text-3xl font-black">{formatPrice(price)}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-wider text-black/50">{copy.monthly}</p>
      <p className="mt-5 text-sm leading-relaxed text-black/70">{summary}</p>
      <ul className="mt-4 space-y-2 text-xs leading-relaxed text-black/75">
        {bullets.map((bullet) => (
          <li key={bullet} className="flex gap-2">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {bullet}
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-6">
        {active ? (
          <span className="block border border-black bg-black px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-white">
            {actions.active}
          </span>
        ) : (
          <button
            type="button"
            onClick={onSubscribe}
            disabled={loading}
            className="flex min-h-11 w-full items-center justify-center gap-2 border border-black bg-black px-4 py-3 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-white hover:text-black disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? actions.opening : actions.subscribe}
          </button>
        )}
      </div>
    </article>
  );
}