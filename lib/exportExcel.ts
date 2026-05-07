function descargarExcelHTML(nombre: string, html: string) {
  const blob = new Blob(["\uFEFF" + html], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre.endsWith(".xls") ? nombre : `${nombre}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

const n = (v: any) => Number(v || 0);

const money = (v: any) =>
  n(v).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
  });

function td(value: any, extra = "") {
  return `<td style="border:1px solid #000;padding:6px;${extra}">${value ?? ""}</td>`;
}

function th(value: any, extra = "") {
  return `<th style="border:1px solid #000;padding:6px;background:#e5e7eb;font-weight:bold;text-align:center;${extra}">${value ?? ""}</th>`;
}

export function exportarCierresExcel(cierres: any[]) {
  const rows = cierres
    .map(
      (c) => `
      <tr>
        ${td(c.fecha)}
        ${td(c.sucursalId)}
        ${td(money(c.totalesPorMetodo?.efectivo), "text-align:right;")}
        ${td(money(c.totalesPorMetodo?.tarjeta), "text-align:right;")}
        ${td(money(c.totalesPorMetodo?.transferencia), "text-align:right;")}
        ${td(money(c.totalesPorMetodo?.vales), "text-align:right;")}
        ${td(money(c.totalesPorMetodo?.otros), "text-align:right;")}
        ${td(money(c.totalEsperado), "text-align:right;font-weight:bold;")}
        ${td(money(c.bolsaFinal), "text-align:right;font-weight:bold;")}
        ${td(money(c.diferencia), "text-align:right;")}
        ${td(c.revisado ? "SI" : "NO", "text-align:center;")}
      </tr>`
    )
    .join("");

  const html = `
  <html>
    <body>
      <table>
        <tr>
          <th colspan="11" style="font-size:18px;background:#111827;color:white;padding:10px;">
            REPORTE DE CIERRES AJASSO
          </th>
        </tr>
        <tr></tr>
        <tr>
          ${th("Fecha")}
          ${th("Sucursal")}
          ${th("Efectivo")}
          ${th("Tarjeta")}
          ${th("Transferencia")}
          ${th("Vales")}
          ${th("Otros")}
          ${th("Total esperado")}
          ${th("Bolsa final")}
          ${th("Diferencia")}
          ${th("Revisado")}
        </tr>
        ${rows}
      </table>
    </body>
  </html>`;

  descargarExcelHTML("cierres_ajasso.xls", html);
}

export function exportarRelacionEntregaEfectivo(cierres: any[]) {
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

  let totalCortes = 0;

  for (const c of cierres) {
    totalCortes += n(c.bolsaFinal);

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

  const total =
    denoms.b1000 * 1000 +
    denoms.b500 * 500 +
    denoms.b200 * 200 +
    denoms.b100 * 100 +
    denoms.b50 * 50 +
    denoms.b20 * 20 +
    denoms.m20 * 20 +
    denoms.m10 * 10 +
    denoms.m5 * 5 +
    denoms.m2 * 2 +
    denoms.m1 * 1 +
    denoms.m050 * 0.5;

  const diferencia = total - totalCortes;
  const fecha = cierres[0]?.fecha || "";

  const filaDenom = (den: string, cantidad: number, importe: number) => `
    <tr>
      ${td(den, "text-align:right;")}
      ${td(cantidad, "text-align:right;")}
      ${td(money(importe), "text-align:right;")}
      ${td("")}
      ${td("")}
      ${td("")}
    </tr>
  `;

  const html = `
  <html>
    <body>
      <table style="border-collapse:collapse;font-family:Arial;">
        <tr>
          <th colspan="3" style="border:1px solid #000;background:#e5e7eb;font-size:16px;padding:8px;">
            DENOMINACIÓN DE ENTREGA
          </th>
          <th colspan="3" style="border:1px solid #000;background:#e5e7eb;font-size:16px;padding:8px;">
            GASTOS DESCONTADOS
          </th>
        </tr>

        <tr>
          ${td("<b>FECHA:</b>")}
          ${td(fecha)}
          ${td("")}
          ${td("<b>FECHA</b>")}
          ${td("")}
          ${td("")}
        </tr>

        <tr>
          <th colspan="3" style="border:1px solid #000;background:#f3f4f6;padding:6px;">BILLETES</th>
          ${td("")}${td("")}${td("")}
        </tr>

        <tr>
          ${th("Denominación")}
          ${th("Cantidad")}
          ${th("Importe")}
          ${th("")}
          ${th("")}
          ${th("")}
        </tr>

        ${filaDenom("1000", denoms.b1000, denoms.b1000 * 1000)}
        ${filaDenom("500", denoms.b500, denoms.b500 * 500)}
        ${filaDenom("200", denoms.b200, denoms.b200 * 200)}
        ${filaDenom("100", denoms.b100, denoms.b100 * 100)}
        ${filaDenom("50", denoms.b50, denoms.b50 * 50)}
        ${filaDenom("20", denoms.b20, denoms.b20 * 20)}

        <tr>
          <th colspan="3" style="border:1px solid #000;background:#f3f4f6;padding:6px;">MONEDAS</th>
          ${td("")}${td("")}${td("")}
        </tr>

        ${filaDenom("20", denoms.m20, denoms.m20 * 20)}
        ${filaDenom("10", denoms.m10, denoms.m10 * 10)}
        ${filaDenom("5", denoms.m5, denoms.m5 * 5)}
        ${filaDenom("2", denoms.m2, denoms.m2 * 2)}
        ${filaDenom("1", denoms.m1, denoms.m1 * 1)}
        ${filaDenom("0.5", denoms.m050, denoms.m050 * 0.5)}

        <tr><td colspan="6" style="height:20px;"></td></tr>

        <tr>
          ${td("<b>TOTAL:</b>", "text-align:right;background:#f9fafb;")}
          ${td("")}
          ${td(`<b>${money(total)}</b>`, "text-align:right;background:#f9fafb;")}
          ${td("")}${td("")}${td("")}
        </tr>

        <tr>
          ${td("<b>TOTAL CORTES:</b>", "text-align:right;background:#f9fafb;")}
          ${td("")}
          ${td(`<b>${money(totalCortes)}</b>`, "text-align:right;background:#f9fafb;")}
          ${td("")}${td("")}${td("")}
        </tr>

        <tr>
          ${td("<b>DIFERENCIA:</b>", "text-align:right;background:#f9fafb;")}
          ${td("")}
          ${td(
            `<b>${money(diferencia)}</b>`,
            `text-align:right;background:#f9fafb;color:${
              Math.abs(diferencia) < 0.01 ? "green" : "red"
            };`
          )}
          ${td("")}${td("")}${td("")}
        </tr>
      </table>
    </body>
  </html>`;

  descargarExcelHTML("denominacion_entrega.xls", html);
}