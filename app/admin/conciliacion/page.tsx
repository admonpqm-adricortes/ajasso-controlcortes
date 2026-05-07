"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getCierres } from "../../../lib/storage";
import type { CierreDia } from "../../../lib/types";

type Session = {
  username?: string;
  role?: string;
};

type PreviewRow = {
  fecha: string;
  pc: string;
  sucursalMapeada: string;
  efectivo: number;
  tarjeta: number;
  transferencia: number;
  vales: number;
  total: number;
  estado: string;
};

type InternoRow = {
  fecha: string;
  sucursal: string;
  efectivo: number;
  tarjeta: number;
  transferencia: number;
  vales: number;
  total: number;
};

type ComparadoRow = {
  sucursal: string;
  interno: InternoRow | null;
  externo: PreviewRow | null;
  diffEfectivo: number;
  diffTarjeta: number;
  diffTransferencia: number;
  diffVales: number;
  diffTotal: number;
  estado: string;
};

function money(n: number) {
  return (Number(n) || 0).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
  });
}

function toInputDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeText(value: any) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function toNumber(value: any) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const txt = String(value ?? "")
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .replace(/\s/g, "")
    .trim();

  const n = Number(txt);
  return Number.isFinite(n) ? n : 0;
}

function extractDateYMD(value: any) {
  const raw = String(value ?? "").trim();

  const dmy = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;

  const ymd = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;

  return "";
}

function isDateToken(value: string) {
  return /(\d{2})\/(\d{2})\/(\d{4})/.test(value) || /(\d{4})-(\d{2})-(\d{2})/.test(value);
}

function isTurnoToken(value: string) {
  const v = normalizeText(value);
  return v === "M" || v === "N" || v === "V";
}

function isStatusToken(value: string) {
  const v = normalizeText(value);
  return v.includes("CERRADA") || v.includes("ABIERTA");
}

function isNumericLike(value: string) {
  const v = String(value ?? "").trim();
  if (!v) return false;
  return /^-?\$?[\d,\s]+(\.\d+)?$/.test(v);
}

function mapPcToSucursal(pc: string) {
  const key = normalizeText(pc);

  if (
    key.startsWith("SUCMEDICA") ||
    key.startsWith("SUCMEDICATOMA") ||
    key === "MCLAB" ||
    key === "SUPERVISIONMC"
  ) {
    return "M-MEDICA CAMPESTRE";
  }

  if (key.startsWith("SUCPUNTAESTE")) return "P-PUNTA DEL ESTE";
  if (key === "PQMDRVT1") return "DRIVE";
  if (key === "CENTRO") return "CENTRO";
  if (key === "CMQ") return "CMQ";
  if (key === "SFR") return "SAN FCO";
  if (key === "SILAO") return "SILAO";
  if (key === "IRAPUATO") return "IRAPUATO";
  if (key === "PONCIANO") return "PONCIANO";
  if (key === "EPCON") return "EPCON";
  if (key === "SUCURSALALUD") return "ALUD";
  if (key.startsWith("SUCARBIDE")) return "ARBIDE";
  if (key.startsWith("SUCAZTECA")) return "AZTECA";
  if (key.startsWith("SUCBRISAS")) return "BRISAS";
  if (key.startsWith("SUCESCOBEDO")) return "ESCOBEDO";
  if (key.startsWith("SUCHEROES")) return "HEROES DE LEON";
  if (key.startsWith("SUCJUAREZ")) return "JUAREZ";
  if (key.startsWith("SUCMAYORAZGO")) return "MAYORAZGO";
  if (key.startsWith("SUCROMITA")) return "ROMITA";
  if (key.startsWith("SUCSANTAFE")) return "SANTA FE";
  if (key.startsWith("SUCTORREII")) return "TORRE DOS";

  if (key.startsWith("SUCSALUD") || key === "ATNCLIENTE1") {
    return "SALUD OCUPACIONAL";
  }

  if (key === "SUCURSALLAGOS") return "LAGOS";
  if (key === "TOMASDOMICILIO") return "TOMA A DOM";
  if (key === "SUCELCARMEN") return "EL CARMEN";

  if (
    key === "ASISTENTE" ||
    key === "AUXADMINCOM" ||
    key === "AUXCOMERCIAL" ||
    key === "COORDSUC1" ||
    key === "DIRADMONPQM" ||
    key === "EJECUTIVOMEDICOS" ||
    key === "INGRESOS" ||
    key === "NEGOCIOS" ||
    key === "PROMOTORMEDICOS" ||
    key === "SISTEMAS"
  ) {
    return `OTROS (${pc})`;
  }

  return `SIN MAPEO (${pc})`;
}

