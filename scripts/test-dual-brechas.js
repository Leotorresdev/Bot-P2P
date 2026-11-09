const fetch = globalThis.fetch;

async function test() {
  const buyAmt = '200000';
  const sellAmt = '500000';

  console.log(`Probando consulta a Binance con Compra=${buyAmt} Bs. y Venta=${sellAmt} Bs...`);

  // Lado venta (usuarios compran USDT = tradeType: BUY en Binance)
  const resSellSide = await fetch("https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
    body: JSON.stringify({
      asset: "USDT", fiat: "VES", merchantCheck: true, page: 1, payTypes: ["Banesco"],
      publisherType: "merchant", rows: 5, tradeType: "BUY", transAmount: sellAmt
    })
  });
  const dataSellSide = await resSellSide.json();
  const vAdsSell = (dataSellSide.data || []).filter(x => x.advertiser.userType === 'merchant');
  const targetSellAd = vAdsSell[1] || vAdsSell[0];

  // Lado compra (usuarios venden USDT = tradeType: SELL en Binance)
  const resBuySide = await fetch("https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
    body: JSON.stringify({
      asset: "USDT", fiat: "VES", merchantCheck: true, page: 1, payTypes: ["Banesco"],
      publisherType: "merchant", rows: 5, tradeType: "SELL", transAmount: buyAmt
    })
  });
  const dataBuySide = await resBuySide.json();
  const vAdsBuy = (dataBuySide.data || []).filter(x => x.advertiser.userType === 'merchant');
  const targetBuyAd = vAdsBuy[1] || vAdsBuy[0];

  console.log("Resultado Banesco:");
  console.log(`- 2do Anuncio Compra (cotizado a ${buyAmt} Bs.):`, targetBuyAd?.adv?.price, "Bs. por", targetBuyAd?.advertiser?.nickName);
  console.log(`- 2do Anuncio Venta (cotizado a ${sellAmt} Bs.):`, targetSellAd?.adv?.price, "Bs. por", targetSellAd?.advertiser?.nickName);

  const buyRate = parseFloat(targetBuyAd?.adv?.price);
  const sellRate = parseFloat(targetSellAd?.adv?.price);
  const brecha = (sellRate - buyRate).toFixed(2);
  const spreadPct = ((brecha / buyRate) * 100).toFixed(2);
  console.log(`- Brecha Resultante: +${brecha} Bs. (+${spreadPct}%)`);
}

test().catch(console.error);
