import "server-only";
import Decimal from "decimal.js";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { MERCHANT_BADGE_META } from "@/features/p2p-ledger/schemas/p2p.schemas";
import { getBinanceAppOrderUsdtDecimal } from "@/lib/format-currency";
import {
  evaluateOrderCalculationEligibility,
  formatDecimalMoney,
  parseSafeDecimal,
  type ClosingReportData,
} from "@/server/services/p2p-accounting.service";

interface AutoTableDocExtension {
  lastAutoTable?: {
    finalY?: number;
  };
}

function sanitizeCsvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

function getPendingDescription(summary: ClosingReportData["summary"]): string {
  if (summary.pendingDirection === "BUY_BACK") {
    return `Pendiente por recomprar: ${summary.pendingUsdt} USDT`;
  }
  if (summary.pendingDirection === "SELL_OUT") {
    return `Pendiente por vender: ${summary.pendingUsdt} USDT`;
  }
  return "Ciclo 100% cuadrado (0.00 USDT)";
}

function formatExcludedSummary(report: ClosingReportData): string {
  const parts: string[] = [];
  if (report.summary.cancelledCount > 0) {
    parts.push(`${report.summary.cancelledCount} cancelada(s)`);
  }
  if (report.summary.inProgressCount > 0) {
    parts.push(`${report.summary.inProgressCount} en curso`);
  }
  if (report.summary.appealCount > 0) {
    parts.push(`${report.summary.appealCount} apelada(s)`);
  }
  const nonUsdt = report.excludedNonUsdtCount ?? 0;
  if (nonUsdt > 0) {
    parts.push(`${nonUsdt} otra(s) moneda(s) ≠ USDT`);
  }
  const nonVes = report.excludedNonVesCount ?? 0;
  if (nonVes > 0) {
    parts.push(`${nonVes} otra(s) fiat ≠ VES`);
  }
  return parts.length > 0 ? parts.join(" · ") : "Ninguna (todas entraron al cálculo)";
}

/**
 * Genera el libro Excel (.xlsx) profesional multi-hoja y 100% auditable:
 * - Hoja 1 ("Resumen y Cierre"): Resumen ejecutivo (en mensual = suma exacta día por día) + Tabla Día por Día con fila TOTAL (=SUM)
 * - Hoja 2 ("Completadas USDT-VES"): Solo las órdenes que entraron en el cálculo con fila de totales (=SUMIF/=SUM)
 * - Hoja 3 ("Espejo Completo Binance"): Todas las órdenes (incluyendo canceladas y otras monedas ≠ USDT) con marca de inclusión
 */