function detectDelimiter(text: string) {
  const firstLines = text.split(/\r?\n/).slice(0, 10).join("\n");
  const commas = (firstLines.match(/,/g) || []).length;
  const semicolons = (firstLines.match(/;/g) || []).length;
  const tabs = (firstLines.match(/\t/g) || []).length;

  if (tabs > semicolons && tabs > commas) return "\t";
  return semicolons > commas ? ";" : ",";
}

function parseCsvLine(line: string, delimiter: string) {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current);
  return result.map((s) => s.trim());
}

function parseReporteEspecial(text: string): PreviewRow[] {
  const clean = text.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(clean);
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);

  const agrupado = new Map<string, PreviewRow>();

  for (const line of lines) {
    const cols = parseCsvLine(line, delimiter);
    if (cols.length < 10) continue;

    const userIdx = cols.findIndex((c) => normalizeText(c).startsWith("USUARIO:"));
    if (userIdx === -1) continue;

    const afterUser = cols.slice(userIdx + 1).filter((c) => String(c ?? "").trim() !== "");
    if (afterUser.length < 6) continue;

    const dateIndices = afterUser
      .map((c, idx) => ({ c, idx }))
      .filter((x) => isDateToken(x.c))
      .map((x) => x.idx);

    if (dateIndices.length === 0) continue;

    const fecha =
      extractDateYMD(afterUser[dateIndices[1]]) ||
      extractDateYMD(afterUser[dateIndices[0]]);

    if (!fecha) continue;

    const searchStart = (dateIndices[1] ?? dateIndices[0]) + 1;

    let pc = "";
    let statusIdx = -1;

    for (let i = searchStart; i < afterUser.length; i++) {
      const v = String(afterUser[i] ?? "").trim();
      if (!v) continue;
      if (isDateToken(v)) continue;
      if (isTurnoToken(v)) continue;
      if (isStatusToken(v)) {
        statusIdx = i;
        continue;
      }
      if (!isNumericLike(v)) {
        pc = v;
        break;
      }
    }

    if (!pc) continue;

    if (statusIdx === -1) {
      statusIdx = afterUser.findIndex((v, idx) => idx > searchStart && isStatusToken(v));
    }

    const numericPart = afterUser
      .slice(statusIdx >= 0 ? statusIdx + 1 : searchStart + 1)
      .filter((v) => isNumericLike(v))
      .map((v) => toNumber(v));

    if (numericPart.length < 7) continue;

    const efectivo = numericPart[1] ?? 0;
    const credito = numericPart[2] ?? 0;
    const debito = numericPart[3] ?? 0;
    const transferencia = numericPart[5] ?? 0;
    const totalDia = numericPart[6] ?? 0;
    const cupones = numericPart[7] ?? 0;

    const tarjeta = credito + debito;
    const total = totalDia + cupones;
    const sucursalMapeada = mapPcToSucursal(pc);

    const key = `${fecha}__${sucursalMapeada}`;

    if (!agrupado.has(key)) {
      agrupado.set(key, {
        fecha,
        pc,
        sucursalMapeada,
        efectivo: 0,
        tarjeta: 0,
        transferencia: 0,
        vales: 0,
        total: 0,
        estado: sucursalMapeada.startsWith("SIN MAPEO")
          ? "PC sin mapear"
          : sucursalMapeada.startsWith("OTROS (")
          ? "Usuario / equipo alterno"
          : "Leído correctamente",
      });
    }

    const item = agrupado.get(key)!;
    item.efectivo += efectivo;
    item.tarjeta += tarjeta;
    item.transferencia += transferencia;
    item.vales += cupones;
    item.total += total;

    if (!item.pc.includes(pc)) item.pc = `${item.pc}, ${pc}`;
    if (sucursalMapeada.startsWith("SIN MAPEO")) item.estado = "PC sin mapear";
  }

  return Array.from(agrupado.values()).sort((a, b) => {
    if (a.fecha === b.fecha) return a.sucursalMapeada.localeCompare(b.sucursalMapeada);
    return a.fecha.localeCompare(b.fecha);
  });
}

