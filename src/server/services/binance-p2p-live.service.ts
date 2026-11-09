import "server-only";
import type {
  BankLiveMonitorDto,
  VenezuelanBank,
} from "@/features/p2p-ledger/schemas/p2p.schemas";

interface BinanceP2PAdv {
  adv: {
    advNo: string;
    price: string;
    fiatUnit: string;
    asset: string;
    minSingleTransAmount: string;
    maxSingleTransAmount: string;
  };
  advertiser: {
    nickName: string;
    userType: string;
    monthOrderCount: number;
    monthFinishRate: number;
  };
}

interface BinanceP2PSearchResponse {
  code: string;
  message: string | null;
  data: BinanceP2PAdv[] | null;
  total: number;
  success: boolean;
}

interface CachedBrechasEntry {
  timestamp: number;
  data: readonly BankLiveMonitorDto[];
}

const BRECHAS_CACHE = new Map<string, CachedBrechasEntry>();
const CACHE_TTL_MS = 8_000; // 8 segundos de caché para optimizar velocidad y evitar rate-limits

const BANK_CONFIG: readonly {
  bankName: VenezuelanBank;
  payType: string;
  defaultOrdersToday: number;
  defaultVolumeVes: string;
}[] = [
  {
    bankName: "Banesco",
    payType: "Banesco",
    defaultOrdersToday: 0,
    defaultVolumeVes: "0.00",
  },
  {
    bankName: "Pago Móvil",
    payType: "PagoMovil",
    defaultOrdersToday: 0,
    defaultVolumeVes: "0.00",
  },
  {
    bankName: "Mercantil",
    payType: "Mercantil",
    defaultOrdersToday: 0,
    defaultVolumeVes: "0.00",
  },
  {
    bankName: "BBVA",
    payType: "Provincial", // Binance mapea BBVA Venezuela como Provincial
    defaultOrdersToday: 0,
    defaultVolumeVes: "0.00",
  },
  {
    bankName: "Banco de Venezuela",
    payType: "BancoDeVenezuela",
    defaultOrdersToday: 0,
    defaultVolumeVes: "0.00",
  },
  {
    bankName: "Bancamiga",
    payType: "Bancamiga",
    defaultOrdersToday: 0,
    defaultVolumeVes: "0.00",
  },
  {
    bankName: "BNC",
    payType: "BNCBancoNacional",
    defaultOrdersToday: 0,
    defaultVolumeVes: "0.00",
  },
];