export async function buildClosingWorkbookXlsx(
  report: ClosingReportData
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Bot P2P Venezuela";
  wb.created = new Date();

  const s = report.summary;
  const badgeMeta = MERCHANT_BADGE_META[s.merchantBadge];
  const isMonthReport = report.scope === "MONTH";
  const dailyClosures = report.dailyClosures ?? [];

  // =========================================================================
  // HOJA 1: RESUMEN Y CIERRE (SECCIÓN 1 + SECCIÓN 2 DÍA POR DÍA EN MENSUAL)
  // =========================================================================
  const ws = wb.addWorksheet("Resumen y Cierre", {
    views: [{ state: "frozen", ySplit: 2 }],
  });

  ws.columns = [
    { width: 14 }, // A: Fecha
    { width: 17 }, // B: Órdenes
    { width: 13 }, // C: Insignia
    { width: 17 }, // D: Comprado USDT
    { width: 19 }, // E: Comprado Bs
    { width: 17 }, // F: Vendido USDT
    { width: 19 }, // G: Vendido Bs
    { width: 17 }, // H: Vol. Movido USDT
    { width: 16 }, // I: Comisión USDT
    { width: 19 }, // J: Ganancia Neta (USDT)
    { width: 21 }, // K: Ganancia Neta (Bs)
  ];

  // Título Principal
  ws.mergeCells("A1:K1");
  const titleCell = ws.getCell("A1");
  titleCell.value = `BOT P2P VENEZUELA — ${report.periodLabel.toUpperCase()}`;
  titleCell.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF064E3B" },
  };
  titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 28;

  // Subtítulo Sección 1
  const calcSubtitle = isMonthReport
    ? "SUMA EXACTA DE GANANCIAS Y VOLÚMENES DÍA POR DÍA • SOLO ÓRDENES COMPLETADAS USDT/VES"
    : "PROMEDIO PONDERADO REAL (Σ TOTAL Bs ÷ Σ TOTAL USDT) • SOLO ÓRDENES COMPLETADAS USDT/VES";

  ws.mergeCells("A2:K2");
  const sec1Header = ws.getCell("A2");
  sec1Header.value = isMonthReport
    ? `SECCIÓN 1 — RESUMEN GENERAL DEL MES (${dailyClosures.length} DÍAS CON ACTIVIDAD • ${s.reconciledOrdersCount} COMP. USDT/VES DE ${s.totalOrdersInPeriod} ÓRDENES) • ${calcSubtitle}`
    : `SECCIÓN 1 — RESUMEN DE GANANCIAS E INSIGNIA (${badgeMeta.label.toUpperCase()} ${badgeMeta.feeLabel}) • ${calcSubtitle}`;
  sec1Header.font = { bold: true, size: 9.5, color: { argb: "FF065F46" } };
  sec1Header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD1FAE5" },
  };
  sec1Header.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(2).height = 22;

  let currentRowIdx = 3;

  // Banner de advertencia explícita si Binance aplicó rate-limit o timeout parcial
  if (report.syncWarning) {
    ws.mergeCells(`A${currentRowIdx}:K${currentRowIdx}`);
    const warnCell = ws.getCell(`A${currentRowIdx}`);
    warnCell.value = `⚠ AVISO DE SINCRONIZACIÓN: ${report.syncWarning}`;
    warnCell.font = { bold: true, size: 9.5, color: { argb: "FF92400E" } };
    warnCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFEF3C7" },
    };
    warnCell.alignment = {
      vertical: "middle",
      horizontal: "left",
      indent: 1,
      wrapText: true,
    };
    ws.getRow(currentRowIdx).height = 28;
    currentRowIdx++;
  }

  interface SummaryRowSpec {
    readonly k1: string;
    readonly v1: string | number;
    readonly v1Fmt?: string;
    readonly k2: string;
    readonly v2: string | number;
    readonly v2Fmt?: string;
    readonly isHighlight?: boolean;
  }

  const summaryRows: readonly SummaryRowSpec[] = [
    {
      k1: "Período del Reporte",
      v1: report.periodLabel,
      k2: "Generado (Hora VET)",
      v2: report.generatedAtVet,
    },
    {
      k1: "Insignia Aplicada",
      v1: `${badgeMeta.label} (${badgeMeta.feeLabel})`,
      k2: isMonthReport ? "Actividad del Mes (USDT/VES)" : "Órdenes en Período (USDT/VES)",
      v2: isMonthReport
        ? `${dailyClosures.length} días · ${s.reconciledOrdersCount} comp. USDT/VES de ${s.totalOrdersInPeriod} totales`
        : `${s.reconciledOrdersCount} completadas USDT/VES de ${s.totalOrdersInPeriod} totales`,
    },
    {
      k1: "Órdenes Excluidas del Cálculo",
      v1: formatExcludedSummary(report),
      k2: "Estado del Ciclo",
      v2: getPendingDescription(s),
    },
    {
      k1: "Volumen Total Vendido (USDT)",
      v1: parseSafeDecimal(s.totalSoldUsdt).toNumber(),
      v1Fmt: '#,##0.00" USDT"',
      k2: "Total Bs. Recibidos (Ventas)",
      v2: parseSafeDecimal(s.totalSoldVes).toNumber(),
      v2Fmt: '#,##0.00" Bs."',
    },
    {
      k1: "Volumen Total Comprado (USDT)",
      v1: parseSafeDecimal(s.totalBoughtUsdt).toNumber(),
      v1Fmt: '#,##0.00" USDT"',
      k2: "Total Bs. Pagados (Compras)",
      v2: parseSafeDecimal(s.totalBoughtVes).toNumber(),
      v2Fmt: '#,##0.00" Bs."',
    },
    {
      k1: "Volumen Total Movido (Compra+Venta)",
      v1: parseSafeDecimal(s.totalVolumeUsdt).toNumber(),
      v1Fmt: '#,##0.00" USDT"',
      k2: isMonthReport ? "Volumen Vueltas Diarias (Σ)" : "Volumen de la Vuelta (min)",
      v2: parseSafeDecimal(s.vueltaVolumeUsdt).toNumber(),
      v2Fmt: '#,##0.00" USDT"',
    },
    {
      k1: "Precio Promedio Venta (Bs./USDT)",
      v1: parseSafeDecimal(s.activeAvgSellRateVes).toNumber(),
      v1Fmt: '#,##0.00" Bs."',
      k2: "Precio Promedio Compra (Bs./USDT)",
      v2: parseSafeDecimal(s.activeAvgBuyRateVes).toNumber(),
      v2Fmt: '#,##0.00" Bs."',
    },
    {
      k1: isMonthReport ? "Brecha Efectiva Prom. (Diaria)" : "Brecha de Puntos (Bs./USDT)",
      v1: `${s.brechaPointsVes} pts (Bs./USDT)`,
      k2: "Spread Porcentual",
      v2: s.averageSpreadPercent,
    },
    {
      k1: isMonthReport ? "Ganancia Bruta Acumulada (Bs.)" : "Ganancia Bruta de la Vuelta (Bs.)",
      v1: parseSafeDecimal(s.grossProfitVes).toNumber(),
      v1Fmt: '#,##0.00" Bs."',
      k2: isMonthReport ? "Ganancia Bruta Acumulada (USDT)" : "Equivalente Ganancia Bruta (USDT)",
      v2: parseSafeDecimal(s.grossProfitUsdt).toNumber(),
      v2Fmt: '#,##0.00" USDT"',
    },
    {
      k1: `Menos Comisión Insignia (${badgeMeta.feeLabel})`,
      v1: parseSafeDecimal(s.volumeCommissionUsdt).neg().toNumber(),
      v1Fmt: '#,##0.00" USDT"',
      k2: "Equivalente Comisión (Bs.)",
      v2: parseSafeDecimal(s.volumeCommissionVes).neg().toNumber(),
      v2Fmt: '#,##0.00" Bs."',
    },
    {
      k1: isMonthReport ? "GANANCIA NETA DEL MES (Σ DÍAS · USDT)" : "GANANCIA NETA REAL FINAL (USDT)",
      v1: parseSafeDecimal(s.netProfitUsdt).toNumber(),
      v1Fmt: '#,##0.00" USDT"',
      k2: isMonthReport ? "GANANCIA NETA DEL MES (Σ DÍAS · Bs.)" : "GANANCIA NETA REAL FINAL (Bs.)",
      v2: parseSafeDecimal(s.netProfitVes).toNumber(),
      v2Fmt: '#,##0.00" Bs."',
      isHighlight: true,
    },
    {
      k1: `Provisión SENIAT (${s.seniatTaxRatePercent}% configurada · Bs.)`,
      v1: parseSafeDecimal(s.seniatTax16Ves).toNumber(),
      v1Fmt: '#,##0.00" Bs."',
      k2: `Provisión SENIAT (${s.seniatTaxRatePercent}% · USDT)`,
      v2: parseSafeDecimal(s.seniatTax16Usdt).toNumber(),
      v2Fmt: '#,##0.00" USDT"',
    },
  ];

  for (const spec of summaryRows) {
    ws.mergeCells(`A${currentRowIdx}:B${currentRowIdx}`);
    ws.mergeCells(`C${currentRowIdx}:E${currentRowIdx}`);
    ws.mergeCells(`F${currentRowIdx}:G${currentRowIdx}`);
    ws.mergeCells(`H${currentRowIdx}:K${currentRowIdx}`);

    const row = ws.getRow(currentRowIdx);
    row.getCell("A").value = spec.k1;
    row.getCell("C").value = spec.v1;
    row.getCell("F").value = spec.k2;
    row.getCell("H").value = spec.v2;
    if (spec.v1Fmt) row.getCell("C").numFmt = spec.v1Fmt;
    if (spec.v2Fmt) row.getCell("H").numFmt = spec.v2Fmt;
    row.height = spec.isHighlight ? 23 : 20;

    const bgArgb = spec.isHighlight
      ? s.isNetProfitNegative
        ? "FFFFE4E6"
        : "FFECFDF5"
      : "FFF8FAFC";
    const valColor = spec.isHighlight
      ? s.isNetProfitNegative
        ? "FFBE123C"
        : "FF047857"
      : "FF0F172A";

    for (const colLetter of ["A", "C", "F", "H"] as const) {
      const cell = row.getCell(colLetter);
      const isLabel = colLetter === "A" || colLetter === "F";
      cell.font = {
        bold: isLabel || Boolean(spec.isHighlight),
        size: spec.isHighlight ? 11 : 10,
        color: { argb: isLabel ? "FF334155" : valColor },
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: bgArgb },
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
      cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    }

    currentRowIdx++;
  }

  // Espacio separador
  currentRowIdx++;

  // Si es Cierre Mensual, insertar SECCIÓN 2: TABLA DÍA POR DÍA CON COLUMNAS NUMÉRICAS Y FILA TOTAL (=SUM)
  if (isMonthReport) {
    ws.mergeCells(`A${currentRowIdx}:K${currentRowIdx}`);
    const dailySecHeader = ws.getCell(`A${currentRowIdx}`);
    dailySecHeader.value =
      "SECCIÓN 2 — RESUMEN DIARIO DEL MES (DÍA POR DÍA • CADA FILA ES UN DÍA CALENDARIO VET • SOLO USDT/VES COMPLETADAS)";
    dailySecHeader.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    dailySecHeader.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E3A8A" },
    };
    dailySecHeader.alignment = {
      vertical: "middle",
      horizontal: "left",
      indent: 1,
    };
    ws.getRow(currentRowIdx).height = 24;
    currentRowIdx++;

    const dailyHeaderRow = ws.getRow(currentRowIdx);
    dailyHeaderRow.values = [
      "Fecha (VET)",
      "Órdenes (Comp./Tot.)",
      "Insignia",
      "Comprado (USDT)",
      "Comprado (Bs)",
      "Vendido (USDT)",
      "Vendido (Bs)",
      "Vol. Movido (USDT)",
      "Comisión (USDT)",
      "Ganancia Neta (USDT)",
      "Ganancia Neta (Bs)",
    ];
    dailyHeaderRow.height = 22;
    dailyHeaderRow.eachCell((cell) => {
      cell.font = { bold: true, size: 9.5, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1E293B" },
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = {
        bottom: { style: "medium", color: { argb: "FF334155" } },
      };
    });
    currentRowIdx++;

    if (dailyClosures.length === 0) {
      ws.mergeCells(`A${currentRowIdx}:K${currentRowIdx}`);
      const emptyCell = ws.getCell(`A${currentRowIdx}`);
      emptyCell.value =
        "Sin transacciones sincronizadas en este mes calendario.";
      emptyCell.font = { italic: true, size: 9.5, color: { argb: "FF64748B" } };
      emptyCell.alignment = {
        vertical: "middle",
        horizontal: "center",
      };
      ws.getRow(currentRowIdx).height = 20;
      currentRowIdx++;
    } else {
      const firstDayRowIdx = currentRowIdx;

      for (const dayClosure of dailyClosures) {
        const ds = dayClosure.summary;
        const dRow = ws.getRow(currentRowIdx);
        dRow.values = [
          dayClosure.dateLabelVet,
          `${ds.reconciledOrdersCount} comp. / ${dayClosure.orders.length} tot.`,
          dayClosure.merchantBadgeLabel,
          parseSafeDecimal(ds.totalBoughtUsdt).toNumber(),
          parseSafeDecimal(ds.totalBoughtVes).toNumber(),
          parseSafeDecimal(ds.totalSoldUsdt).toNumber(),
          parseSafeDecimal(ds.totalSoldVes).toNumber(),
          parseSafeDecimal(ds.totalVolumeUsdt).toNumber(),
          parseSafeDecimal(ds.volumeCommissionUsdt).neg().toNumber(),
          parseSafeDecimal(ds.netProfitUsdt).toNumber(),
          parseSafeDecimal(ds.netProfitVes).toNumber(),
        ];
        dRow.height = 20;

        dRow.getCell(1).alignment = { vertical: "middle", horizontal: "center" };
        dRow.getCell(2).alignment = { vertical: "middle", horizontal: "center" };
        dRow.getCell(3).alignment = { vertical: "middle", horizontal: "center" };

        for (const colIdx of [4, 5, 6, 7, 8, 9, 10, 11] as const) {
          dRow.getCell(colIdx).numFmt = "#,##0.00";
          dRow.getCell(colIdx).alignment = {
            vertical: "middle",
            horizontal: "right",
          };
        }

        dRow.getCell(9).font = { color: { argb: "FFB45309" } };
        const netColor = ds.isNetProfitNegative ? "FFBE123C" : "FF047857";
        dRow.getCell(10).font = { bold: true, color: { argb: netColor } };
        dRow.getCell(11).font = { bold: true, color: { argb: netColor } };

        dRow.eachCell((cell) => {
          cell.border = {
            bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          };
        });

        currentRowIdx++;
      }

      const lastDayRowIdx = currentRowIdx - 1;
      const totalRow = ws.getRow(currentRowIdx);
      totalRow.getCell(1).value = "TOTAL DEL MES";
      totalRow.getCell(2).value = `${s.reconciledOrdersCount} comp. / ${s.totalOrdersInPeriod} tot.`;
      totalRow.getCell(3).value = `${dailyClosures.length} días`;
      totalRow.getCell(4).value = {
        formula: `SUM(D${firstDayRowIdx}:D${lastDayRowIdx})`,
        result: parseSafeDecimal(s.totalBoughtUsdt).toNumber(),
      };
      totalRow.getCell(5).value = {
        formula: `SUM(E${firstDayRowIdx}:E${lastDayRowIdx})`,
        result: parseSafeDecimal(s.totalBoughtVes).toNumber(),
      };
      totalRow.getCell(6).value = {
        formula: `SUM(F${firstDayRowIdx}:F${lastDayRowIdx})`,
        result: parseSafeDecimal(s.totalSoldUsdt).toNumber(),
      };
      totalRow.getCell(7).value = {
        formula: `SUM(G${firstDayRowIdx}:G${lastDayRowIdx})`,
        result: parseSafeDecimal(s.totalSoldVes).toNumber(),
      };
      totalRow.getCell(8).value = {
        formula: `SUM(H${firstDayRowIdx}:H${lastDayRowIdx})`,
        result: parseSafeDecimal(s.totalVolumeUsdt).toNumber(),
      };
      totalRow.getCell(9).value = {
        formula: `SUM(I${firstDayRowIdx}:I${lastDayRowIdx})`,
        result: parseSafeDecimal(s.volumeCommissionUsdt).neg().toNumber(),
      };
      totalRow.getCell(10).value = {
        formula: `SUM(J${firstDayRowIdx}:J${lastDayRowIdx})`,
        result: parseSafeDecimal(s.netProfitUsdt).toNumber(),
      };
      totalRow.getCell(11).value = {
        formula: `SUM(K${firstDayRowIdx}:K${lastDayRowIdx})`,
        result: parseSafeDecimal(s.netProfitVes).toNumber(),
      };
      totalRow.height = 24;

      const totalNetColor = s.isNetProfitNegative ? "FFBE123C" : "FF047857";
      for (let colIdx = 1; colIdx <= 11; colIdx++) {
        const cell = totalRow.getCell(colIdx);
        cell.font = {
          bold: true,
          size: 10.5,
          color: {
            argb: colIdx >= 10 ? totalNetColor : "FF0F172A",
          },
        };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFECFDF5" },
        };
        cell.border = {
          top: { style: "medium", color: { argb: "FF047857" } },
          bottom: { style: "double", color: { argb: "FF047857" } },
        };
        if (colIdx >= 4) {
          cell.numFmt = "#,##0.00";
          cell.alignment = { vertical: "middle", horizontal: "right" };
        } else {
          cell.alignment = { vertical: "middle", horizontal: "center" };
        }
      }
      currentRowIdx++;
    }
  }

  // =========================================================================
  // HOJA 2: ÓRDENES COMPLETADAS USDT/VES (EXACTAMENTE LAS DEL CÁLCULO)
  // =========================================================================
  const eligibleOrders = report.orders.filter(
    (o) => evaluateOrderCalculationEligibility(o).included
  );

  const wsCompleted = wb.addWorksheet("Completadas USDT-VES", {
    views: [{ state: "frozen", ySplit: 2 }],
  });

  wsCompleted.columns = [
    { width: 13 }, // A: Fecha
    { width: 12 }, // B: Hora
    { width: 23 }, // C: N° Orden
    { width: 22 }, // D: N° Anuncio
    { width: 11 }, // E: Tipo
    { width: 9 },  // F: Activo
    { width: 8 },  // G: Fiat
    { width: 20 }, // H: Banco
    { width: 20 }, // I: Contraparte
    { width: 15 }, // J: Precio (Bs)
    { width: 16 }, // K: Cantidad (USDT)
    { width: 20 }, // L: Total (Bs)
    { width: 16 }, // M: Comisión Binance
  ];

  wsCompleted.mergeCells("A1:M1");
  const compBanner = wsCompleted.getCell("A1");
  compBanner.value = `ÓRDENES COMPLETADAS USDT/VES INCLUIDAS EN EL CÁLCULO (${eligibleOrders.length} ÓRDENES) — ${report.periodLabel}`;
  compBanner.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
  compBanner.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF065F46" },
  };
  compBanner.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  wsCompleted.getRow(1).height = 24;

  const compHeaderRow = wsCompleted.getRow(2);
  compHeaderRow.values = [
    "Fecha",
    "Hora (-4:00 UTC)",
    "N° de Orden",
    "N° de Anuncio",
    "Tipo",
    "Activo",
    "Fiat",
    "Banco / Método",
    "Contraparte",
    "Precio (Bs)",
    "Cantidad (USDT)",
    "Total (Bs)",
    "Comisión Binance (USDT)",
  ];
  compHeaderRow.height = 22;
  compHeaderRow.eachCell((cell) => {
    cell.font = { bold: true, size: 9.5, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E293B" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      bottom: { style: "medium", color: { argb: "FF334155" } },
    };
  });

  let compRowIdx = 3;
  let exactCompSellUsdt = new Decimal(0);
  let exactCompSellVes = new Decimal(0);
  let exactCompBuyUsdt = new Decimal(0);
  let exactCompBuyVes = new Decimal(0);
  let exactCompFeeUsdt = new Decimal(0);

  for (const order of eligibleOrders) {
    const isBuy = order.tradeType === "BUY";
    const amtDec = getBinanceAppOrderUsdtDecimal(order);
    const totalDec = parseSafeDecimal(order.totalPriceVes);
    const feeDec = parseSafeDecimal(order.commissionUsdt);

    if (isBuy) {
      exactCompBuyUsdt = exactCompBuyUsdt.plus(amtDec);
      exactCompBuyVes = exactCompBuyVes.plus(totalDec);
    } else {
      exactCompSellUsdt = exactCompSellUsdt.plus(amtDec);
      exactCompSellVes = exactCompSellVes.plus(totalDec);
    }
    exactCompFeeUsdt = exactCompFeeUsdt.plus(feeDec);

    const row = wsCompleted.getRow(compRowIdx);
    row.values = [
      order.dateLabelVet,
      order.timeLabelVet,
      order.orderNumber,
      order.advNo || "-",
      isBuy ? "COMPRA" : "VENTA",
      (order.asset || "USDT").toUpperCase(),
      (order.fiat || "VES").toUpperCase(),
      order.payMethodName,
      order.counterPartNickName,
      parseSafeDecimal(order.unitPriceVes).toNumber(),
      amtDec.toNumber(),
      totalDec.toNumber(),
      feeDec.toNumber(),
    ];
    row.height = 19;

    row.getCell(5).font = {
      bold: true,
      color: { argb: isBuy ? "FF047857" : "FFBE123C" },
    };
    row.getCell(5).alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(6).alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(7).alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(10).numFmt = "#,##0.00";
    row.getCell(11).numFmt = "#,##0.00##";
    row.getCell(12).numFmt = "#,##0.00";
    row.getCell(13).numFmt = "#,##0.0000";

    row.eachCell((cell) => {
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });
    compRowIdx++;
  }

  // Filas de auditoría con fórmulas nativas (=SUMIF / =SUM) en Hoja 2
  if (eligibleOrders.length > 0) {
    const firstDataRow = 3;
    const lastDataRow = compRowIdx - 1;

    const totalsSpec = [
      {
        label: "TOTAL VENTAS COMPLETADAS (USDT/VES)",
        usdtFormula: `SUMIF(E${firstDataRow}:E${lastDataRow},"VENTA",K${firstDataRow}:K${lastDataRow})`,
        usdtResult: exactCompSellUsdt.toNumber(),
        vesFormula: `SUMIF(E${firstDataRow}:E${lastDataRow},"VENTA",L${firstDataRow}:L${lastDataRow})`,
        vesResult: exactCompSellVes.toNumber(),
        feeFormula: `SUMIF(E${firstDataRow}:E${lastDataRow},"VENTA",M${firstDataRow}:M${lastDataRow})`,
        feeResult: undefined as number | undefined,
        bg: "FFFFF1F2",
        fg: "FFBE123C",
      },
      {
        label: "TOTAL COMPRAS COMPLETADAS (USDT/VES)",
        usdtFormula: `SUMIF(E${firstDataRow}:E${lastDataRow},"COMPRA",K${firstDataRow}:K${lastDataRow})`,
        usdtResult: exactCompBuyUsdt.toNumber(),
        vesFormula: `SUMIF(E${firstDataRow}:E${lastDataRow},"COMPRA",L${firstDataRow}:L${lastDataRow})`,
        vesResult: exactCompBuyVes.toNumber(),
        feeFormula: `SUMIF(E${firstDataRow}:E${lastDataRow},"COMPRA",M${firstDataRow}:M${lastDataRow})`,
        feeResult: undefined as number | undefined,
        bg: "FFECFDF5",
        fg: "FF047857",
      },
      {
        label: "VOLUMEN TOTAL MOVIDO (COMPRA + VENTA)",
        usdtFormula: `SUM(K${firstDataRow}:K${lastDataRow})`,
        usdtResult: exactCompSellUsdt.plus(exactCompBuyUsdt).toNumber(),
        vesFormula: `SUM(L${firstDataRow}:L${lastDataRow})`,
        vesResult: exactCompSellVes.plus(exactCompBuyVes).toNumber(),
        feeFormula: `SUM(M${firstDataRow}:M${lastDataRow})`,
        feeResult: exactCompFeeUsdt.toNumber(),
        bg: "FFF1F5F9",
        fg: "FF0F172A",
      },
    ] as const;

    for (const t of totalsSpec) {
      wsCompleted.mergeCells(`A${compRowIdx}:J${compRowIdx}`);
      const r = wsCompleted.getRow(compRowIdx);
      r.getCell("A").value = t.label;
      r.getCell("K").value = { formula: t.usdtFormula, result: t.usdtResult };
      r.getCell("L").value = { formula: t.vesFormula, result: t.vesResult };
      r.getCell("M").value =
        t.feeResult !== undefined
          ? { formula: t.feeFormula, result: t.feeResult }
          : { formula: t.feeFormula };
      r.height = 22;

      r.getCell("A").alignment = { vertical: "middle", horizontal: "right" };
      r.getCell("K").numFmt = "#,##0.00";
      r.getCell("L").numFmt = "#,##0.00";
      r.getCell("M").numFmt = "#,##0.0000";

      for (const col of ["A", "K", "L", "M"] as const) {
        const cell = r.getCell(col);
        cell.font = { bold: true, size: 10, color: { argb: t.fg } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: t.bg },
        };
        cell.border = {
          top: { style: "thin", color: { argb: "FFCBD5E1" } },
          bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
        };
      }
      compRowIdx++;
    }
  }

  // =========================================================================
  // HOJA 3: ESPEJO COMPLETO BINANCE (TODAS LAS ÓRDENES, ESTADOS Y MONEDAS)
  // =========================================================================
  const wsAll = wb.addWorksheet("Espejo Completo Binance", {
    views: [{ state: "frozen", ySplit: 2 }],
  });

  wsAll.columns = [
    { width: 13 }, // A: Fecha
    { width: 12 }, // B: Hora
    { width: 23 }, // C: N° Orden
    { width: 22 }, // D: N° Anuncio
    { width: 11 }, // E: Tipo
    { width: 14 }, // F: Estado
    { width: 9 },  // G: Activo
    { width: 8 },  // H: Fiat
    { width: 25 }, // I: ¿Incluida en Cálculo?
    { width: 20 }, // J: Banco
    { width: 20 }, // K: Contraparte
    { width: 15 }, // L: Precio
    { width: 16 }, // M: Cantidad
    { width: 20 }, // N: Total
    { width: 16 }, // O: Comisión Binance
  ];

  wsAll.mergeCells("A1:O1");
  const allBanner = wsAll.getCell("A1");
  allBanner.value = `ESPEJO CRONOLÓGICO COMPLETO BINANCE P2P (${report.orders.length} ÓRDENES — TODOS LOS ESTADOS Y MONEDAS) — ${report.periodLabel}`;
  allBanner.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
  allBanner.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F172A" },
  };
  allBanner.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  wsAll.getRow(1).height = 24;

  const allHeaderRow = wsAll.getRow(2);
  allHeaderRow.values = [
    "Fecha",
    "Hora (-4:00 UTC)",
    "N° de Orden",
    "N° de Anuncio",
    "Tipo",
    "Estado",
    "Activo",
    "Fiat",
    "¿Incluida en Cálculo?",
    "Banco / Método",
    "Contraparte",
    "Precio",
    "Cantidad",
    "Total",
    "Comisión Binance",
  ];
  allHeaderRow.height = 22;
  allHeaderRow.eachCell((cell) => {
    cell.font = { bold: true, size: 9.5, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E293B" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      bottom: { style: "medium", color: { argb: "FF334155" } },
    };
  });

  const statusColors: Record<string, { bg: string; fg: string }> = {
    COMPLETED: { bg: "FFECFDF5", fg: "FF047857" },
    CANCELLED: { bg: "FFFFF1F2", fg: "FFBE123C" },
    IN_APPEAL: { bg: "FFFFFBEB", fg: "FFB45309" },
    IN_PROGRESS: { bg: "FFEFF6FF", fg: "FF1D4ED8" },
  };

  let allRowIdx = 3;
  for (const order of report.orders) {
    const isBuy = order.tradeType === "BUY";
    const eligibility = evaluateOrderCalculationEligibility(order);

    const row = wsAll.getRow(allRowIdx);
    row.values = [
      order.dateLabelVet,
      order.timeLabelVet,
      order.orderNumber,
      order.advNo || "-",
      isBuy ? "COMPRA" : "VENTA",
      order.statusLabel,
      eligibility.normalizedAsset,
      eligibility.normalizedFiat,
      eligibility.reasonLabel,
      order.payMethodName,
      order.counterPartNickName,
      parseSafeDecimal(order.unitPriceVes).toNumber(),
      getBinanceAppOrderUsdtDecimal(order).toNumber(),
      parseSafeDecimal(order.totalPriceVes).toNumber(),
      parseSafeDecimal(order.commissionUsdt).toNumber(),
    ];
    row.height = 19;

    row.getCell(5).font = {
      bold: true,
      color: { argb: isBuy ? "FF047857" : "FFBE123C" },
    };
    row.getCell(5).alignment = { vertical: "middle", horizontal: "center" };

    const stColor = statusColors[eligibility.verifiedStatusCategory] ?? {
      bg: "FFF8FAFC",
      fg: "FF334155",
    };
    const statusCell = row.getCell(6);
    statusCell.font = { bold: true, color: { argb: stColor.fg } };
    statusCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: stColor.bg },
    };
    statusCell.alignment = { vertical: "middle", horizontal: "center" };

    row.getCell(7).alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(8).alignment = { vertical: "middle", horizontal: "center" };

    const inclCell = row.getCell(9);
    inclCell.alignment = { vertical: "middle", horizontal: "center" };
    inclCell.font = {
      bold: true,
      color: { argb: eligibility.included ? "FF047857" : "FF9F1239" },
    };
    inclCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: eligibility.included ? "FFECFDF5" : "FFFFF1F2" },
    };

    row.getCell(12).numFmt = "#,##0.00";
    row.getCell(13).numFmt = "#,##0.00##";
    row.getCell(14).numFmt = "#,##0.00";
    row.getCell(15).numFmt = "#,##0.0000";

    row.eachCell((cell) => {
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });

    allRowIdx++;
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