function agruparInternos(cierres: CierreDia[], fecha: string): InternoRow[] {
  const filtrados = cierres.filter((c) => c.fecha === fecha);
  const agrupado = new Map<string, InternoRow>();

  for (const c of filtrados) {
    const sucursal = String(c.sucursalId || "").trim();
    if (!sucursal) continue;

    if (!agrupado.has(sucursal)) {
      agrupado.set(sucursal, {
        fecha,
        sucursal,
        efectivo: 0,
        tarjeta: 0,
        transferencia: 0,
        vales: 0,
        total: 0,
      });
    }

    const item = agrupado.get(sucursal)!;
    item.efectivo += Number(c.totalesPorMetodo?.efectivo || 0);
    item.tarjeta += Number(c.totalesPorMetodo?.tarjeta || 0);
    item.transferencia += Number(c.totalesPorMetodo?.transferencia || 0);
    item.vales += Number(c.totalesPorMetodo?.vales || 0);
    item.total += Number(c.totalEsperado || 0);
  }

  return Array.from(agrupado.values()).sort((a, b) =>
    a.sucursal.localeCompare(b.sucursal)
  );
}

function buildComparacion(internos: InternoRow[], externos: PreviewRow[]): ComparadoRow[] {
  const mapInterno = new Map(internos.map((r) => [normalizeText(r.sucursal), r]));
  const mapExterno = new Map(externos.map((r) => [normalizeText(r.sucursalMapeada), r]));
  const sucursales = Array.from(new Set([...mapInterno.keys(), ...mapExterno.keys()])).sort();

  return sucursales.map((key) => {
    const interno = mapInterno.get(key) || null;
    const externo = mapExterno.get(key) || null;

    const diffEfectivo = Number((interno?.efectivo || 0) - (externo?.efectivo || 0));
    const diffTarjeta = Number((interno?.tarjeta || 0) - (externo?.tarjeta || 0));
    const diffTransferencia = Number((interno?.transferencia || 0) - (externo?.transferencia || 0));
    const diffVales = Number((interno?.vales || 0) - (externo?.vales || 0));
    const diffTotal = Number((interno?.total || 0) - (externo?.total || 0));

    let estado = "Cuadra";
    if (interno && !externo) estado = "Solo en app";
    else if (!interno && externo) estado = "Solo en externo";
    else if (diffEfectivo !== 0 || diffTarjeta !== 0 || diffTransferencia !== 0 || diffVales !== 0 || diffTotal !== 0) {
      estado = "Con diferencia";
    }

    return {
      sucursal: interno?.sucursal || externo?.sucursalMapeada || key,
      interno,
      externo,
      diffEfectivo,
      diffTarjeta,
      diffTransferencia,
      diffVales,
      diffTotal,
      estado,
    };
  });
}

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