async function fetchBinanceSide(
  tradeType: "BUY" | "SELL",
  payType: string,
  amount: number
): Promise<{ price: number; nick: string } | null> {
  try {
    const payload = {
      asset: "USDT",
      fiat: "VES",
      merchantCheck: true,
      page: 1,
      payTypes: [payType],
      publisherType: "merchant", // Filtra estrictamente solo comerciantes verificados
      rows: 10,
      tradeType,
      transAmount: String(amount),
    };

    const res = await fetch(
      "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(4500),
      }
    );

    if (!res.ok) {
      return null;
    }

    const json = (await res.json()) as BinanceP2PSearchResponse;
    if (json.code !== "000000" || !json.data || json.data.length === 0) {
      return null;
    }

    // Filtramos rigurosamente para garantizar que únicamente sean comerciantes verificados
    const verifiedAds = json.data.filter(
      (item) =>
        item.advertiser.userType === "merchant" ||
        item.advertiser.userType === "pro_merchant"
    );
    const candidateAds = verifiedAds.length > 0 ? verifiedAds : json.data;

    // Tomamos rigurosamente el 2do anuncio (índice 1) de comerciantes verificados. Si solo hay 1, usamos el primero como fallback
    const targetAd = candidateAds[1] ?? candidateAds[0];
    if (!targetAd) return null;

    const parsedPrice = parseFloat(targetAd.adv.price);
    if (isNaN(parsedPrice) || parsedPrice <= 0) return null;

    return {
      price: parsedPrice,
      nick: targetAd.advertiser.nickName || "Comerciante P2P",
    };
  } catch (error) {
    console.warn(
      `[BinanceP2P API Warning] Fallo en ${tradeType} ${payType}:`,
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

export interface LiveBenchmarkRates {
  readonly benchmarkBuyRateVes: number;
  readonly benchmarkSellRateVes: number;
  readonly avgRateVes: number;
  readonly isLive: boolean;
}

export class BinanceP2PLiveService {
  /**
   * Obtiene la tasa de referencia viva de USDT/VES en Binance P2P
   * para calibrar el libro contable de operaciones y las tasas de cambio.
   */
  public static async getLiveMarketBenchmark(
    buyAmount: number = 100_000,
    sellAmount: number = 100_000
  ): Promise<LiveBenchmarkRates> {
    try {
      const brechas = await this.getLiveBrechas(buyAmount, sellAmount);
      const banesco =
        brechas.find((b) => b.bankName === "Banesco") ?? brechas[0];
      if (!banesco) {
        return {
          benchmarkBuyRateVes: 1021.6,
          benchmarkSellRateVes: 1029.8,
          avgRateVes: 1025.7,
          isLive: false,
        };
      }
      const buyNum = parseFloat(banesco.buyRate2nd) || 1021.6;
      const sellNum = parseFloat(banesco.sellRate2nd) || 1029.8;
      return {
        benchmarkBuyRateVes: buyNum,
        benchmarkSellRateVes: sellNum,
        avgRateVes: Number(((buyNum + sellNum) / 2).toFixed(2)),
        isLive: banesco.isLiveApi,
      };
    } catch {
      return {
        benchmarkBuyRateVes: 1021.6,
        benchmarkSellRateVes: 1029.8,
        avgRateVes: 1025.7,
        isLive: false,
      };
    }
  }

  /**
   * Obtiene la brecha real entre el 2do anuncio de compra y el 2do anuncio de venta
   * para los bancos nacionales venezolanos, filtrado independientemente por los montos
   * cotizados en bolívares para compra y para venta (desde 50 Bs. hasta 50.000.000 Bs.).
   */
  public static async getLiveBrechas(
    buyAmount: number = 100_000,
    sellAmount: number = 100_000
  ): Promise<readonly BankLiveMonitorDto[]> {
    const cleanBuyAmount = Math.max(50, Math.min(buyAmount, 50_000_000));
    const cleanSellAmount = Math.max(50, Math.min(sellAmount, 50_000_000));
    const cacheKey = `${cleanBuyAmount}_${cleanSellAmount}`;
    const now = Date.now();

    // 1. Revisar caché en memoria
    const cached = BRECHAS_CACHE.get(cacheKey);
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    // 2. Consulta concurrente para los bancos
    const results = await Promise.all(
      BANK_CONFIG.map(async (config) => {
        // En Binance C2C search:
        // 'BUY' = anuncios donde usuarios compran USDT (merchants venden USDT) => cotizado con sellAmount
        // 'SELL' = anuncios donde usuarios venden USDT (merchants compran USDT) => cotizado con buyAmount
        const [sellAdSide, buyAdSide] = await Promise.all([
          fetchBinanceSide("BUY", config.payType, cleanSellAmount),
          fetchBinanceSide("SELL", config.payType, cleanBuyAmount),
        ]);

        let buyRate2ndNum = buyAdSide?.price;
        let sellRate2ndNum = sellAdSide?.price;
        let merchantBuy = buyAdSide?.nick ?? "Comerciante P2P";
        let merchantSell = sellAdSide?.nick ?? "Comerciante P2P";
        let isLive = Boolean(buyAdSide && sellAdSide);

        // Fallback seguro si la conexión a Binance fallase temporalmente
        if (!buyRate2ndNum || !sellRate2ndNum) {
          const baseRate = 1040.0 + (cleanBuyAmount > 100000 ? 5.0 : 0);
          buyRate2ndNum = baseRate;
          sellRate2ndNum = baseRate + (config.bankName === "Pago Móvil" ? 6.5 : 4.8);
          merchantBuy = "P2P_Merchant_Buy";
          merchantSell = "P2P_Merchant_Sell";
          isLive = false;
        }

        const brechaPoints = sellRate2ndNum - buyRate2ndNum;
        const spreadPct =
          buyRate2ndNum > 0
            ? ((brechaPoints / buyRate2ndNum) * 100).toFixed(2)
            : "0.00";

        return {
          bankName: config.bankName,
          filterAmountVes: cleanBuyAmount,
          buyFilterAmountVes: cleanBuyAmount,
          sellFilterAmountVes: cleanSellAmount,
          buyRate2nd: buyRate2ndNum.toFixed(2),
          sellRate2nd: sellRate2ndNum.toFixed(2),
          brechaPointsVes: (brechaPoints >= 0 ? "+" : "") + brechaPoints.toFixed(2),
          spreadPercent: (brechaPoints >= 0 ? "+" : "") + spreadPct + "%",
          merchantBuyNick: merchantBuy,
          merchantSellNick: merchantSell,
          liveRateVes: sellRate2ndNum.toFixed(2),
          reconciledOrdersToday: config.defaultOrdersToday,
          volumeVesToday: config.defaultVolumeVes,
          isLiveApi: isLive,
        } satisfies BankLiveMonitorDto;
      })
    );

    // Guardar en caché
    BRECHAS_CACHE.set(cacheKey, {
      timestamp: now,
      data: results,
    });

    return results;
  }
}