/**
 * Genera el reporte PDF profesional en formato A4 Horizontal (Landscape) con:
 * - Sección 1: Encabezado y Resumen de Ganancias del Cierre (solo USDT/VES completadas)
 * - Sección 2 (Mensual): Tabla Día por Día
 * - Sección 2/3: Historial Íntegro de Órdenes (orden cronológico exacto Binance)
 */
export async function buildClosingPdfBytes(
  report: ClosingReportData
): Promise<Uint8Array> {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const s = report.summary;
  const badgeMeta = MERCHANT_BADGE_META[s.merchantBadge];
  const isMonthPdf = report.scope === "MONTH";

  // Banner Superior
  doc.setFillColor(6, 78, 59);
  doc.rect(0, 0, 297, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13.5);
  doc.text(`BOT P2P VENEZUELA - ${report.periodLabel}`, 12, 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(
    `Insignia: ${badgeMeta.label} (${badgeMeta.feeLabel})  |  Generado: ${report.generatedAtVet}  |  Completadas USDT/VES: ${s.reconciledOrdersCount} de ${s.totalOrdersInPeriod}`,
    12,
    17
  );

  // Sección 1: Tabla Resumen
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(
    isMonthPdf
      ? "SECCIÓN 1 - RESUMEN MENSUAL (SUMA EXACTA DÍA POR DÍA • SOLO USDT/VES COMPLETADAS)"
      : "SECCIÓN 1 - RESUMEN DE GANANCIAS DEL CIERRE (SOLO USDT/VES COMPLETADAS)",
    12,
    29
  );

  autoTable(doc, {
    startY: 32,
    margin: { left: 12, right: 12 },
    theme: "grid",
    styles: {
      fontSize: 8.5,
      cellPadding: 2.2,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { fontStyle: "bold", fillColor: [248, 250, 252], cellWidth: 52 },
      1: { cellWidth: 84 },
      2: { fontStyle: "bold", fillColor: [248, 250, 252], cellWidth: 54 },
      3: { cellWidth: 83 },
    },
    body: [
      [
        "Volumen Total Vendido",
        `${s.totalSoldUsdt} USDT  (${s.totalSoldVes} Bs.)`,
        "Volumen Total Comprado",
        `${s.totalBoughtUsdt} USDT  (${s.totalBoughtVes} Bs.)`,
      ],
      [
        "Volumen Total Movido",
        `${s.totalVolumeUsdt} USDT (Compra + Venta)`,
        "Volumen Vuelta & Pendiente",
        `${s.vueltaVolumeUsdt} USDT  |  ${getPendingDescription(s)}`,
      ],
      [
        "Prom. Venta vs Compra",
        `V: ${s.activeAvgSellRateVes} Bs.  |  C: ${s.activeAvgBuyRateVes} Bs.`,
        "Brecha Efectiva / Excluidas",
        `${s.brechaPointsVes} pts  |  Excluidas: ${formatExcludedSummary(report)}`,
      ],
      [
        "Ganancia Bruta Vuelta",
        `${s.grossProfitVes} Bs.  (${s.grossProfitUsdt} USDT)`,
        `Menos Comisión ${badgeMeta.label} (${badgeMeta.feeLabel})`,
        `-${s.volumeCommissionUsdt} USDT  (-${s.volumeCommissionVes} Bs.)`,
      ],
      [
        isMonthPdf ? "GANANCIA NETA MES (USDT)" : "GANANCIA NETA REAL (USDT)",
        `${s.netProfitUsdt} USDT`,
        isMonthPdf ? "GANANCIA NETA MES (Bs.)" : "GANANCIA NETA REAL (Bs.)",
        `${s.netProfitVes} Bs.`,
      ],
    ],
    didParseCell: (data) => {
      if (data.row.index === 4) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = s.isNetProfitNegative
          ? [255, 228, 230]
          : [236, 253, 245];
        data.cell.styles.textColor = s.isNetProfitNegative
          ? [190, 18, 60]
          : [4, 120, 87];
      }
    },
  });

  const extDoc = doc as unknown as AutoTableDocExtension;
  let afterSummaryY = extDoc.lastAutoTable?.finalY ?? 76;

  // Si es Cierre Mensual en PDF, incluir Sección 2: Tabla Día por Día
  const pdfDailyClosures = report.dailyClosures ?? [];

  if (isMonthPdf) {
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(
      "SECCIÓN 2 - RESUMEN DIARIO DEL MES (DÍA POR DÍA • TRANSACCIONES CALENDARIO VET)",
      12,
      afterSummaryY + 8
    );

    autoTable(doc, {
      startY: afterSummaryY + 11,
      margin: { left: 12, right: 12 },
      theme: "grid",
      styles: {
        fontSize: 7.5,
        cellPadding: 1.8,
      },
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      head: [
        [
          "Fecha VET",
          "Órdenes",
          "Insignia",
          "Comprado (USDT / Bs)",
          "Vendido (USDT / Bs)",
          "Vol. Movido",
          "Brecha Día",
          "Comisión",
          "Ganancia Neta (USDT / Bs)",
        ],
      ],
      body:
        pdfDailyClosures.length === 0
          ? [["Sin transacciones registradas en este mes", "-", "-", "-", "-", "-", "-", "-", "-"]]
          : pdfDailyClosures.map((dc) => [
              dc.dateLabelVet,
              `${dc.summary.reconciledOrdersCount}/${dc.orders.length}`,
              dc.merchantBadgeLabel,
              `${dc.summary.totalBoughtUsdt} USDT (${dc.summary.totalBoughtVes} Bs)`,
              `${dc.summary.totalSoldUsdt} USDT (${dc.summary.totalSoldVes} Bs)`,
              `${dc.summary.totalVolumeUsdt} USDT`,
              `${dc.summary.brechaPointsVes} pts`,
              `-${dc.summary.volumeCommissionUsdt} USDT`,
              `${dc.summary.netProfitUsdt} USDT (${dc.summary.netProfitVes} Bs)`,
            ]),
    });

    afterSummaryY = extDoc.lastAutoTable?.finalY ?? afterSummaryY + 35;
  }

  // Sección de Historial Íntegro de Órdenes
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(
    isMonthPdf
      ? "SECCIÓN 3 - HISTORIAL COMPLETO DE ÓRDENES DEL MES (ORDEN CRONOLÓGICO BINANCE)"
      : "SECCIÓN 2 - HISTORIAL ÍNTEGRO DE ÓRDENES (ORDEN CRONOLÓGICO EXACTO BINANCE P2P)",
    12,
    afterSummaryY + 8
  );

  autoTable(doc, {
    startY: afterSummaryY + 11,
    margin: { left: 12, right: 12 },
    theme: "striped",
    styles: {
      fontSize: 7.2,
      cellPadding: 1.6,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    head: [
      [
        "Fecha",
        "Hora VET",
        "N° Orden",
        "Tipo",
        "Par",
        "Estado",
        "Cálculo",
        "Banco",
        "Contraparte",
        "Precio",
        "Cantidad",
        "Total",
      ],
    ],
    body: report.orders.map((o) => {
      const elig = evaluateOrderCalculationEligibility(o);
      return [
        o.dateLabelVet,
        o.timeLabelVet,
        o.orderNumber,
        o.tradeType === "BUY" ? "COMPRA" : "VENTA",
        `${elig.normalizedAsset}/${elig.normalizedFiat}`,
        o.statusLabel,
        elig.included ? "SÍ" : "NO",
        o.payMethodName,
        o.counterPartNickName,
        parseSafeDecimal(o.unitPriceVes)
          .toNumber()
          .toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 4,
          }),
        getBinanceAppOrderUsdtDecimal(o).toFixed(2),
        formatDecimalMoney(parseSafeDecimal(o.totalPriceVes), 2),
      ];
    }),
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 3) {
        data.cell.styles.fontStyle = "bold";
        const val = String(data.cell.raw ?? "");
        data.cell.styles.textColor =
          val === "COMPRA" ? [4, 120, 87] : [190, 18, 60];
      }
      if (data.section === "body" && data.column.index === 5) {
        data.cell.styles.fontStyle = "bold";
        const val = String(data.cell.raw ?? "");
        if (val === "Completada") {
          data.cell.styles.textColor = [4, 120, 87];
        } else if (val === "Cancelada") {
          data.cell.styles.textColor = [190, 18, 60];
        } else if (val === "Apelada") {
          data.cell.styles.textColor = [180, 83, 9];
        } else {
          data.cell.styles.textColor = [29, 78, 216];
        }
      }
      if (data.section === "body" && data.column.index === 6) {
        data.cell.styles.fontStyle = "bold";
        const val = String(data.cell.raw ?? "");
        data.cell.styles.textColor =
          val === "SÍ" ? [4, 120, 87] : [190, 18, 60];
      }
    },
  });

  const arrBuffer = doc.output("arraybuffer");
  return new Uint8Array(arrBuffer);
}

