"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { DenominacionesMXN, MetodosPago, Corte } from "@/lib/types";
import {
  crearCierre,
  getCortesPendientes,
  getSaldoSobranteSucursal,
  totalMetodos,
  totalDenominacionesMXN,
} from "@/lib/storage";
import { parseTotalesDesdePdfText } from "@/lib/corteParser";

declare global {
  interface Window {
    pdfjsLib?: any;
  }
}

const PDFJS_VERSION = "3.11.174";
const PDFJS_SRC = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
const PDFJS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;

function money(n: number) {
  return (Number(n) || 0).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
  });
}

type TotalesPDF = {
  efectivo: number;
  tarjeta: number;
  transferencia: number;
  vales: number;
  otros: number;
  total?: number;
};

type Session = {
  username?: string;
  role?: string;
  sucursalId?: string;
};

async function ensurePdfJs() {
  if (typeof window === "undefined") return;
  if (window.pdfjsLib) return;

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(
      `script[data-pdfjs="1"]`
    ) as HTMLScriptElement | null;

    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("No se pudo cargar pdf.js"))
      );
      return;
    }

    const s = document.createElement("script");
    s.src = PDFJS_SRC;
    s.async = true;
    s.dataset.pdfjs = "1";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("No se pudo cargar pdf.js"));
    document.head.appendChild(s);
  });

  if (!window.pdfjsLib) {
    throw new Error("pdf.js no quedó disponible");
  }

  if (window.pdfjsLib?.GlobalWorkerOptions) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  }
}

async function pdfFileToText(file: File): Promise<string> {
  await ensurePdfJs();

  const pdfjsLib = window.pdfjsLib;
  const ab = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: ab }).promise;

  const pagesText: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    const items = (content.items || [])
      .map((it: any) => {
        const str = (it?.str || "").trim();
        const x = it?.transform?.[4] ?? 0;
        const y = it?.transform?.[5] ?? 0;
        return { str, x, y };
      })
      .filter((it: any) => it.str);

    const linesMap = new Map<number, { str: string; x: number }[]>();

    for (const item of items) {
      const yKey = Math.round(item.y);
      if (!linesMap.has(yKey)) linesMap.set(yKey, []);
      linesMap.get(yKey)!.push({ str: item.str, x: item.x });
    }

    const sortedY = Array.from(linesMap.keys()).sort((a, b) => b - a);
    const lines: string[] = [];

    for (const y of sortedY) {
      const row = linesMap.get(y)!;
      row.sort((a, b) => a.x - b.x);

      const line = row
        .map((r) => r.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (line) lines.push(line);
    }

    pagesText.push(lines.join("\n"));
  }

  return pagesText.join("\n\n").trim();
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo convertir el archivo"));
    reader.readAsDataURL(file);
  });
}