function exportarConciliacion(comparacion: ComparadoRow[], fecha: string) {
  const rows = comparacion
    .map(
      (r) => `
      <tr>
        <td>${r.sucursal}</td>
        <td>${r.estado}</td>
        <td style="text-align:right;">${money(r.interno?.efectivo || 0)}</td>
        <td style="text-align:right;">${money(r.externo?.efectivo || 0)}</td>
        <td style="text-align:right;">${money(r.diffEfectivo)}</td>
        <td style="text-align:right;">${money(r.interno?.tarjeta || 0)}</td>
        <td style="text-align:right;">${money(r.externo?.tarjeta || 0)}</td>
        <td style="text-align:right;">${money(r.diffTarjeta)}</td>
        <td style="text-align:right;">${money(r.interno?.transferencia || 0)}</td>
        <td style="text-align:right;">${money(r.externo?.transferencia || 0)}</td>
        <td style="text-align:right;">${money(r.diffTransferencia)}</td>
        <td style="text-align:right;">${money(r.interno?.vales || 0)}</td>
        <td style="text-align:right;">${money(r.externo?.vales || 0)}</td>
        <td style="text-align:right;">${money(r.diffVales)}</td>
        <td style="text-align:right;font-weight:bold;">${money(r.interno?.total || 0)}</td>
        <td style="text-align:right;font-weight:bold;">${money(r.externo?.total || 0)}</td>
        <td style="text-align:right;font-weight:bold;">${money(r.diffTotal)}</td>
      </tr>`
    )
    .join("");

  const html = `
  <html>
    <body>
      <table border="1" style="border-collapse:collapse;font-family:Arial;">
        <tr>
          <th colspan="17" style="background:#111827;color:white;font-size:18px;padding:10px;">
            CONCILIACIÓN EXTERNA AJASSO
          </th>
        </tr>
        <tr>
          <td colspan="17"><b>Fecha:</b> ${fecha}</td>
        </tr>
        <tr style="background:#e5e7eb;font-weight:bold;">
          <td>Sucursal</td>
          <td>Estado</td>
          <td>Int. efectivo</td>
          <td>Ext. efectivo</td>
          <td>Diff. efectivo</td>
          <td>Int. tarjeta</td>
          <td>Ext. tarjeta</td>
          <td>Diff. tarjeta</td>
          <td>Int. transferencia</td>
          <td>Ext. transferencia</td>
          <td>Diff. transferencia</td>
          <td>Int. vales</td>
          <td>Ext. vales</td>
          <td>Diff. vales</td>
          <td>Int. total</td>
          <td>Ext. total</td>
          <td>Diff. total</td>
        </tr>
        ${rows}
      </table>
    </body>
  </html>`;

  descargarExcelHTML(`conciliacion_externa_${fecha}.xls`, html);
}