/**
 * Genera el reporte CSV (UTF-8 con BOM para Excel) con Sección 1 + Sección 2 (Mensual) + Historial.
 */
export function buildClosingCsv(report: ClosingReportData): string {
  const s = report.summary;
  const badgeMeta = MERCHANT_BADGE_META[s.merchantBadge];

  const lines: string[] = [
    [sanitizeCsvCell("REPORTE CIERRE P2P"), sanitizeCsvCell(report.periodLabel)].join(","),
    [sanitizeCsvCell("Insignia Aplicada"), sanitizeCsvCell(`${badgeMeta.label} (${badgeMeta.feeLabel})`)].join(","),
    [sanitizeCsvCell("Regla de Cálculo"), sanitizeCsvCell(report.scope === "MONTH" ? "Suma exacta día por día · Solo USDT/VES completadas" : "Solo USDT/VES completadas")].join(","),
    [sanitizeCsvCell("Órdenes Excluidas"), sanitizeCsvCell(formatExcludedSummary(report))].join(","),
    [sanitizeCsvCell("Total Vendido (USDT / Bs)"), sanitizeCsvCell(`${s.totalSoldUsdt} USDT`), sanitizeCsvCell(`${s.totalSoldVes} Bs.`)].join(","),
    [sanitizeCsvCell("Total Comprado (USDT / Bs)"), sanitizeCsvCell(`${s.totalBoughtUsdt} USDT`), sanitizeCsvCell(`${s.totalBoughtVes} Bs.`)].join(","),
    [sanitizeCsvCell("Volumen Total Movido (USDT)"), sanitizeCsvCell(s.totalVolumeUsdt)].join(","),
    [sanitizeCsvCell("Prom. Venta vs Compra (Bs)"), sanitizeCsvCell(s.activeAvgSellRateVes), sanitizeCsvCell(s.activeAvgBuyRateVes)].join(","),
    [sanitizeCsvCell("Brecha Efectiva"), sanitizeCsvCell(`${s.brechaPointsVes} pts`)].join(","),
    [sanitizeCsvCell("Ganancia Bruta (Bs / USDT)"), sanitizeCsvCell(`${s.grossProfitVes} Bs.`), sanitizeCsvCell(`${s.grossProfitUsdt} USDT`)].join(","),
    [sanitizeCsvCell("Comisión Insignia (USDT / Bs)"), sanitizeCsvCell(`-${s.volumeCommissionUsdt} USDT`), sanitizeCsvCell(`-${s.volumeCommissionVes} Bs.`)].join(","),
    [sanitizeCsvCell("Ganancia Neta Real (USDT / Bs)"), sanitizeCsvCell(`${s.netProfitUsdt} USDT`), sanitizeCsvCell(`${s.netProfitVes} Bs.`)].join(","),
  ];

  if (report.syncWarning) {
    lines.push([sanitizeCsvCell("AVISO_SINCRONIZACION"), sanitizeCsvCell(report.syncWarning)].join(","));
  }
  lines.push("");

  if (report.scope === "MONTH" && (report.dailyClosures?.length ?? 0) > 0) {
    lines.push(sanitizeCsvCell("SECCION 2 - RESUMEN DIARIO DEL MES (DIA POR DIA)"));
    lines.push(
      [
        "Fecha_VET",
        "Ordenes_Completadas",
        "Ordenes_Totales",
        "Insignia",
        "Comprado_USDT",
        "Comprado_Bs",
        "Vendido_USDT",
        "Vendido_Bs",
        "Volumen_Movido_USDT",
        "Brecha_Pts",
        "Comision_USDT",
        "Comision_Bs",
        "Ganancia_Neta_USDT",
        "Ganancia_Neta_Bs",
      ].join(",")
    );
    for (const dc of report.dailyClosures ?? []) {
      const ds = dc.summary;
      lines.push(
        [
          sanitizeCsvCell(dc.dateLabelVet),
          String(ds.reconciledOrdersCount),
          String(dc.orders.length),
          sanitizeCsvCell(dc.merchantBadgeLabel),
          sanitizeCsvCell(ds.totalBoughtUsdt),
          sanitizeCsvCell(ds.totalBoughtVes),
          sanitizeCsvCell(ds.totalSoldUsdt),
          sanitizeCsvCell(ds.totalSoldVes),
          sanitizeCsvCell(ds.totalVolumeUsdt),
          sanitizeCsvCell(ds.brechaPointsVes),
          sanitizeCsvCell(ds.volumeCommissionUsdt),
          sanitizeCsvCell(ds.volumeCommissionVes),
          sanitizeCsvCell(ds.netProfitUsdt),
          sanitizeCsvCell(ds.netProfitVes),
        ].join(",")
      );
    }
    lines.push("");
  }

  lines.push(
    [
      "Fecha",
      "Hora_VET",
      "Numero_Orden",
      "Numero_Anuncio",
      "Tipo",
      "Estado",
      "Activo",
      "Fiat",
      "Incluida_En_Calculo",
      "Banco_Metodo",
      "Contraparte",
      "Precio",
      "Cantidad",
      "Total",
      "Comision_Binance",
    ].join(",")
  );

  for (const o of report.orders) {
    const elig = evaluateOrderCalculationEligibility(o);
    lines.push(
      [
        sanitizeCsvCell(o.dateLabelVet),
        sanitizeCsvCell(o.timeLabelVet),
        sanitizeCsvCell(o.orderNumber),
        sanitizeCsvCell(o.advNo || "-"),
        sanitizeCsvCell(o.tradeType === "BUY" ? "COMPRA" : "VENTA"),
        sanitizeCsvCell(o.statusLabel),
        sanitizeCsvCell(elig.normalizedAsset),
        sanitizeCsvCell(elig.normalizedFiat),
        sanitizeCsvCell(elig.reasonLabel),
        sanitizeCsvCell(o.payMethodName),
        sanitizeCsvCell(o.counterPartNickName),
        o.unitPriceVes,
        getBinanceAppOrderUsdtDecimal(o).toFixed(2),
        o.totalPriceVes,
        o.commissionUsdt,
      ].join(",")
    );
  }

  return `\uFEFF${lines.join("\n")}`;
}
