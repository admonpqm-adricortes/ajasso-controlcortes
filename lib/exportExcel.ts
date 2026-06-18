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
  return n(c.totalesPorMetodo?.transferencia ?? c.transferencias ?? c.transferencia);
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

function getImporteTerminal(c: any) {
  return n(c.datosTerminal?.importeTerminal);
}

function getAfiliacion(c: any) {
  return c.datosTerminal?.afiliacion || "";
}

function getDiferenciaTerminal(c: any) {
  return getImporteTerminal(c) - getTarjeta(c);
}

function getObservacionTerminal(c: any) {
  return c.datosTerminal?.observacionDiferencia || "";
}

function agregarHojaConcentrado(wb: ExcelJS.Workbook, cierres: any[]) {
  const ws = wb.addWorksheet("CONCENTRADO");

  ws.columns = [
    { header: "FECHA", key: "fecha", width: 14 },
    { header: "SUCURSAL", key: "sucursal", width: 28 },
    { header: "TURNO", key: "turno", width: 14 },
    { header: "EFECTIVO", key: "efectivo", width: 15 },
    { header: "TARJETA SISTEMA", key: "tarjeta", width: 18 },
    { header: "IMPORTE TERMINAL", key: "importeTerminal", width: 18 },
    { header: "AFILIACIÓN", key: "afiliacion", width: 16 },
    { header: "DIF TERMINAL", key: "difTerminal", width: 16 },
    { header: "TRANSFERENCIA", key: "transferencia", width: 18 },
    { header: "VALES", key: "vales", width: 15 },
    { header: "OTROS", key: "otros", width: 15 },
    { header: "TOTAL", key: "total", width: 15 },
    { header: "BOLSA FINAL", key: "bolsaFinal", width: 15 },
    { header: "DIFERENCIA", key: "diferencia", width: 15 },
    { header: "REVISADO", key: "revisado", width: 12 },
    { header: "OBS TERMINAL", key: "obsTerminal", width: 35 },
  ];

  ws.insertRow(1, []);
  ws.mergeCells("A1:P1");
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
      c.revisado ? "SI" : "NO",
      getObservacionTerminal(c),
    ];

    ws.getRow(row).eachCell((cell, col) => {
      normalCell(cell);
      if ([4, 5, 6, 8, 9, 10, 11, 12, 13, 14].includes(col)) {
        cell.numFmt = moneyFmt;
      }
    });

    row++;
  }

  ws.getCell(`A${row}`).value = "TOTALES";
  ws.mergeCells(`A${row}:C${row}`);

  for (const col of [4, 5, 6, 8, 9, 10, 11, 12, 13, 14]) {
    const letter = ws.getColumn(col).letter;
    ws.getCell(`${letter}${row}`).value = {
      formula: `SUM(${letter}3:${letter}${row - 1})`,
    };
    ws.getCell(`${letter}${row}`).numFmt = moneyFmt;
  }

  ws.getRow(row).eachCell((cell) => totalCell(cell));

  ws.autoFilter = {
    from: "A2",
    to: `P${row}`,
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
      { width: 16 },
      { width: 16 },
      { width: 18 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 35 },
    ];

    ws.mergeCells("A1:N1");
    ws.getCell("A1").value = `SUCURSAL: ${sucursal}`;
    ws.getCell("A1").font = { bold: true, size: 15 };
    ws.getCell("A1").alignment = { horizontal: "center" };

    ws.getRow(3).values = [
      "FECHA",
      "TURNO",
      "EFECTIVO",
      "TARJETA SISTEMA",
      "IMPORTE TERMINAL",
      "AFILIACIÓN",
      "DIF TERMINAL",
      "TRANSFERENCIA",
      "VALES",
      "OTROS",
      "TOTAL",
      "BOLSA FINAL",
      "DIFERENCIA",
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
        getObservacionTerminal(c),
      ];

      ws.getRow(row).eachCell((cell, col) => {
        normalCell(cell);
        if ([3, 4, 5, 7, 8, 9, 10, 11, 12, 13].includes(col)) {
          cell.numFmt = moneyFmt;
        }
      });

      row++;
    }

    ws.getCell(`A${row}`).value = "TOTALES";
    ws.mergeCells(`A${row}:B${row}`);

    for (const col of [3, 4, 5, 7, 8, 9, 10, 11, 12, 13]) {
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

function agregarHojaRelacionEfectivo(wb: ExcelJS.Workbook, cierres: any[]) {
  const ws = wb.addWorksheet("RELACION EFECTIVO");

  ws.columns = [
    { width: 16 },
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 4 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
  ];

  ws.mergeCells("A1:E1");
  ws.getCell("A1").value = "RELACION EFECTIVO";
  ws.getCell("A1").font = { bold: true, size: 16 };
  ws.getCell("A1").alignment = { horizontal: "center" };

  ws.getCell("A3").value = "FECHA:";
  ws.getCell("B3").value = cierres[0]?.fecha || "";
  ws.getCell("A3").font = { bold: true };

  ws.getRow(6).values = [
    "FECHA",
    "SUCURSAL",
    "TURNO",
    "BOLSA FINAL",
    "DIFERENCIA",
    "",
    "TARJETA SISTEMA",
    "IMPORTE TERMINAL",
    "AFILIACIÓN",
    "DIF TERMINAL",
  ];

  ["A6", "B6", "C6", "D6", "E6", "G6", "H6", "I6", "J6"].forEach((addr) =>
    headerStyle(ws.getCell(addr))
  );

  let row = 7;

  for (const c of cierres) {
    ws.getRow(row).values = [
      getFecha(c),
      getSucursal(c),
      getTurno(c),
      getBolsa(c),
      getDiferencia(c),
      "",
      getTarjeta(c),
      getImporteTerminal(c),
      getAfiliacion(c),
      getDiferenciaTerminal(c),
    ];

    ws.getRow(row).eachCell((cell, col) => {
      normalCell(cell);
      if ([4, 5, 7, 8, 10].includes(col)) cell.numFmt = moneyFmt;
    });

    row++;
  }

  ws.getCell(`A${row}`).value = "TOTALES";
  ws.mergeCells(`A${row}:C${row}`);

  for (const col of [4, 5, 7, 8, 10]) {
    const letter = ws.getColumn(col).letter;
    ws.getCell(`${letter}${row}`).value = {
      formula: `SUM(${letter}7:${letter}${row - 1})`,
    };
    ws.getCell(`${letter}${row}`).numFmt = moneyFmt;
  }

  ws.getRow(row).eachCell((cell) => totalCell(cell));
  ws.views = [{ state: "frozen", ySplit: 6 }];
}

async function generarWorkbookCierres(cierres: any[]) {
  const wb = new ExcelJS.Workbook();

  wb.creator = "AJASSO Control Cortes";
  wb.created = new Date();

  agregarHojaRelacionEfectivo(wb, cierres);
  agregarHojaConcentrado(wb, cierres);
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