export default function AdminConciliacionPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [session, setSession] = useState<Session>({});
  const [fecha, setFecha] = useState<string>(() => toInputDate(new Date()));
  const [archivo, setArchivo] = useState<File | null>(null);
  const [archivoNombre, setArchivoNombre] = useState("");
  const [mensaje, setMensaje] = useState("Sube el reporte en CSV y da clic en Conciliar archivo.");
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [cierresInternos, setCierresInternos] = useState<CierreDia[]>([]);
  const [soloDiferencias, setSoloDiferencias] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem("session");

    if (!raw) {
      router.replace("/acceso");
      return;
    }

    const s = JSON.parse(raw);

    if (s?.role !== "ADMIN") {
      router.replace("/sucursal");
      return;
    }

    setSession(s);
    setChecking(false);
    setCierresInternos(getCierres());
  }, [router]);

  function onPickArchivo(file: File | null) {
    setArchivo(file);
    setArchivoNombre(file?.name || "");
    setPreviewRows([]);

    if (file) setMensaje(`Archivo listo: ${file.name}`);
    else setMensaje("Sube el reporte en CSV y da clic en Conciliar archivo.");
  }

  async function conciliarArchivo() {
    if (!archivo) {
      setMensaje("Primero selecciona un archivo.");
      return;
    }

    try {
      setLoading(true);
      setMensaje("Leyendo archivo...");

      const text = await archivo.text();
      const parsed = parseReporteEspecial(text);

      if (parsed.length === 0) {
        setPreviewRows([]);
        setMensaje("Se leyó el archivo, pero no se detectaron filas válidas.");
        return;
      }

      const fechasEncontradas = Array.from(new Set(parsed.map((r) => r.fecha).filter(Boolean))).sort();
      const filtrados = fecha ? parsed.filter((r) => r.fecha === fecha) : parsed;
      setPreviewRows(filtrados);

      if (filtrados.length === 0) {
        setMensaje(`Se leyó el archivo, pero no se encontraron movimientos para la fecha seleccionada. Fechas detectadas: ${fechasEncontradas.join(", ")}`);
      } else {
        const sinMapeo = filtrados.filter((r) => r.sucursalMapeada.startsWith("SIN MAPEO")).length;
        setMensaje(
          sinMapeo > 0
            ? `Archivo leído. Se encontraron ${filtrados.length} registros agrupados. Hay ${sinMapeo} registros con PC sin mapear. Fechas detectadas: ${fechasEncontradas.join(", ")}`
            : `Archivo leído correctamente. Se encontraron ${filtrados.length} registros agrupados. Fechas detectadas: ${fechasEncontradas.join(", ")}`
        );
      }
    } catch (e: any) {
      console.error(e);
      setPreviewRows([]);
      setMensaje(e?.message || "No se pudo leer el archivo.");
    } finally {
      setLoading(false);
    }
  }

  function limpiar() {
    setArchivo(null);
    setArchivoNombre("");
    setPreviewRows([]);
    setMensaje("Sube el reporte en CSV y da clic en Conciliar archivo.");
  }

  const externosDelDia = useMemo(() => {
    return previewRows.filter(
      (r) =>
        !r.sucursalMapeada.startsWith("OTROS (") &&
        !r.sucursalMapeada.startsWith("SIN MAPEO")
    );
  }, [previewRows]);

  const internosAgrupados = useMemo(() => {
    return agruparInternos(cierresInternos, fecha);
  }, [cierresInternos, fecha]);

  const comparacion = useMemo(() => {
    return buildComparacion(internosAgrupados, externosDelDia);
  }, [internosAgrupados, externosDelDia]);

  const comparacionVisible = useMemo(() => {
    return comparacion.filter((r) => !soloDiferencias || r.estado !== "Cuadra");
  }, [comparacion, soloDiferencias]);

  const resumenExterno = useMemo(() => {
    return externosDelDia.reduce(
      (acc, row) => {
        acc.efectivo += row.efectivo;
        acc.tarjeta += row.tarjeta;
        acc.transferencia += row.transferencia;
        acc.vales += row.vales;
        acc.total += row.total;
        return acc;
      },
      { efectivo: 0, tarjeta: 0, transferencia: 0, vales: 0, total: 0 }
    );
  }, [externosDelDia]);

  const resumenInterno = useMemo(() => {
    return internosAgrupados.reduce(
      (acc, row) => {
        acc.efectivo += row.efectivo;
        acc.tarjeta += row.tarjeta;
        acc.transferencia += row.transferencia;
        acc.vales += row.vales;
        acc.total += row.total;
        return acc;
      },
      { efectivo: 0, tarjeta: 0, transferencia: 0, vales: 0, total: 0 }
    );
  }, [internosAgrupados]);

  const resumenDiff = useMemo(() => {
    return {
      efectivo: resumenInterno.efectivo - resumenExterno.efectivo,
      tarjeta: resumenInterno.tarjeta - resumenExterno.tarjeta,
      transferencia: resumenInterno.transferencia - resumenExterno.transferencia,
      vales: resumenInterno.vales - resumenExterno.vales,
      total: resumenInterno.total - resumenExterno.total,
    };
  }, [resumenInterno, resumenExterno]);

  const cuadra = Math.abs(resumenDiff.total) < 0.01;

  if (checking) return null;

  return (
    <main style={{ padding: 24, fontFamily: "Arial", background: "#f6f7fb", minHeight: "100vh" }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={() => router.push("/admin")} style={btn}>← Volver al panel</button>
        <button onClick={() => router.push("/admin/cierres")} style={btn}>Ir a cierres</button>
      </div>

      <h1 style={{ margin: 0 }}>Conciliación diaria</h1>
      <p style={{ marginTop: 6, color: "#666" }}>Sesión: {session.username || "AJASSO"}</p>

      <section style={{ ...card, marginTop: 18 }}>
        <div style={{ fontWeight: 900, marginBottom: 14 }}>Datos de conciliación</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(260px, 1fr))", gap: 14 }}>
          <div>
            <label style={label}>Fecha a conciliar</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={input} />
          </div>

          <div>
            <label style={label}>Reporte externo (CSV)</label>
            <input type="file" accept=".csv,text/csv" onChange={(e) => onPickArchivo(e.target.files?.[0] || null)} style={input} />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <b>Archivo seleccionado:</b> {archivoNombre || "—"}
        </div>

        <div style={{ marginTop: 14, padding: 12, borderRadius: 12, border: "1px solid #dbeafe", background: "#eff6ff", color: "#1e3a8a", whiteSpace: "pre-wrap" }}>
          {mensaje}
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button style={btn} disabled={!archivo || loading} onClick={conciliarArchivo}>
            {loading ? "Leyendo..." : "Conciliar archivo"}
          </button>

          <button onClick={limpiar} style={btn}>Limpiar</button>

          <button onClick={() => setSoloDiferencias(!soloDiferencias)} style={btn}>
            {soloDiferencias ? "Ver todo" : "Solo diferencias"}
          </button>

          <button onClick={() => exportarConciliacion(comparacion, fecha)} style={btn}>
            Exportar conciliación
          </button>
        </div>
      </section>

      <section style={{ ...card, marginTop: 18 }}>
        <div style={{ fontWeight: 900, marginBottom: 12 }}>Resumen general de conciliación</div>

        <div style={{
          marginBottom: 14,
          padding: 12,
          borderRadius: 12,
          background: cuadra ? "#ecfdf5" : "#fef2f2",
          border: cuadra ? "1px solid #bbf7d0" : "1px solid #fecaca",
          fontWeight: 900,
          color: cuadra ? "#166534" : "#b91c1c",
        }}>
          {cuadra ? "✅ Conciliación correcta (cuadra perfectamente)" : "⚠️ Hay diferencias en la conciliación"}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(220px, 1fr))", gap: 12, marginBottom: 16 }}>
          <div style={miniCard}>
            <div style={muted}>Total interno app</div>
            <div style={bigMoney}>{money(resumenInterno.total)}</div>
          </div>

          <div style={miniCard}>
            <div style={muted}>Total externo sistema</div>
            <div style={bigMoney}>{money(resumenExterno.total)}</div>
          </div>

          <div style={miniCard}>
            <div style={muted}>Diferencia total</div>
            <div style={{ ...bigMoney, color: cuadra ? "#166534" : "#b91c1c" }}>
              {money(resumenDiff.total)}
            </div>
          </div>
        </div>
      </section>

      <section style={{ ...card, marginTop: 18 }}>
        <div style={{ fontWeight: 900, marginBottom: 12 }}>Conciliación por sucursal</div>

        {comparacionVisible.length === 0 ? (
          <div style={{ color: "#666" }}>Aún no hay comparación disponible.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1700 }}>
              <thead>
                <tr>
                  <th style={th}>Sucursal</th>
                  <th style={th}>Estado</th>
                  <th style={th}>Int. efectivo</th>
                  <th style={th}>Ext. efectivo</th>
                  <th style={th}>Diff. efectivo</th>
                  <th style={th}>Int. tarjeta</th>
                  <th style={th}>Ext. tarjeta</th>
                  <th style={th}>Diff. tarjeta</th>
                  <th style={th}>Int. transfer.</th>
                  <th style={th}>Ext. transfer.</th>
                  <th style={th}>Diff. transfer.</th>
                  <th style={th}>Int. vales</th>
                  <th style={th}>Ext. vales</th>
                  <th style={th}>Diff. vales</th>
                  <th style={th}>Int. total</th>
                  <th style={th}>Ext. total</th>
                  <th style={th}>Diff. total</th>
                </tr>
              </thead>
              <tbody>
                {comparacionVisible.map((row) => (
                  <tr key={row.sucursal}>
                    <td style={td}>{row.sucursal}</td>
                    <td style={{
                      ...td,
                      fontWeight: 800,
                      color: row.estado === "Cuadra" ? "#166534" : row.estado === "Con diferencia" ? "#b91c1c" : "#92400e",
                    }}>
                      {row.estado}
                    </td>

                    <td style={tdMoney}>{money(row.interno?.efectivo || 0)}</td>
                    <td style={tdMoney}>{money(row.externo?.efectivo || 0)}</td>
                    <td style={diffCell(row.diffEfectivo)}>{money(row.diffEfectivo)}</td>

                    <td style={tdMoney}>{money(row.interno?.tarjeta || 0)}</td>
                    <td style={tdMoney}>{money(row.externo?.tarjeta || 0)}</td>
                    <td style={diffCell(row.diffTarjeta)}>{money(row.diffTarjeta)}</td>

                    <td style={tdMoney}>{money(row.interno?.transferencia || 0)}</td>
                    <td style={tdMoney}>{money(row.externo?.transferencia || 0)}</td>
                    <td style={diffCell(row.diffTransferencia)}>{money(row.diffTransferencia)}</td>

                    <td style={tdMoney}>{money(row.interno?.vales || 0)}</td>
                    <td style={tdMoney}>{money(row.externo?.vales || 0)}</td>
                    <td style={diffCell(row.diffVales)}>{money(row.diffVales)}</td>

                    <td style={tdMoneyStrong}>{money(row.interno?.total || 0)}</td>
                    <td style={tdMoneyStrong}>{money(row.externo?.total || 0)}</td>
                    <td style={diffCell(row.diffTotal, true)}>{money(row.diffTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ ...card, marginTop: 18 }}>
        <div style={{ fontWeight: 900, marginBottom: 12 }}>Vista previa del reporte externo</div>

        {previewRows.length === 0 ? (
          <div style={{ color: "#666" }}>Aún no hay datos cargados del archivo.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
              <thead>
                <tr>
                  <th style={th}>Fecha</th>
                  <th style={th}>PC</th>
                  <th style={th}>Sucursal mapeada</th>
                  <th style={th}>Efectivo</th>
                  <th style={th}>Tarjeta</th>
                  <th style={th}>Transferencia</th>
                  <th style={th}>Vales</th>
                  <th style={th}>Total externo</th>
                  <th style={th}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, idx) => (
                  <tr key={`${row.pc}-${row.fecha}-${idx}`}>
                    <td style={td}>{row.fecha}</td>
                    <td style={td}>{row.pc}</td>
                    <td style={td}>{row.sucursalMapeada}</td>
                    <td style={tdMoney}>{money(row.efectivo)}</td>
                    <td style={tdMoney}>{money(row.tarjeta)}</td>
                    <td style={tdMoney}>{money(row.transferencia)}</td>
                    <td style={tdMoney}>{money(row.vales)}</td>
                    <td style={tdMoney}>{money(row.total)}</td>
                    <td style={{
                      ...td,
                      color: row.estado.includes("sin mapear")
                        ? "#b91c1c"
                        : row.estado.includes("alterno")
                        ? "#92400e"
                        : "#166534",
                      fontWeight: 700,
                    }}>
                      {row.estado}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function diffCell(value: number, strong = false): React.CSSProperties {
  return {
    padding: 10,
    borderBottom: "1px solid #eee",
    fontSize: strong ? 14 : 13,
    textAlign: "right",
    whiteSpace: "nowrap",
    verticalAlign: "top",
    fontWeight: strong ? 900 : 700,
    color: Math.abs(value) < 0.01 ? "#166534" : "#b91c1c",
  };
}

const btn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "white",
  cursor: "pointer",
  fontWeight: 700,
};

const card: React.CSSProperties = {
  background: "white",
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 14,
};

const miniCard: React.CSSProperties = {
  background: "#fafafa",
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 12,
};

const label: React.CSSProperties = {
  display: "block",
  marginBottom: 6,
  fontSize: 13,
  fontWeight: 700,
};

const input: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "white",
};

const muted: React.CSSProperties = {
  fontSize: 12,
  color: "#666",
  marginBottom: 6,
};

const bigMoney: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 900,
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: 10,
  borderBottom: "1px solid #ddd",
  background: "#f8fafc",
  fontSize: 13,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: 10,
  borderBottom: "1px solid #eee",
  fontSize: 13,
  verticalAlign: "top",
};

const tdMoney: React.CSSProperties = {
  padding: 10,
  borderBottom: "1px solid #eee",
  fontSize: 13,
  textAlign: "right",
  whiteSpace: "nowrap",
  verticalAlign: "top",
};

const tdMoneyStrong: React.CSSProperties = {
  padding: 10,
  borderBottom: "1px solid #eee",
  fontSize: 14,
  textAlign: "right",
  whiteSpace: "nowrap",
  verticalAlign: "top",
  fontWeight: 900,
};