export default function CierreSucursalPage() {
  const router = useRouter();

  const [session, setSession] = useState<Session>({});
  const [sucursal, setSucursal] = useState<string>("");

  const [loadingPdf, setLoadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [pdfName, setPdfName] = useState("");
  const [saldoSobranteAnterior, setSaldoSobranteAnterior] = useState(0);
  const [guardando, setGuardando] = useState(false);

  const [voucherFile, setVoucherFile] = useState<File | null>(null);
  const [voucherName, setVoucherName] = useState("");
  const [voucherPreview, setVoucherPreview] = useState("");

  const [fechaYMD, setFechaYMD] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  });

  const [cortesPendientes, setCortesPendientes] = useState<Corte[]>([]);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfText, setPdfText] = useState("");

  const [totalesPdf, setTotalesPdf] = useState<TotalesPDF>({
    efectivo: 0,
    tarjeta: 0,
    transferencia: 0,
    vales: 0,
    otros: 0,
    total: 0,
  });

  const [bolsaFinal, setBolsaFinal] = useState<number>(0);
  const [capturarDenoms, setCapturarDenoms] = useState<boolean>(false);

  const [denoms, setDenoms] = useState<DenominacionesMXN>({
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
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem("session");

      if (!raw) {
        router.replace("/acceso");
        return;
      }

      const parsed = JSON.parse(raw) as Session;

      if (parsed?.role !== "SUCURSAL") {
        router.replace("/acceso");
        return;
      }

      if (!parsed?.sucursalId) {
        router.replace("/acceso");
        return;
      }

      setSession(parsed);
      setSucursal(parsed.sucursalId);
    } catch {
      router.replace("/acceso");
    }
  }, [router]);

  function recargar() {
    try {
      if (!sucursal) return;

      setPdfError("");
      const pendientes = getCortesPendientes(sucursal, fechaYMD);
      setCortesPendientes(pendientes || []);
      setSaldoSobranteAnterior(getSaldoSobranteSucursal(sucursal));
    } catch (e: any) {
      console.error(e);
      setPdfError(e?.message || "Error al recargar");
    }
  }

  useEffect(() => {
    recargar();
  }, [sucursal, fechaYMD]);

  async function onPickPdf(file: File | null) {
    setPdfError("");
    if (!file) return;

    setPdfName(file.name);
    setPdfFile(file);
    setLoadingPdf(true);

    try {
      const text = await pdfFileToText(file);
      localStorage.setItem("ultimoPdfTexto", text);
      setPdfText(text);

      const parsed = parseTotalesDesdePdfText(text);

      setTotalesPdf({
        efectivo: parsed.efectivo || 0,
        tarjeta: parsed.tarjeta || 0,
        transferencia: parsed.transferencia || 0,
        vales: parsed.vales || 0,
        otros: parsed.otros || 0,
        total:
          parsed.total ||
          (parsed.efectivo || 0) +
            (parsed.tarjeta || 0) +
            (parsed.transferencia || 0) +
            (parsed.vales || 0) +
            (parsed.otros || 0),
      });
    } catch (e: any) {
      console.error(e);
      setPdfError(e?.message || String(e));
      setPdfText("");
      setTotalesPdf({
        efectivo: 0,
        tarjeta: 0,
        transferencia: 0,
        vales: 0,
        otros: 0,
        total: 0,
      });
    } finally {
      setLoadingPdf(false);
    }
  }

  async function onPickVoucher(file: File | null) {
    if (!file) {
      setVoucherFile(null);
      setVoucherName("");
      setVoucherPreview("");
      return;
    }

    setVoucherFile(file);
    setVoucherName(file.name);

    try {
      const dataUrl = await fileToBase64(file);
      setVoucherPreview(dataUrl);
    } catch (e) {
      console.error(e);
      setVoucherPreview("");
    }
  }

  const totalDenoms = useMemo(() => totalDenominacionesMXN(denoms), [denoms]);

  const totalEsperado =
    totalesPdf.total ||
    totalMetodos({
      efectivo: totalesPdf.efectivo,
      tarjeta: totalesPdf.tarjeta,
      transferencia: totalesPdf.transferencia,
      vales: totalesPdf.vales,
      otros: totalesPdf.otros,
    } as MetodosPago);

  const efectivoEsperado = Number(totalesPdf.efectivo || 0);

  const efectivoNetoAEnviar = Math.max(
    0,
    efectivoEsperado - saldoSobranteAnterior
  );

  const sobranteCorte = Math.max(
    0,
    Number(bolsaFinal || 0) - efectivoNetoAEnviar
  );

  const saldoSobranteProyectado = Math.max(
    0,
    saldoSobranteAnterior + Number(bolsaFinal || 0) - efectivoEsperado
  );

  const diferencia = Number(bolsaFinal || 0) - efectivoNetoAEnviar;

  function guardarCierre() {
    const run = async () => {
      try {
        if (!sucursal) {
          throw new Error("No hay sucursal asignada a este usuario");
        }

        if (!pdfFile) {
          throw new Error("Debes subir el PDF antes de guardar");
        }

        if (!session?.username) {
          throw new Error("No hay sesión activa");
        }

        const pdfDataUrl = await fileToBase64(pdfFile);

        let voucherDataUrl: string | undefined;
        if (voucherFile) {
          voucherDataUrl = await fileToBase64(voucherFile);
        }

        if ((totalesPdf.tarjeta || 0) > 0 && !voucherFile) {
          throw new Error(
            "Este corte tiene tarjeta. Debes subir la imagen del voucher antes de guardar."
          );
        }

        setGuardando(true);

        await crearCierre({
          sucursalId: sucursal,
          fecha: fechaYMD,
          bolsaFinal: Number(bolsaFinal || 0),
          denominaciones: capturarDenoms ? denoms : undefined,
          observaciones: pdfName ? `PDF cargado: ${pdfName}` : undefined,
          createdBy: session.username,
          pdfName: pdfFile.name,
          pdfDataUrl,
          totalesPdf: {
            efectivo: Number(totalesPdf.efectivo || 0),
            tarjeta: Number(totalesPdf.tarjeta || 0),
            transferencia: Number(totalesPdf.transferencia || 0),
            vales: Number(totalesPdf.vales || 0),
            otros: Number(totalesPdf.otros || 0),
          },
          voucherName: voucherFile?.name,
          voucherDataUrl,
          saldoSobranteAnterior,
        });

        alert("Cierre guardado ✅");

        setPdfFile(null);
        setPdfName("");
        setPdfText("");
        setVoucherFile(null);
        setVoucherName("");
        setVoucherPreview("");
        setTotalesPdf({
          efectivo: 0,
          tarjeta: 0,
          transferencia: 0,
          vales: 0,
          otros: 0,
          total: 0,
        });
        setBolsaFinal(0);
        setCapturarDenoms(false);
        setDenoms({
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
        });

        recargar();
        router.push("/sucursal");
      } catch (e: any) {
        console.error(e);
        alert(e?.message || "No se pudo guardar el cierre");
      } finally {
        setGuardando(false);
      }
    };

    run();
  }

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <button onClick={() => router.back()} style={{ marginBottom: 16 }}>
        ← Volver
      </button>

      <h1 style={{ fontSize: 42, margin: "0 0 18px 0" }}>Cierre del día</h1>

      <section style={cardStyle}>
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}
        >
          <div>
            <label>
              <b>Sucursal asignada</b>
            </label>

            <div
              style={{
                ...inputStyle,
                background: "#f3f4f6",
                minHeight: 42,
                display: "flex",
                alignItems: "center",
                fontWeight: 800,
              }}
            >
              {sucursal || "—"}
            </div>
          </div>

          <div>
            <label>
              <b>Fecha</b>
            </label>
            <input
              type="date"
              value={fechaYMD}
              onChange={(e) => setFechaYMD(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>PDF del corte (obligatorio)</h2>

        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickPdf(f);
          }}
        />

        <div style={{ marginTop: 8 }}>
          <b>Archivo:</b> {pdfName || "—"}
        </div>

        {loadingPdf && <div style={{ marginTop: 10 }}>Leyendo PDF…</div>}

        {pdfError ? (
          <div style={errorBox}>
            <b>Error leyendo PDF:</b> {pdfError}
            <div style={{ marginTop: 6, fontSize: 12 }}>
              Tip: en consola puedes ver{" "}
              <code>localStorage.getItem("ultimoPdfTexto")</code>
            </div>
          </div>
        ) : null}

        <button style={{ marginTop: 12 }} onClick={recargar}>
          Actualizar
        </button>
      </section>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Voucher terminal</h2>

        <div style={{ marginBottom: 8, color: "#555" }}>
          {(totalesPdf.tarjeta || 0) > 0
            ? "Este corte tiene tarjeta. Debes subir la imagen del voucher."
            : "Si el corte no trae tarjeta, puedes dejar este campo vacío."}
        </div>

        <input
          type="file"
          accept="image/*"
          onChange={(e) => onPickVoucher(e.target.files?.[0] || null)}
        />

        <div style={{ marginTop: 8 }}>
          <b>Archivo:</b> {voucherName || "—"}
        </div>

        {voucherPreview ? (
          <div style={{ marginTop: 12 }}>
            <img
              src={voucherPreview}
              alt="Vista previa voucher"
              style={{
                maxWidth: "100%",
                maxHeight: 260,
                border: "1px solid #ddd",
                borderRadius: 12,
              }}
            />
          </div>
        ) : null}
      </section>

      <section style={cardStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2 style={{ marginTop: 0 }}>
            Cortes pendientes ({cortesPendientes.length})
          </h2>
          <button onClick={recargar}>Actualizar</button>
        </div>

        {cortesPendientes.length === 0 ? (
          <div>No hay cortes abiertos para esta fecha.</div>
        ) : (
          <ul>
            {cortesPendientes.map((c, idx) => (
              <li key={c.id || idx}>
                {c.id} — {money(c.total || 0)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Totales (del PDF)</h2>

        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}
        >
          <div>
            Efectivo: <b>{money(totalesPdf.efectivo)}</b>
          </div>
          <div>
            Tarjeta: <b>{money(totalesPdf.tarjeta)}</b>
          </div>
          <div>
            Transferencia: <b>{money(totalesPdf.transferencia)}</b>
          </div>
          <div>
            Vales: <b>{money(totalesPdf.vales)}</b>
          </div>
          <div>
            Otros: <b>{money(totalesPdf.otros)}</b>
          </div>
          <div>
            Total esperado: <b>{money(totalEsperado)}</b>
          </div>
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Bolsa final</h2>

        <label>
          <b>Bolsa final (efectivo enviado hoy)</b>
        </label>
        <input
          type="number"
          value={bolsaFinal}
          onChange={(e) => setBolsaFinal(Number(e.target.value || 0))}
          style={{ ...inputStyle, marginTop: 8 }}
        />

        <div
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 14,
          }}
        >
          <div>
            Efectivo esperado del corte: <b>{money(efectivoEsperado)}</b>
          </div>
          <div>
            Saldo sobrante anterior: <b>{money(saldoSobranteAnterior)}</b>
          </div>
          <div>
            Efectivo neto a enviar: <b>{money(efectivoNetoAEnviar)}</b>
          </div>
          <div>
            Sobrante del corte: <b>{money(sobranteCorte)}</b>
          </div>
          <div>
            Saldo sobrante proyectado: <b>{money(saldoSobranteProyectado)}</b>
          </div>
          <div>
            Diferencia vs efectivo neto a enviar:{" "}
            <b style={{ color: diferencia === 0 ? "green" : "crimson" }}>
              {money(diferencia)}
            </b>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={capturarDenoms}
              onChange={(e) => setCapturarDenoms(e.target.checked)}
            />
            <b>Capturar denominaciones</b>
          </label>
        </div>

        {capturarDenoms ? (
          <div
            style={{
              marginTop: 12,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
            }}
          >
            <DenInput
              label="$1000"
              value={denoms.b1000}
              onChange={(v) => setDenoms((p) => ({ ...p, b1000: v }))}
            />
            <DenInput
              label="$500"
              value={denoms.b500}
              onChange={(v) => setDenoms((p) => ({ ...p, b500: v }))}
            />
            <DenInput
              label="$200"
              value={denoms.b200}
              onChange={(v) => setDenoms((p) => ({ ...p, b200: v }))}
            />
            <DenInput
              label="$100"
              value={denoms.b100}
              onChange={(v) => setDenoms((p) => ({ ...p, b100: v }))}
            />
            <DenInput
              label="$50"
              value={denoms.b50}
              onChange={(v) => setDenoms((p) => ({ ...p, b50: v }))}
            />
            <DenInput
              label="$20 billete"
              value={denoms.b20}
              onChange={(v) => setDenoms((p) => ({ ...p, b20: v }))}
            />
            <DenInput
              label="$20 moneda"
              value={denoms.m20}
              onChange={(v) => setDenoms((p) => ({ ...p, m20: v }))}
            />
            <DenInput
              label="$10 moneda"
              value={denoms.m10}
              onChange={(v) => setDenoms((p) => ({ ...p, m10: v }))}
            />
            <DenInput
              label="$5 moneda"
              value={denoms.m5}
              onChange={(v) => setDenoms((p) => ({ ...p, m5: v }))}
            />
            <DenInput
              label="$2 moneda"
              value={denoms.m2}
              onChange={(v) => setDenoms((p) => ({ ...p, m2: v }))}
            />
            <DenInput
              label="$1 moneda"
              value={denoms.m1}
              onChange={(v) => setDenoms((p) => ({ ...p, m1: v }))}
            />
            <DenInput
              label="$0.50 moneda"
              value={denoms.m050}
              onChange={(v) => setDenoms((p) => ({ ...p, m050: v }))}
            />

            <div style={{ gridColumn: "1 / -1", marginTop: 6 }}>
              Total denominaciones: <b>{money(totalDenoms)}</b>
            </div>
          </div>
        ) : null}
      </section>

      <section style={{ marginBottom: 30 }}>
        <button onClick={guardarCierre} disabled={!pdfFile || guardando}>
          {guardando ? "Guardando..." : "Guardar cierre"}
        </button>
        {!pdfFile ? (
          <span style={{ marginLeft: 10, color: "crimson" }}>
            Sube el PDF para poder guardar
          </span>
        ) : null}
      </section>

      {pdfText ? (
        <details>
          <summary>Debug: texto del PDF</summary>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>
            {pdfText.slice(-2000)}
          </pre>
        </details>
      ) : null}
    </main>
  );
}

function DenInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label>
        <b>{label}</b>
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value || 0))}
        style={{ ...inputStyle, marginTop: 6 }}
      />
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #eee",
  borderRadius: 16,
  padding: 16,
  marginBottom: 16,
  background: "white",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 10,
  border: "1px solid #ddd",
};

const errorBox: React.CSSProperties = {
  marginTop: 12,
  background: "#ffe5e5",
  border: "1px solid #ffb3b3",
  padding: 12,
  borderRadius: 12,
};