import ExcelJS from "exceljs";

const n = (v: any) => Number(v || 0);

function descargarArchivo(nombre: string, buffer: ExcelJS.Buffer) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre.endsWith(".xlsx") ? nombre : `${nombre}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

const moneyFmt = '"$"#,##0.00;[Red]-"$"#,##0.00';

function aplicarBordes(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };
}

function headerStyle(cell: ExcelJS.Cell) {
  cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F4E78" },
  };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  aplicarBordes(cell);
}

function subHeaderStyle(cell: ExcelJS.Cell) {
  cell.font = { bold: true, color: { argb: "FF000000" } };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD9EAF7" },
  };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  aplicarBordes(cell);
}

function normalCell(cell: ExcelJS.Cell) {
  aplicarBordes(cell);
  cell.alignment = { vertical: "middle" };
}

function totalCell(cell: ExcelJS.Cell) {
  cell.font = { bold: true };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFFF99" },
  };
  aplicarBordes(cell);
}

function getTurno(c: any) {
  return c.turno || "GENERAL";
}

function getSucursal(c: any) {
  return c.sucursalId || c.sucursal || "";
}

function getFecha(c: any) {
  return c.fecha || "";
}

function getEfectivo(c: any) {
  return n(c.totalesPorMetodo?.efectivo ?? c.efectivo);
}

function getTarjeta(c: any) {
  return n(c.totalesPorMetodo?.tarjeta ?? c.tarjetas ?? c.tarjeta);
}

function getTransferencia(c: any) {
  return n(
    c.totalesPorMetodo?.transferencia ??
      c.transferencias ??
      c.transferencia
  );
}

function getVales(c: any) {
  return n(c.totalesPorMetodo?.vales ?? c.vales);
}

function getOtros(c: any) {
  return n(c.totalesPorMetodo?.otros ?? c.otros);
}

function getTotal(c: any) {
  return n(c.totalEsperado ?? c.total);
}

function getBolsa(c: any) {
  return n(c.bolsaFinal);
}

function getDiferencia(c: any) {
  return n(c.diferencia);
}

function getTerminales(c: any) {
  const terminales = c.datosTerminal?.terminales;

  if (Array.isArray(terminales) && terminales.length > 0) {
    return terminales.map((t: any, idx: number) => ({
      id: t.id || `terminal_${idx + 1}`,
      importe: n(t.importe),
      afiliacion: String(t.afiliacion || "").trim(),
      observacion: String(t.observacion || "").trim(),
    }));
  }

  const importeLegacy = n(c.datosTerminal?.importeTerminal);
  const afiliacionLegacy = String(c.datosTerminal?.afiliacion || "").trim();
  const obsLegacy = String(c.datosTerminal?.observacionDiferencia || "").trim();

  if (importeLegacy > 0 || afiliacionLegacy || obsLegacy) {
    return [
      {
        id: "terminal_legacy",
        importe: importeLegacy,
        afiliacion: afiliacionLegacy,
        observacion: obsLegacy,
      },
    ];
  }

  return [];
}

function getImporteTerminal(c: any) {
  const totalGuardado = c.datosTerminal?.totalTerminal;

  if (totalGuardado !== undefined && totalGuardado !== null) {
    return n(totalGuardado);
  }

  return getTerminales(c).reduce((acc, t) => acc + n(t.importe), 0);
}

function getAfiliacion(c: any) {
  const afiliaciones = Array.from(
    new Set(
      getTerminales(c)
        .map((t) => t.afiliacion)
        .filter(Boolean)
    )
  );

  if (afiliaciones.length > 0) return afiliaciones.join(", ");

  return c.datosTerminal?.afiliacion || "";
}

function getDiferenciaTerminal(c: any) {
  const difGuardada = c.datosTerminal?.diferenciaTerminal;

  if (difGuardada !== undefined && difGuardada !== null) {
    return n(difGuardada);
  }

  return getImporteTerminal(c) - getTarjeta(c);
}

function getObservacionTerminal(c: any) {
  const observaciones = getTerminales(c)
    .map((t, idx) => {
      if (!t.observacion) return "";
      return `Terminal ${idx + 1}: ${t.observacion}`;
    })
    .filter(Boolean);

  if (observaciones.length > 0) return observaciones.join(" | ");

  return c.datosTerminal?.observacionDiferencia || "";
}

function getSaldoSobranteAnterior(c: any) {
  return n(c.saldoSobranteAnterior);
}

function getSobranteCorte(c: any) {
  return n(c.sobranteCorte);
}

function getSaldoSobranteActual(c: any) {
  return n(c.saldoSobranteActual);
}

function getDenominaciones(c: any) {
  return c.bolsa?.denominaciones || {};
}

function obtenerDenominaciones(cierres: any[]) {
  const denoms = {
    b1000: 0,
    b500: 0,
    b200: 0,
    b100: 0,
    b50: 0,
    b20: 0,
    m20: 0,
    m10: 0,
    m5: 0,
    m2: 0,
    m1: 0,
    m050: 0,
  };

  for (const c of cierres) {
    const d = getDenominaciones(c);

    denoms.b1000 += n(d.b1000);
    denoms.b500 += n(d.b500);
    denoms.b200 += n(d.b200);
    denoms.b100 += n(d.b100);
    denoms.b50 += n(d.b50);
    denoms.b20 += n(d.b20);
    denoms.m20 += n(d.m20);
    denoms.m10 += n(d.m10);
    denoms.m5 += n(d.m5);
    denoms.m2 += n(d.m2);
    denoms.m1 += n(d.m1);
    denoms.m050 += n(d.m050);
  }

  return denoms;
}

function totalDenoms(d: any) {
  return (
    n(d.b1000) * 1000 +
    n(d.b500) * 500 +
    n(d.b200) * 200 +
    n(d.b100) * 100 +
    n(d.b50) * 50 +
    n(d.b20) * 20 +
    n(d.m20) * 20 +
    n(d.m10) * 10 +
    n(d.m5) * 5 +
    n(d.m2) * 2 +
    n(d.m1) * 1 +
    n(d.m050) * 0.5
  );
}

function agregarHojaRelacionEfectivo(wb: ExcelJS.Workbook, cierres: any[]) {
  const ws = wb.addWorksheet("RELACION EFECTIVO");

  ws.columns = [
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 4 },
    { width: 4 },
    { width: 4 },
    { width: 16 },
    { width: 24 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
  ];

  ws.mergeCells("A1:C1");
  ws.getCell("A1").value = "RELACIÓN DE ENTREGA DE EFECTIVO";
  ws.getCell("A1").font = { bold: true, size: 16 };
  ws.getCell("A1").alignment = { horizontal: "center" };

  ws.mergeCells("G1:M1");
  ws.getCell("G1").value = "RELACIÓN DE CORTES";
  ws.getCell("G1").font = { bold: true, size: 16 };
  ws.getCell("G1").alignment = { horizontal: "center" };

  const fechas = Array.from(new Set(cierres.map((c) => getFecha(c)).filter(Boolean))).sort();
  ws.getCell("A3").value = "FECHA / RANGO:";
  ws.getCell("B3").value =
    fechas.length === 0
      ? ""
      : fechas.length === 1
      ? fechas[0]
      : `${fechas[0]} al ${fechas[fechas.length - 1]}`;
  ws.getCell("A3").font = { bold: true };

  ws.mergeCells("A5:C5");
  ws.getCell("A5").value = "DENOMINACIÓN DE ENTREGA";
  subHeaderStyle(ws.getCell("A5"));

  ws.mergeCells("G5:M5");
  ws.getCell("G5").value = "DETALLE DE CIERRES";
  subHeaderStyle(ws.getCell("G5"));

  ws.getRow(6).values = [
    "DENOMINACIÓN",
    "CANTIDAD",
    "IMPORTE",
    "",
    "",
    "",
    "FECHA",
    "SUCURSAL",
    "TURNO",
    "BOLSA FINAL",
    "DIFERENCIA",
    "SOBRANTE CORTE",
    "SALDO SOBRANTE",
  ];

  ["A6", "B6", "C6", "G6", "H6", "I6", "J6", "K6", "L6", "M6"].forEach(
    (addr) => headerStyle(ws.getCell(addr))
  );

  const denoms = obtenerDenominaciones(cierres);

  const denomRows: [string, number, number][] = [
    ["$1000 billete", denoms.b1000, denoms.b1000 * 1000],
    ["$500 billete", denoms.b500, denoms.b500 * 500],
    ["$200 billete", denoms.b200, denoms.b200 * 200],
    ["$100 billete", denoms.b100, denoms.b100 * 100],
    ["$50 billete", denoms.b50, denoms.b50 * 50],
    ["$20 billete", denoms.b20, denoms.b20 * 20],
    ["$20 moneda", denoms.m20, denoms.m20 * 20],
    ["$10 moneda", denoms.m10, denoms.m10 * 10],
    ["$5 moneda", denoms.m5, denoms.m5 * 5],
    ["$2 moneda", denoms.m2, denoms.m2 * 2],
    ["$1 moneda", denoms.m1, denoms.m1 * 1],
    ["$0.50 moneda", denoms.m050, denoms.m050 * 0.5],
  ];

  let denomRow = 7;

  for (const [denominacion, cantidad, importe] of denomRows) {
    ws.getCell(`A${denomRow}`).value = denominacion;
    ws.getCell(`B${denomRow}`).value = cantidad;
    ws.getCell(`C${denomRow}`).value = importe;
    ws.getCell(`C${denomRow}`).numFmt = moneyFmt;

    ["A", "B", "C"].forEach((col) => normalCell(ws.getCell(`${col}${denomRow}`)));

    denomRow++;
  }

  const totalEntrega = totalDenoms(denoms);

  ws.getCell(`A${denomRow + 1}`).value = "TOTAL DENOMINACIONES:";
  ws.getCell(`C${denomRow + 1}`).value = totalEntrega;
  ws.getCell(`C${denomRow + 1}`).numFmt = moneyFmt;

  totalCell(ws.getCell(`A${denomRow + 1}`));
  totalCell(ws.getCell(`C${denomRow + 1}`));

  let cierreRow = 7;

  for (const c of cierres) {
    ws.getRow(cierreRow).values = [
      "",
      "",
      "",
      "",
      "",
      "",
      getFecha(c),
      getSucursal(c),
      getTurno(c),
      getBolsa(c),
      getDiferencia(c),
      getSobranteCorte(c),
      getSaldoSobranteActual(c),
    ];

    ["G", "H", "I", "J", "K", "L", "M"].forEach((col) =>
      normalCell(ws.getCell(`${col}${cierreRow}`))
    );

    ["J", "K", "L", "M"].forEach((col) => {
      ws.getCell(`${col}${cierreRow}`).numFmt = moneyFmt;
    });

    cierreRow++;
  }

  ws.getCell(`G${cierreRow}`).value = "TOTALES";
  ws.mergeCells(`G${cierreRow}:I${cierreRow}`);

  for (const col of ["J", "K", "L", "M"]) {
    ws.getCell(`${col}${cierreRow}`).value = {
      formula: `SUM(${col}7:${col}${cierreRow - 1})`,
    };
    ws.getCell(`${col}${cierreRow}`).numFmt = moneyFmt;
  }

  for (const col of ["G", "J", "K", "L", "M"]) {
    totalCell(ws.getCell(`${col}${cierreRow}`));
  }

  ws.getCell(`A${denomRow + 3}`).value = "TOTAL CORTES:";
  ws.getCell(`C${denomRow + 3}`).value = {
    formula: `SUM(J7:J${cierreRow - 1})`,
  };
  ws.getCell(`C${denomRow + 3}`).numFmt = moneyFmt;

  ws.getCell(`A${denomRow + 4}`).value = "DIFERENCIA ENTREGA:";
  ws.getCell(`C${denomRow + 4}`).value = {
    formula: `C${denomRow + 1}-C${denomRow + 3}`,
  };
  ws.getCell(`C${denomRow + 4}`).numFmt = moneyFmt;

  [`A${denomRow + 3}`, `C${denomRow + 3}`, `A${denomRow + 4}`, `C${denomRow + 4}`].forEach(
    (addr) => totalCell(ws.getCell(addr))
  );

  ws.views = [{ state: "frozen", ySplit: 6 }];
}

function agregarHojaConcentrado(wb: ExcelJS.Workbook, cierres: any[]) {
  const ws = wb.addWorksheet("CONCENTRADO");

  ws.columns = [
    { header: "FECHA", key: "fecha", width: 14 },
    { header: "SUCURSAL", key: "sucursal", width: 28 },
    { header: "TURNO", key: "turno", width: 14 },
    { header: "EFECTIVO", key: "efectivo", width: 15 },
    { header: "TARJETA SISTEMA", key: "tarjeta", width: 18 },
    { header: "TOTAL TERMINALES", key: "importeTerminal", width: 18 },
    { header: "AFILIACIÓN", key: "afiliacion", width: 22 },
    { header: "DIF TERMINAL", key: "difTerminal", width: 16 },
    { header: "TRANSFERENCIA", key: "transferencia", width: 18 },
    { header: "VALES", key: "vales", width: 15 },
    { header: "OTROS", key: "otros", width: 15 },
    { header: "TOTAL", key: "total", width: 15 },
    { header: "BOLSA FINAL", key: "bolsaFinal", width: 15 },
    { header: "DIFERENCIA", key: "diferencia", width: 15 },
    { header: "SOBRANTE ANT.", key: "sobranteAnterior", width: 16 },
    { header: "SOBRANTE CORTE", key: "sobranteCorte", width: 18 },
    { header: "SALDO SOBRANTE", key: "saldoSobrante", width: 18 },
    { header: "REVISADO", key: "revisado", width: 12 },
    { header: "OBS TERMINAL", key: "obsTerminal", width: 40 },
  ];

  ws.insertRow(1, []);
  ws.mergeCells("A1:S1");
  ws.getCell("A1").value = "CONCENTRADO DE CIERRES";
  ws.getCell("A1").font = { bold: true, size: 16 };
  ws.getCell("A1").alignment = { horizontal: "center" };

  ws.getRow(2).values = ws.columns.map((c: any) => c.header);
  ws.getRow(2).eachCell((cell) => headerStyle(cell));

  let row = 3;

  for (const c of cierres) {
    ws.getRow(row).values = [
      getFecha(c),
      getSucursal(c),
      getTurno(c),
      getEfectivo(c),
      getTarjeta(c),
      getImporteTerminal(c),
      getAfiliacion(c),
      getDiferenciaTerminal(c),
      getTransferencia(c),
      getVales(c),
      getOtros(c),
      getTotal(c),
      getBolsa(c),
      getDiferencia(c),
      getSaldoSobranteAnterior(c),
      getSobranteCorte(c),
      getSaldoSobranteActual(c),
      c.revisado ? "SI" : "NO",
      getObservacionTerminal(c),
    ];

    ws.getRow(row).eachCell((cell, col) => {
      normalCell(cell);
      if ([4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17].includes(col)) {
        cell.numFmt = moneyFmt;
      }
    });

    row++;
  }

  ws.getCell(`A${row}`).value = "TOTALES";
  ws.mergeCells(`A${row}:C${row}`);

  for (const col of [4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]) {
    const letter = ws.getColumn(col).letter;
    ws.getCell(`${letter}${row}`).value = {
      formula: `SUM(${letter}3:${letter}${row - 1})`,
    };
    ws.getCell(`${letter}${row}`).numFmt = moneyFmt;
  }

  ws.getRow(row).eachCell((cell) => totalCell(cell));

  ws.autoFilter = {
    from: "A2",
    to: `S${row}`,
  };

  ws.views = [{ state: "frozen", ySplit: 2 }];
}

function agregarHojaTerminales(wb: ExcelJS.Workbook, cierres: any[]) {
  const ws = wb.addWorksheet("TERMINALES");

  ws.columns = [
    { header: "FECHA", key: "fecha", width: 14 },
    { header: "SUCURSAL", key: "sucursal", width: 28 },
    { header: "TURNO", key: "turno", width: 14 },
    { header: "NO. TERMINAL", key: "noTerminal", width: 14 },
    { header: "AFILIACIÓN", key: "afiliacion", width: 18 },
    { header: "IMPORTE TERMINAL", key: "importe", width: 18 },
    { header: "TARJETA SISTEMA", key: "tarjeta", width: 18 },
    { header: "DIF TOTAL CIERRE", key: "diferencia", width: 18 },
    { header: "OBSERVACIÓN", key: "observacion", width: 45 },
  ];

  ws.insertRow(1, []);
  ws.mergeCells("A1:I1");
  ws.getCell("A1").value = "DETALLE DE TERMINALES";
  ws.getCell("A1").font = { bold: true, size: 16 };
  ws.getCell("A1").alignment = { horizontal: "center" };

  ws.getRow(2).values = ws.columns.map((c: any) => c.header);
  ws.getRow(2).eachCell((cell) => headerStyle(cell));

  let row = 3;

  for (const c of cierres) {
    const terminales = getTerminales(c);

    if (terminales.length === 0) {
      ws.getRow(row).values = [
        getFecha(c),
        getSucursal(c),
        getTurno(c),
        "",
        "",
        0,
        getTarjeta(c),
        getDiferenciaTerminal(c),
        "",
      ];
      ws.getRow(row).eachCell((cell, col) => {
        normalCell(cell);
        if ([6, 7, 8].includes(col)) cell.numFmt = moneyFmt;
      });
      row++;
      continue;
    }

    terminales.forEach((t, idx) => {
      ws.getRow(row).values = [
        getFecha(c),
        getSucursal(c),
        getTurno(c),
        idx + 1,
        t.afiliacion,
        n(t.importe),
        idx === 0 ? getTarjeta(c) : "",
        idx === 0 ? getDiferenciaTerminal(c) : "",
        t.observacion,
      ];

      ws.getRow(row).eachCell((cell, col) => {
        normalCell(cell);
        if ([6, 7, 8].includes(col)) cell.numFmt = moneyFmt;
      });

      row++;
    });
  }

  ws.getCell(`A${row}`).value = "TOTALES";
  ws.mergeCells(`A${row}:E${row}`);

  for (const col of [6, 7, 8]) {
    const letter = ws.getColumn(col).letter;
    ws.getCell(`${letter}${row}`).value = {
      formula: `SUM(${letter}3:${letter}${row - 1})`,
    };
    ws.getCell(`${letter}${row}`).numFmt = moneyFmt;
  }

  ws.getRow(row).eachCell((cell) => totalCell(cell));

  ws.autoFilter = {
    from: "A2",
    to: `I${row}`,
  };

  ws.views = [{ state: "frozen", ySplit: 2 }];
}

function agregarHojasPorSucursal(wb: ExcelJS.Workbook, cierres: any[]) {
  const sucursales = Array.from(new Set(cierres.map((c) => getSucursal(c)))).sort();

  for (const sucursal of sucursales) {
    const data = cierres.filter((c) => getSucursal(c) === sucursal);
    const nombreHoja =
      sucursal.replace(/[\\/*?:[\]]/g, "").slice(0, 31) || "SUCURSAL";

    const ws = wb.addWorksheet(nombreHoja);

    ws.columns = [
      { width: 14 },
      { width: 14 },
      { width: 15 },
      { width: 18 },
      { width: 18 },
      { width: 22 },
      { width: 16 },
      { width: 18 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 16 },
      { width: 18 },
      { width: 18 },
      { width: 40 },
    ];

    ws.mergeCells("A1:Q1");
    ws.getCell("A1").value = `SUCURSAL: ${sucursal}`;
    ws.getCell("A1").font = { bold: true, size: 15 };
    ws.getCell("A1").alignment = { horizontal: "center" };

    ws.getRow(3).values = [
      "FECHA",
      "TURNO",
      "EFECTIVO",
      "TARJETA SISTEMA",
      "TOTAL TERMINALES",
      "AFILIACIÓN",
      "DIF TERMINAL",
      "TRANSFERENCIA",
      "VALES",
      "OTROS",
      "TOTAL",
      "BOLSA FINAL",
      "DIFERENCIA",
      "SOBRANTE ANT.",
      "SOBRANTE CORTE",
      "SALDO SOBRANTE",
      "OBS TERMINAL",
    ];

    ws.getRow(3).eachCell((cell) => headerStyle(cell));

    let row = 4;

    for (const c of data) {
      ws.getRow(row).values = [
        getFecha(c),
        getTurno(c),
        getEfectivo(c),
        getTarjeta(c),
        getImporteTerminal(c),
        getAfiliacion(c),
        getDiferenciaTerminal(c),
        getTransferencia(c),
        getVales(c),
        getOtros(c),
        getTotal(c),
        getBolsa(c),
        getDiferencia(c),
        getSaldoSobranteAnterior(c),
        getSobranteCorte(c),
        getSaldoSobranteActual(c),
        getObservacionTerminal(c),
      ];

      ws.getRow(row).eachCell((cell, col) => {
        normalCell(cell);
        if ([3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].includes(col)) {
          cell.numFmt = moneyFmt;
        }
      });

      row++;
    }

    ws.getCell(`A${row}`).value = "TOTALES";
    ws.mergeCells(`A${row}:B${row}`);

    for (const col of [3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]) {
      const letter = ws.getColumn(col).letter;
      ws.getCell(`${letter}${row}`).value = {
        formula: `SUM(${letter}4:${letter}${row - 1})`,
      };
      ws.getCell(`${letter}${row}`).numFmt = moneyFmt;
    }

    ws.getRow(row).eachCell((cell) => totalCell(cell));
    ws.views = [{ state: "frozen", ySplit: 3 }];
  }
}

async function generarWorkbookCierres(cierres: any[]) {
  const wb = new ExcelJS.Workbook();

  wb.creator = "AJASSO Control Cortes";
  wb.created = new Date();

  agregarHojaRelacionEfectivo(wb, cierres);
  agregarHojaConcentrado(wb, cierres);
  agregarHojaTerminales(wb, cierres);
  agregarHojasPorSucursal(wb, cierres);

  return wb;
}

export async function exportarCierresExcel(cierres: any[]) {
  const wb = await generarWorkbookCierres(cierres);
  const buffer = await wb.xlsx.writeBuffer();
  descargarArchivo("reporte_cierres_ajasso.xlsx", buffer);
}

export async function exportarRelacionEntregaEfectivo(cierres: any[]) {
  const wb = new ExcelJS.Workbook();

  wb.creator = "AJASSO Control Cortes";
  wb.created = new Date();

  agregarHojaRelacionEfectivo(wb, cierres);

  const buffer = await wb.xlsx.writeBuffer();
  descargarArchivo("relacion_entrega_efectivo.xlsx", buffer);
}
