import "server-only";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { MERCHANT_BADGE_META } from "@/features/p2p-ledger/schemas/p2p.schemas";
import {
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

/**
 * Genera el libro Excel (.xlsx) estructurado en:
 * - Sección 1: Encabezado y Resumen de Ganancias del Cierre
 * - Sección 2: Historial Íntegro de Órdenes (mismo orden cronológico Binance P2P)
 */
export async function buildClosingWorkbookXlsx(
  report: ClosingReportData
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Bot P2P Venezuela";
  wb.created = new Date();

  const ws = wb.addWorksheet("Cierre P2P", {
    views: [{ state: "frozen", ySplit: 0 }],
  });

  ws.columns = [
    { width: 13 }, // A: Fecha
    { width: 12 }, // B: Hora
    { width: 23 }, // C: N° Orden
    { width: 22 }, // D: N° Anuncio
    { width: 12 }, // E: Tipo
    { width: 15 }, // F: Estado
    { width: 20 }, // G: Banco
    { width: 20 }, // H: Contraparte
    { width: 16 }, // I: Precio (Bs)
    { width: 16 }, // J: Cantidad (USDT)
    { width: 20 }, // K: Total (Bs)
  ];

  const s = report.summary;
  const badgeMeta = MERCHANT_BADGE_META[s.merchantBadge];
  const avgLabel = "Promedio Ponderado Real (Σ Total Bs ÷ Σ Total USDT)";

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
  const isMonthReport = report.scope === "MONTH";
  const dailyClosures = report.dailyClosures ?? [];

  ws.mergeCells("A2:K2");
  const sec1Header = ws.getCell("A2");
  sec1Header.value = isMonthReport
    ? `SECCIÓN 1 — RESUMEN GENERAL DEL MES (${dailyClosures.length} DÍAS CERRADOS • ${report.totalShiftsInPeriod ?? 0} JORNADAS) • ${avgLabel}`
    : `SECCIÓN 1 — RESUMEN DE GANANCIAS E INSIGNIA APLICADA (${badgeMeta.label.toUpperCase()} ${badgeMeta.feeLabel}) • ${avgLabel}`;
  sec1Header.font = { bold: true, size: 10, color: { argb: "FF065F46" } };
  sec1Header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD1FAE5" },
  };
  sec1Header.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(2).height = 22;

  const summaryRows: ReadonlyArray<
    readonly [string, string, string, string, boolean?]
  > = [
    ["Período del Reporte", report.periodLabel, "Generado (Hora VET)", report.generatedAtVet],
    [
      "Insignia Aplicada",
      `${badgeMeta.label} (${badgeMeta.feeLabel})`,
      isMonthReport ? "Días y Jornadas Consolidadas" : "Total Órdenes Período",
      isMonthReport
        ? `${dailyClosures.length} días cerrados · ${report.totalShiftsInPeriod ?? 0} jornadas (${s.totalOrdersInPeriod} órdenes)`
        : `${s.totalOrdersInPeriod} (${s.reconciledOrdersCount} completadas)`,
    ],
    ["Volumen Total Vendido", `${s.totalSoldUsdt} USDT`, "Total Bs. Recibidos (Ventas)", `${s.totalSoldVes} Bs.`],
    ["Volumen Total Comprado", `${s.totalBoughtUsdt} USDT`, "Total Bs. Pagados (Compras)", `${s.totalBoughtVes} Bs.`],
    ["Volumen Total Movido (Compra+Venta)", `${s.totalVolumeUsdt} USDT`, "Volumen de la Vuelta (min)", `${s.vueltaVolumeUsdt} USDT`],
    ["Precio Promedio Venta (Bs.)", `${s.activeAvgSellRateVes} Bs./USDT`, "Precio Promedio Compra (Bs.)", `${s.activeAvgBuyRateVes} Bs./USDT`],
    ["Brecha de Puntos", `${s.brechaPointsVes} pts (Bs./USDT)`, "Estado del Ciclo", getPendingDescription(s)],
    ["Ganancia Bruta de la Vuelta", `${s.grossProfitVes} Bs.`, "Equivalente Ganancia Bruta (USDT)", `${s.grossProfitUsdt} USDT`],
    [`Menos Comisión Insignia (${badgeMeta.feeLabel})`, `-${s.volumeCommissionUsdt} USDT`, "Equivalente Comisión (Bs.)", `-${s.volumeCommissionVes} Bs.`],
    ["GANANCIA NETA REAL FINAL", `${s.netProfitUsdt} USDT`, "GANANCIA NETA REAL (Bs.)", `${s.netProfitVes} Bs.`, true],
    [`Provisión SENIAT (${s.seniatTaxRatePercent}% configurada)`, `${s.seniatTax16Ves} Bs.`, `Provisión SENIAT Equivalente (${s.seniatTaxRatePercent}%)`, `${s.seniatTax16Usdt} USDT`],
  ];

  let currentRowIdx = 3;
  for (const [k1, v1, k2, v2, isHighlight] of summaryRows) {
    ws.mergeCells(`A${currentRowIdx}:B${currentRowIdx}`);
    ws.mergeCells(`C${currentRowIdx}:E${currentRowIdx}`);
    ws.mergeCells(`F${currentRowIdx}:G${currentRowIdx}`);
    ws.mergeCells(`H${currentRowIdx}:K${currentRowIdx}`);

    const row = ws.getRow(currentRowIdx);
    row.getCell("A").value = k1;
    row.getCell("C").value = v1;
    row.getCell("F").value = k2;
    row.getCell("H").value = v2;
    row.height = 20;

    const bgArgb = isHighlight
      ? s.isNetProfitNegative
        ? "FFFFE4E6"
        : "FFECFDF5"
      : "FFF8FAFC";
    const valColor = isHighlight
      ? s.isNetProfitNegative
        ? "FFBE123C"
        : "FF047857"
      : "FF0F172A";

    for (const colLetter of ["A", "C", "F", "H"] as const) {
      const cell = row.getCell(colLetter);
      const isLabel = colLetter === "A" || colLetter === "F";
      cell.font = {
        bold: isLabel || Boolean(isHighlight),
        size: isHighlight ? 11 : 10,
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

  // Si es Cierre Mensual, insertar SECCIÓN 2: TABLA DE CIERRES DIARIOS DEL MES (DÍA POR DÍA)
  if (isMonthReport) {
    ws.mergeCells(`A${currentRowIdx}:K${currentRowIdx}`);
    const dailySecHeader = ws.getCell(`A${currentRowIdx}`);
    dailySecHeader.value =
      "SECCIÓN 2 — TABLA DE CIERRES DIARIOS DEL MES (DÍA POR DÍA • CONSOLIDADO DE JORNADAS)";
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
      "Jornadas",
      "Insignia",
      "Comprado (USDT / Bs)",
      "Vendido (USDT / Bs)",
      "Vol. Movido (USDT)",
      "Prom. Compra / Venta",
      "Brecha Día",
      "Comisión (USDT / Bs)",
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
        "Sin cierres de jornada individuales en este mes; el resumen y la Sección 3 reflejan las transacciones sincronizadas del mes.";
      emptyCell.font = { italic: true, size: 9.5, color: { argb: "FF64748B" } };
      emptyCell.alignment = {
        vertical: "middle",
        horizontal: "center",
      };
      ws.getRow(currentRowIdx).height = 20;
      currentRowIdx++;
    } else {
      for (const dayClosure of dailyClosures) {
        const ds = dayClosure.summary;
        const dRow = ws.getRow(currentRowIdx);
        dRow.values = [
          dayClosure.dateLabelVet,
          `${dayClosure.shiftsCount} ${dayClosure.shiftsCount === 1 ? "jornada" : "jornadas"}`,
          dayClosure.merchantBadgeLabel,
          `${ds.totalBoughtUsdt} USDT (${ds.totalBoughtVes} Bs)`,
          `${ds.totalSoldUsdt} USDT (${ds.totalSoldVes} Bs)`,
          parseSafeDecimal(ds.totalVolumeUsdt).toNumber(),
          `C: ${ds.activeAvgBuyRateVes} | V: ${ds.activeAvgSellRateVes} Bs`,
          `${ds.brechaPointsVes} pts`,
          `-${ds.volumeCommissionUsdt} USDT (-${ds.volumeCommissionVes} Bs)`,
          parseSafeDecimal(ds.netProfitUsdt).toNumber(),
          parseSafeDecimal(ds.netProfitVes).toNumber(),
        ];
        dRow.height = 20;

        dRow.getCell(1).alignment = { vertical: "middle", horizontal: "center" };
        dRow.getCell(2).alignment = { vertical: "middle", horizontal: "center" };
        dRow.getCell(3).alignment = { vertical: "middle", horizontal: "center" };
        dRow.getCell(6).numFmt = "#,##0.00";
        dRow.getCell(8).alignment = { vertical: "middle", horizontal: "center" };
        dRow.getCell(8).font = { bold: true, color: { argb: "FF047857" } };
        dRow.getCell(10).numFmt = "#,##0.00";
        dRow.getCell(11).numFmt = "#,##0.00";

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
    }

    currentRowIdx++;
  }

  // Subtítulo Sección de Órdenes (Sección 3 en Mensual, Sección 2 en Diario/Jornada)
  ws.mergeCells(`A${currentRowIdx}:K${currentRowIdx}`);
  const sec2Header = ws.getCell(`A${currentRowIdx}`);
  sec2Header.value = isMonthReport
    ? "SECCIÓN 3 — HISTORIAL COMPLETO DE ÓRDENES DEL MES (ORDEN CRONOLÓGICO EXACTO BINANCE P2P)"
    : "SECCIÓN 2 — HISTORIAL ÍNTEGRO DE ÓRDENES BINANCE P2P (ORDEN CRONOLÓGICO EXACTO, TODOS LOS TIPOS Y ESTADOS)";
  sec2Header.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
  sec2Header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F172A" },
  };
  sec2Header.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(currentRowIdx).height = 24;
  currentRowIdx++;

  // Cabecera de tabla
  const tableHeaderRow = ws.getRow(currentRowIdx);
  const headers = [
    "Fecha",
    "Hora (-4:00 UTC)",
    "N° de Orden",
    "N° de Anuncio",
    "Tipo",
    "Estado",
    "Banco / Método",
    "Contraparte",
    "Precio (Bs)",
    "Cantidad (USDT)",
    "Total (Bs)",
  ];
  tableHeaderRow.values = headers;
  tableHeaderRow.height = 22;
  tableHeaderRow.eachCell((cell) => {
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
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

  for (const order of report.orders) {
    const isBuy = order.tradeType === "BUY";
    const row = ws.getRow(currentRowIdx);
    row.values = [
      order.dateLabelVet,
      order.timeLabelVet,
      order.orderNumber,
      order.advNo || "-",
      isBuy ? "COMPRA" : "VENTA",
      order.statusLabel,
      order.payMethodName,
      order.counterPartNickName,
      parseSafeDecimal(order.unitPriceVes).toNumber(),
      parseSafeDecimal(order.amountUsdt).toNumber(),
      parseSafeDecimal(order.totalPriceVes).toNumber(),
    ];
    row.height = 19;

    row.getCell(5).font = {
      bold: true,
      color: { argb: isBuy ? "FF047857" : "FFBE123C" },
    };
    row.getCell(5).alignment = { vertical: "middle", horizontal: "center" };

    const statusColors: Record<string, { bg: string; fg: string }> = {
      COMPLETED: { bg: "FFECFDF5", fg: "FF047857" },
      CANCELLED: { bg: "FFFFF1F2", fg: "FFBE123C" },
      IN_APPEAL: { bg: "FFFFFBEB", fg: "FFB45309" },
      IN_PROGRESS: { bg: "FFEFF6FF", fg: "FF1D4ED8" },
    };
    const stColor = statusColors[order.statusCategory] ?? {
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

    row.getCell(9).numFmt = "#,##0.00";
    row.getCell(10).numFmt = "#,##0.00##";
    row.getCell(11).numFmt = "#,##0.00";

    row.eachCell((cell) => {
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });

    currentRowIdx++;
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

/**
 * Genera el reporte PDF profesional en formato A4 Horizontal (Landscape) con:
 * - Sección 1: Encabezado y Resumen de Ganancias del Cierre
 * - Sección 2: Historial Íntegro de Órdenes (orden cronológico exacto Binance)
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

  // Banner Superior
  doc.setFillColor(6, 78, 59);
  doc.rect(0, 0, 297, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`BOT P2P VENEZUELA - ${report.periodLabel}`, 12, 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    `Insignia: ${badgeMeta.label} (${badgeMeta.feeLabel})  |  Generado: ${report.generatedAtVet}  |  Órdenes en período: ${s.totalOrdersInPeriod}`,
    12,
    17
  );

  // Sección 1: Tabla Resumen
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("SECCIÓN 1 - RESUMEN DE GANANCIAS DEL CIERRE", 12, 29);

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
        "Brecha de Puntos",
        `${s.brechaPointsVes} pts (Bs./USDT)  |  Spread: ${s.averageSpreadPercent}`,
      ],
      [
        "Ganancia Bruta Vuelta",
        `${s.grossProfitVes} Bs.  (${s.grossProfitUsdt} USDT)`,
        `Menos Comisión ${badgeMeta.label} (${badgeMeta.feeLabel})`,
        `-${s.volumeCommissionUsdt} USDT  (-${s.volumeCommissionVes} Bs.)`,
      ],
      [
        "GANANCIA NETA REAL (USDT)",
        `${s.netProfitUsdt} USDT`,
        "GANANCIA NETA REAL (Bs.)",
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

  // Si es Cierre Mensual en PDF, incluir Sección 2: Tabla de Cierres Diarios del Mes
  const isMonthPdf = report.scope === "MONTH";
  const pdfDailyClosures = report.dailyClosures ?? [];

  if (isMonthPdf) {
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(
      "SECCIÓN 2 - TABLA DE CIERRES DIARIOS DEL MES (DÍA POR DÍA)",
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
          "Jornadas",
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
          ? [["Sin cierres diarios registrados en este mes", "-", "-", "-", "-", "-", "-", "-", "-"]]
          : pdfDailyClosures.map((dc) => [
              dc.dateLabelVet,
              `${dc.shiftsCount}`,
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
      fontSize: 7.5,
      cellPadding: 1.8,
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
        "N° Anuncio",
        "Tipo",
        "Estado",
        "Banco",
        "Contraparte",
        "Precio (Bs)",
        "Cant. (USDT)",
        "Total (Bs)",
      ],
    ],
    body: report.orders.map((o) => [
      o.dateLabelVet,
      o.timeLabelVet,
      o.orderNumber,
      o.advNo || "-",
      o.tradeType === "BUY" ? "COMPRA" : "VENTA",
      o.statusLabel,
      o.payMethodName,
      o.counterPartNickName,
      parseSafeDecimal(o.unitPriceVes)
        .toNumber()
        .toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 4,
        }),
      o.amountUsdt,
      formatDecimalMoney(parseSafeDecimal(o.totalPriceVes), 2),
    ]),
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 4) {
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
    },
  });

  const arrBuffer = doc.output("arraybuffer");
  return new Uint8Array(arrBuffer);
}

/**
 * Genera el reporte CSV (UTF-8 con BOM para Excel) con Sección 1 + Sección 2.
 */
export function buildClosingCsv(report: ClosingReportData): string {
  const s = report.summary;
  const badgeMeta = MERCHANT_BADGE_META[s.merchantBadge];

  const lines: string[] = [
    [sanitizeCsvCell("REPORTE CIERRE P2P"), sanitizeCsvCell(report.periodLabel)].join(","),
    [sanitizeCsvCell("Insignia Aplicada"), sanitizeCsvCell(`${badgeMeta.label} (${badgeMeta.feeLabel})`)].join(","),
    [sanitizeCsvCell("Total Vendido (USDT / Bs)"), sanitizeCsvCell(`${s.totalSoldUsdt} USDT`), sanitizeCsvCell(`${s.totalSoldVes} Bs.`)].join(","),
    [sanitizeCsvCell("Total Comprado (USDT / Bs)"), sanitizeCsvCell(`${s.totalBoughtUsdt} USDT`), sanitizeCsvCell(`${s.totalBoughtVes} Bs.`)].join(","),
    [sanitizeCsvCell("Volumen Total Movido (USDT)"), sanitizeCsvCell(s.totalVolumeUsdt)].join(","),
    [sanitizeCsvCell("Prom. Venta vs Compra (Bs)"), sanitizeCsvCell(s.activeAvgSellRateVes), sanitizeCsvCell(s.activeAvgBuyRateVes)].join(","),
    [sanitizeCsvCell("Brecha de Puntos"), sanitizeCsvCell(`${s.brechaPointsVes} pts`)].join(","),
    [sanitizeCsvCell("Ganancia Bruta (Bs / USDT)"), sanitizeCsvCell(`${s.grossProfitVes} Bs.`), sanitizeCsvCell(`${s.grossProfitUsdt} USDT`)].join(","),
    [sanitizeCsvCell("Comisión Insignia (USDT / Bs)"), sanitizeCsvCell(`-${s.volumeCommissionUsdt} USDT`), sanitizeCsvCell(`-${s.volumeCommissionVes} Bs.`)].join(","),
    [sanitizeCsvCell("Ganancia Neta Real (USDT / Bs)"), sanitizeCsvCell(`${s.netProfitUsdt} USDT`), sanitizeCsvCell(`${s.netProfitVes} Bs.`)].join(","),
    "",
  ];

  if (report.scope === "MONTH" && (report.dailyClosures?.length ?? 0) > 0) {
    lines.push(sanitizeCsvCell("SECCION 2 - CIERRES DIARIOS DEL MES (DIA POR DIA)"));
    lines.push(
      [
        "Fecha_VET",
        "Jornadas_Cerradas",
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
          String(dc.shiftsCount),
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
      "Banco_Metodo",
      "Contraparte",
      "Precio_Bs",
      "Cantidad_USDT",
      "Total_Bs",
    ].join(",")
  );

  for (const o of report.orders) {
    lines.push(
      [
        sanitizeCsvCell(o.dateLabelVet),
        sanitizeCsvCell(o.timeLabelVet),
        sanitizeCsvCell(o.orderNumber),
        sanitizeCsvCell(o.advNo || "-"),
        sanitizeCsvCell(o.tradeType === "BUY" ? "COMPRA" : "VENTA"),
        sanitizeCsvCell(o.statusLabel),
        sanitizeCsvCell(o.payMethodName),
        sanitizeCsvCell(o.counterPartNickName),
        o.unitPriceVes,
        o.amountUsdt,
        o.totalPriceVes,
      ].join(",")
    );
  }

  return `\uFEFF${lines.join("\n")}`;
}
