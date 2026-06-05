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
  cell.font = { bold: true };
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
    const d = c.bolsa?.denominaciones;
    if (!d) continue;

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

  const fecha = cierres[0]?.fecha || "";
  ws.getCell("A3").value = "FECHA:";
  ws.getCell("B3").value = fecha;
  ws.getCell("A3").font = { bold: true };

  ws.mergeCells("A5:C5");
  ws.getCell("A5").value = "DENOMINACION DE ENTREGA";
  subHeaderStyle(ws.getCell("A5"));

  ws.mergeCells("G5:J5");
  ws.getCell("G5").value = "RELACION DE CORTES";
  subHeaderStyle(ws.getCell("G5"));

  const denoms = obtenerDenominaciones(cierres);

  const denomRows: [string, number, number][] = [
    ["1000", denoms.b1000, denoms.b1000 * 1000],
    ["500", denoms.b500, denoms.b500 * 500],
    ["200", denoms.b200, denoms.b200 * 200],
    ["100", denoms.b100, denoms.b100 * 100],
    ["50", denoms.b50, denoms.b50 * 50],
    ["20", denoms.b20, denoms.b20 * 20],
    ["20 MONEDA", denoms.m20, denoms.m20 * 20],
    ["10", denoms.m10, denoms.m10 * 10],
    ["5", denoms.m5, denoms.m5 * 5],
    ["2", denoms.m2, denoms.m2 * 2],
    ["1", denoms.m1, denoms.m1 * 1],
    ["0.50", denoms.m050, denoms.m050 * 0.5],
  ];

  ws.getRow(6).values = [
    "DENOMINACION",
    "CANTIDAD",
    "IMPORTE",
    "",
    "",
    "",
    "FECHA",
    "SUCURSAL",
    "TURNO",
    "BOLSA FINAL",
  ];

  ["A6", "B6", "C6", "G6", "H6", "I6", "J6"].forEach((addr) =>
    headerStyle(ws.getCell(addr))
  );

  let row = 7;

  for (const [den, cantidad, importe] of denomRows) {
    ws.getCell(`A${row}`).value = den;
    ws.getCell(`B${row}`).value = cantidad;
    ws.getCell(`C${row}`).value = importe;
    ws.getCell(`C${row}`).numFmt = moneyFmt;

    ["A", "B", "C"].forEach((col) => normalCell(ws.getCell(`${col}${row}`)));

    row++;
  }

  const totalEntrega = totalDenoms(denoms);
  const totalCortes = cierres.reduce((acc, c) => acc + getBolsa(c), 0);
  const diferencia = totalEntrega - totalCortes;

  ws.getCell(`A${row + 1}`).value = "TOTAL:";
  ws.getCell(`C${row + 1}`).value = totalEntrega;
  ws.getCell(`C${row + 1}`).numFmt = moneyFmt;

  ws.getCell(`A${row + 2}`).value = "TOTAL CORTES:";
  ws.getCell(`C${row + 2}`).value = totalCortes;
  ws.getCell(`C${row + 2}`).numFmt = moneyFmt;

  ws.getCell(`A${row + 3}`).value = "DIFERENCIA:";
  ws.getCell(`C${row + 3}`).value = diferencia;
  ws.getCell(`C${row + 3}`).numFmt = moneyFmt;

  [`A${row + 1}`, `C${row + 1}`, `A${row + 2}`, `C${row + 2}`, `A${row + 3}`, `C${row + 3}`].forEach(
    (addr) => totalCell(ws.getCell(addr))
  );

  let corteRow = 7;

  for (const c of cierres) {
    ws.getCell(`G${corteRow}`).value = getFecha(c);
    ws.getCell(`H${corteRow}`).value = getSucursal(c);
    ws.getCell(`I${corteRow}`).value = getTurno(c);
    ws.getCell(`J${corteRow}`).value = getBolsa(c);
    ws.getCell(`J${corteRow}`).numFmt = moneyFmt;

    ["G", "H", "I", "J"].forEach((col) =>
      normalCell(ws.getCell(`${col}${corteRow}`))
    );

    corteRow++;
  }

  ws.getCell(`I${corteRow + 1}`).value = "TOTAL:";
  ws.getCell(`J${corteRow + 1}`).value = totalCortes;
  ws.getCell(`J${corteRow + 1}`).numFmt = moneyFmt;
  totalCell(ws.getCell(`I${corteRow + 1}`));
  totalCell(ws.getCell(`J${corteRow + 1}`));

  ws.views = [{ state: "frozen", ySplit: 6 }];
}

function agregarHojaConcentrado(wb: ExcelJS.Workbook, cierres: any[]) {
  const ws = wb.addWorksheet("CONCENTRADO");

  ws.columns = [
    { header: "FECHA", key: "fecha", width: 14 },
    { header: "SUCURSAL", key: "sucursal", width: 28 },
    { header: "TURNO", key: "turno", width: 14 },
    { header: "EFECTIVO", key: "efectivo", width: 15 },
    { header: "TARJETA", key: "tarjeta", width: 15 },
    { header: "TRANSFERENCIA", key: "transferencia", width: 18 },
    { header: "VALES", key: "vales", width: 15 },
    { header: "OTROS", key: "otros", width: 15 },
    { header: "TOTAL", key: "total", width: 15 },
    { header: "BOLSA FINAL", key: "bolsaFinal", width: 15 },
    { header: "DIFERENCIA", key: "diferencia", width: 15 },
    { header: "REVISADO", key: "revisado", width: 12 },
  ];

  ws.insertRow(1, []);
  ws.mergeCells("A1:L1");
  ws.getCell("A1").value = "CONCENTRADO DE CIERRES";
  ws.getCell("A1").font = { bold: true, size: 16 };
  ws.getCell("A1").alignment = { horizontal: "center" };

  ws.getRow(2).values = [
    "FECHA",
    "SUCURSAL",
    "TURNO",
    "EFECTIVO",
    "TARJETA",
    "TRANSFERENCIA",
    "VALES",
    "OTROS",
    "TOTAL",
    "BOLSA FINAL",
    "DIFERENCIA",
    "REVISADO",
  ];

  ws.getRow(2).eachCell((cell) => headerStyle(cell));

  let row = 3;

  for (const c of cierres) {
    ws.getRow(row).values = [
      getFecha(c),
      getSucursal(c),
      getTurno(c),
      getEfectivo(c),
      getTarjeta(c),
      getTransferencia(c),
      getVales(c),
      getOtros(c),
      getTotal(c),
      getBolsa(c),
      getDiferencia(c),
      c.revisado ? "SI" : "NO",
    ];

    ws.getRow(row).eachCell((cell, col) => {
      normalCell(cell);
      if (col >= 4 && col <= 11) cell.numFmt = moneyFmt;
    });

    row++;
  }

  ws.getCell(`A${row}`).value = "TOTALES";
  ws.mergeCells(`A${row}:C${row}`);

  for (let col = 4; col <= 11; col++) {
    const letter = ws.getColumn(col).letter;
    ws.getCell(`${letter}${row}`).value = {
      formula: `SUM(${letter}3:${letter}${row - 1})`,
    };
    ws.getCell(`${letter}${row}`).numFmt = moneyFmt;
  }

  ws.getRow(row).eachCell((cell) => totalCell(cell));

  ws.autoFilter = {
    from: "A2",
    to: `L${row}`,
  };

  ws.views = [{ state: "frozen", ySplit: 2 }];
}

function agregarHojasPorSucursal(wb: ExcelJS.Workbook, cierres: any[]) {
  const sucursales = Array.from(new Set(cierres.map((c) => getSucursal(c)))).sort();

  for (const sucursal of sucursales) {
    const data = cierres.filter((c) => getSucursal(c) === sucursal);
    const nombreHoja = sucursal.replace(/[\\/*?:[\]]/g, "").slice(0, 31) || "SUCURSAL";

    const ws = wb.addWorksheet(nombreHoja);

    ws.columns = [
      { width: 14 },
      { width: 14 },
      { width: 15 },
      { width: 15 },
      { width: 18 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
    ];

    ws.mergeCells("A1:J1");
    ws.getCell("A1").value = `SUCURSAL: ${sucursal}`;
    ws.getCell("A1").font = { bold: true, size: 15 };
    ws.getCell("A1").alignment = { horizontal: "center" };

    ws.getRow(3).values = [
      "FECHA",
      "TURNO",
      "EFECTIVO",
      "TARJETA",
      "TRANSFERENCIA",
      "VALES",
      "OTROS",
      "TOTAL",
      "BOLSA FINAL",
      "DIFERENCIA",
    ];

    ws.getRow(3).eachCell((cell) => headerStyle(cell));

    let row = 4;

    for (const c of data) {
      ws.getRow(row).values = [
        getFecha(c),
        getTurno(c),
        getEfectivo(c),
        getTarjeta(c),
        getTransferencia(c),
        getVales(c),
        getOtros(c),
        getTotal(c),
        getBolsa(c),
        getDiferencia(c),
      ];

      ws.getRow(row).eachCell((cell, col) => {
        normalCell(cell);
        if (col >= 3) cell.numFmt = moneyFmt;
      });

      row++;
    }

    ws.getCell(`A${row}`).value = "TOTALES";
    ws.mergeCells(`A${row}:B${row}`);

    for (let col = 3; col <= 10; col++) {
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