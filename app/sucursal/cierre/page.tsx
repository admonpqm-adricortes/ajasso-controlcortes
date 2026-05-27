"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  DenominacionesMXN,
  MetodosPago,
  Corte,
  TurnoCierre,
} from "@/lib/types";
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

const SUCURSAL_DOBLE_CIERRE = "M-MEDICA CAMPESTRE";

function requiereTurno(sucursalId?: string) {
  return sucursalId === SUCURSAL_DOBLE_CIERRE;
}

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

type VoucherPreview = {
  name: string;
  dataUrl: string;
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

  if (!window.pdfjsLib) throw new Error("pdf.js no quedó disponible");

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

function sumarCortes(cortes: Corte[]): MetodosPago {
  return cortes.reduce<MetodosPago>(
    (acc, c) => {
      acc.efectivo = (acc.efectivo ?? 0) + (c.metodos.efectivo ?? 0);
      acc.tarjeta = (acc.tarjeta ?? 0) + (c.metodos.tarjeta ?? 0);
      acc.transferencia =
        (acc.transferencia ?? 0) + (c.metodos.transferencia ?? 0);
      acc.vales = (acc.vales ?? 0) + (c.metodos.vales ?? 0);
      acc.otros = (acc.otros ?? 0) + (c.metodos.otros ?? 0);
      return acc;
    },
    { efectivo: 0, tarjeta: 0, transferencia: 0, vales: 0, otros: 0 }
  );
}

function abrirPdfDataUrl(dataUrl?: string, fileName = "corte.pdf") {
  if (!dataUrl) return;

  try {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = fileName || "corte.pdf";
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (e) {
    console.error(e);
    alert("No se pudo abrir el PDF");
  }
}

export default function CierreSucursalPage() {
  const router = useRouter();

  const [session, setSession] = useState<Session>({});
  const [sucursal, setSucursal] = useState("");

  const [loadingPdf, setLoadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [pdfName, setPdfName] = useState("");
  const [saldoSobranteAnterior, setSaldoSobranteAnterior] = useState(0);
  const [guardando, setGuardando] = useState(false);

  const [voucherFiles, setVoucherFiles] = useState<File[]>([]);
  const [voucherPreviews, setVoucherPreviews] = useState<VoucherPreview[]>([]);

  const [fechaYMD, setFechaYMD] = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  });

  const [turno, setTurno] = useState<TurnoCierre>("GENERAL");

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

  const [bolsaFinal, setBolsaFinal] = useState(0);
  const [capturarDenoms, setCapturarDenoms] = useState(false);

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

      if (parsed?.role !== "SUCURSAL" || !parsed?.sucursalId) {
        router.replace("/acceso");
        return;
      }

      setSession(parsed);
      setSucursal(parsed.sucursalId);

      if (requiereTurno(parsed.sucursalId)) {
        setTurno("MATUTINO");
      } else {
        setTurno("GENERAL");
      }
    } catch {
      router.replace("/acceso");
    }
  }, [router]);

  function recargar() {
    try {
      if (!sucursal) return;

      setPdfError("");
      const pendientes = getCortesPendientes(sucursal, fechaYMD, turno);
      setCortesPendientes(pendientes || []);
      setSaldoSobranteAnterior(getSaldoSobranteSucursal(sucursal));
    } catch (e: any) {
      console.error(e);
      setPdfError(e?.message || "Error al recargar");
    }
  }

  useEffect(() => {
    recargar();
  }, [sucursal, fechaYMD, turno]);

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

  async function onPickVoucher(files: FileList | null) {
    if (!files || files.length === 0) {
      setVoucherFiles([]);
      setVoucherPreviews([]);
      return;
    }

    const arr = Array.from(files);
    setVoucherFiles(arr);

    try {
      const previews = await Promise.all(
        arr.map(async (f) => ({
          name: f.name,
          dataUrl: await fileToBase64(f),
        }))
      );

      setVoucherPreviews(previews);
    } catch (e) {
      console.error(e);
      setVoucherPreviews([]);
    }
  }

  const hayCortesPendientes = cortesPendientes.length > 0;

  const totalesCortes = useMemo(
    () => sumarCortes(cortesPendientes),
    [cortesPendientes]
  );

  const totalesBase: MetodosPago = hayCortesPendientes
    ? totalesCortes
    : {
        efectivo: Number(totalesPdf.efectivo || 0),
        tarjeta: Number(totalesPdf.tarjeta || 0),
        transferencia: Number(totalesPdf.transferencia || 0),
        vales: Number(totalesPdf.vales || 0),
        otros: Number(totalesPdf.otros || 0),
      };

  const totalEsperado = totalMetodos(totalesBase);
  const efectivoEsperado = Number(totalesBase.efectivo || 0);

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
  const totalDenoms = useMemo(() => totalDenominacionesMXN(denoms), [denoms]);

  async function guardarCierre() {
    try {
      if (!sucursal) throw new Error("No hay sucursal asignada");
      if (!session?.username) throw new Error("No hay sesión activa");

      if (!hayCortesPendientes && !pdfFile) {
        throw new Error(
          "No hay cortes pendientes. Sube un PDF de respaldo para generar el cierre."
        );
      }

      if ((totalesBase.tarjeta || 0) > 0 && voucherFiles.length === 0) {
        throw new Error(
          "Este cierre tiene tarjeta. Debes subir al menos una imagen de voucher antes de guardar."
        );
      }

      setGuardando(true);

      let pdfDataUrl: string | undefined;
      if (pdfFile) {
        pdfDataUrl = await fileToBase64(pdfFile);
      }

      const vouchers =
        voucherPreviews.length > 0
          ? voucherPreviews.map((v) => ({
              name: v.name,
              dataUrl: v.dataUrl,
            }))
          : undefined;

      await crearCierre({
        sucursalId: sucursal,
        fecha: fechaYMD,
        turno,
        bolsaFinal: Number(bolsaFinal || 0),
        denominaciones: capturarDenoms ? denoms : undefined,
        observaciones: hayCortesPendientes
          ? `Cierre generado con ${cortesPendientes.length} corte(s) pendiente(s)`
          : pdfName
          ? `PDF de respaldo cargado: ${pdfName}`
          : undefined,
        createdBy: session.username,
        pdfName: pdfFile?.name,
        pdfDataUrl,
        totalesPdf: hayCortesPendientes ? undefined : totalesBase,
        vouchers,
        saldoSobranteAnterior,
      });

      alert("Cierre guardado ✅");
      router.push("/sucursal");
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "No se pudo guardar el cierre");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <main style={pageStyle}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <header style={hero}>
          <img
            src="/logotipo-proquimed.png"
            alt="PROQUIMED"
            style={{ width: 150, height: "auto" }}
          />

          <div>
            <button onClick={() => router.push("/sucursal")} style={backBtn}>
              ← Volver
            </button>

            <h1 style={{ margin: "12px 0 4px", color: "#312e81" }}>
              Cierre del día
            </h1>

            <p style={{ margin: 0, color: "#4b5563" }}>
              Sucursal: <b>{sucursal || "—"}</b>
            </p>
          </div>
        </header>

        <section style={card}>
          <h2 style={title}>Datos generales</h2>

          <div style={grid2}>
            <div>
              <label style={label}>Sucursal asignada</label>
              <div style={lockedInput}>{sucursal || "—"}</div>
            </div>

            <div>
              <label style={label}>Fecha</label>
              <input
                type="date"
                value={fechaYMD}
                onChange={(e) => setFechaYMD(e.target.value)}
                style={input}
              />
            </div>

            {requiereTurno(sucursal) ? (
              <div>
                <label style={label}>Turno de cierre</label>
                <select
                  value={turno}
                  onChange={(e) => setTurno(e.target.value as TurnoCierre)}
                  style={input}
                >
                  <option value="MATUTINO">Matutino</option>
                  <option value="VESPERTINO">Vespertino</option>
                </select>
              </div>
            ) : (
              <div>
                <label style={label}>Turno de cierre</label>
                <div style={lockedInput}>General</div>
              </div>
            )}
          </div>

          <button onClick={recargar} style={{ ...backBtn, marginTop: 12 }}>
            Actualizar cortes
          </button>
        </section>

        <section style={summaryGrid}>
          <StatCard
            label="Cortes pendientes"
            value={String(cortesPendientes.length)}
          />
          <StatCard label="Total esperado" value={money(totalEsperado)} />
          <StatCard
            label="Efectivo requerido"
            value={money(efectivoNetoAEnviar)}
          />
          <StatCard
            label="Voucher"
            value={
              (totalesBase.tarjeta || 0) > 0
                ? voucherFiles.length > 0
                  ? `${voucherFiles.length} cargado(s)`
                  : "Pendiente"
                : "No aplica"
            }
          />
        </section>

        <section style={card}>
          <h2 style={title}>Cortes pendientes</h2>

          {cortesPendientes.length === 0 ? (
            <div style={warningBox}>
              No hay cortes pendientes para esta fecha y turno. Puedes subir un
              PDF de respaldo para generar el cierre.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {cortesPendientes.map((c, idx) => (
                <div key={c.id || idx} style={corteCard}>
                  <div>
                    <b>{c.usuarioPdf || c.createdBy || "Corte"}</b>

                    <div
                      style={{ color: "#64748b", fontSize: 13, marginTop: 2 }}
                    >
                      {c.id} · {c.status} · {c.turno || "GENERAL"}
                    </div>

                    {c.pdfName ? (
                      <div
                        style={{
                          color: "#64748b",
                          fontSize: 13,
                          marginTop: 4,
                        }}
                      >
                        📄 {c.pdfName}
                      </div>
                    ) : null}
                  </div>

                  <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                    <div
                      style={{
                        fontWeight: 900,
                        color: "#0f766e",
                        fontSize: 18,
                      }}
                    >
                      {money(c.total || 0)}
                    </div>

                    {c.pdfDataUrl ? (
                      <button
                        type="button"
                        onClick={() =>
                          abrirPdfDataUrl(
                            c.pdfDataUrl,
                            c.pdfName || "corte.pdf"
                          )
                        }
                        style={smallBtn}
                      >
                        👁 Ver PDF
                      </button>
                    ) : (
                      <span style={{ color: "#94a3b8", fontSize: 12 }}>
                        Sin PDF
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {!hayCortesPendientes ? (
          <section style={card}>
            <h2 style={title}>PDF de respaldo</h2>

            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => onPickPdf(e.target.files?.[0] || null)}
            />

            <div style={{ marginTop: 8 }}>
              <b>Archivo:</b> {pdfName || "—"}
            </div>

            {loadingPdf ? <div style={infoBox}>Leyendo PDF…</div> : null}
            {pdfError ? <div style={errorBox}>{pdfError}</div> : null}
          </section>
        ) : null}

        <section style={card}>
          <h2 style={title}>Totales del cierre</h2>

          <div style={amountGrid}>
            <Amount label="Efectivo" value={totalesBase.efectivo ?? 0} />
            <Amount label="Tarjeta" value={totalesBase.tarjeta ?? 0} />
            <Amount
              label="Transferencia"
              value={totalesBase.transferencia ?? 0}
            />
            <Amount label="Vales" value={totalesBase.vales ?? 0} />
            <Amount label="Otros" value={totalesBase.otros ?? 0} />
            <Amount label="Total esperado" value={totalEsperado} strong />
          </div>
        </section>

        <section style={card}>
          <h2 style={title}>Vouchers terminal</h2>

          <div style={{ marginBottom: 8, color: "#555" }}>
            {(totalesBase.tarjeta || 0) > 0
              ? "Este cierre tiene tarjeta. Puedes subir uno o varios vouchers."
              : "Este cierre no tiene tarjeta. Puedes dejarlo vacío."}
          </div>

          <input
            type="file"
            multiple
            accept="image/*"
            onChange={(e) => onPickVoucher(e.target.files)}
          />

          <div style={{ marginTop: 8 }}>
            <b>Archivos:</b>{" "}
            {voucherFiles.length > 0
              ? voucherFiles.map((x) => x.name).join(", ")
              : "—"}
          </div>

          {voucherPreviews.length > 0 ? (
            <div style={voucherGrid}>
              {voucherPreviews.map((v, idx) => (
                <div key={`${v.name}-${idx}`} style={voucherCard}>
                  <div style={voucherNameStyle}>{v.name}</div>

                  <img
                    src={v.dataUrl}
                    alt={v.name}
                    style={{
                      width: "100%",
                      maxHeight: 220,
                      objectFit: "contain",
                      borderRadius: 10,
                    }}
                  />
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section style={card}>
          <h2 style={title}>Bolsa final y efectivo</h2>

          <div style={highlightBox}>
            <div>
              <div style={{ color: "#64748b", fontSize: 13 }}>
                Efectivo que debe capturar/enviar
              </div>
              <div style={{ fontWeight: 900, fontSize: 30, color: "#0f766e" }}>
                {money(efectivoNetoAEnviar)}
              </div>
            </div>
          </div>

          <label style={label}>Bolsa final física</label>
          <input
            type="number"
            value={bolsaFinal}
            onChange={(e) => setBolsaFinal(Number(e.target.value || 0))}
            style={input}
          />

          <div style={{ ...amountGrid, marginTop: 14 }}>
            <Amount label="Efectivo esperado" value={efectivoEsperado} />
            <Amount
              label="Saldo sobrante anterior"
              value={saldoSobranteAnterior}
            />
            <Amount
              label="Efectivo neto a enviar"
              value={efectivoNetoAEnviar}
              strong
            />
            <Amount label="Sobrante del corte" value={sobranteCorte} />
            <Amount
              label="Saldo sobrante proyectado"
              value={saldoSobranteProyectado}
            />
            <Amount
              label="Diferencia"
              value={diferencia}
              danger={diferencia !== 0}
              strong
            />
          </div>

          <label style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <input
              type="checkbox"
              checked={capturarDenoms}
              onChange={(e) => setCapturarDenoms(e.target.checked)}
            />
            <b>Capturar denominaciones</b>
          </label>

          {capturarDenoms ? (
            <div style={denomGrid}>
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

              <div style={totalDenomBox}>
                <span>Total denominaciones</span>
                <span>{money(totalDenoms)}</span>
              </div>
            </div>
          ) : null}
        </section>

        <button
          onClick={guardarCierre}
          disabled={guardando || (!hayCortesPendientes && !pdfFile)}
          style={{
            ...saveBtn,
            opacity: guardando || (!hayCortesPendientes && !pdfFile) ? 0.6 : 1,
          }}
        >
          {guardando ? "Guardando..." : "Guardar cierre global del día"}
        </button>

        {pdfText ? (
          <details style={{ marginTop: 16 }}>
            <summary>Debug: texto del PDF</summary>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>
              {pdfText.slice(-2000)}
            </pre>
          </details>
        ) : null}
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={statCard}>
      <div style={{ color: "#0f766e", fontWeight: 900, fontSize: 13 }}>
        {label}
      </div>
      <div style={{ color: "#312e81", fontWeight: 900, fontSize: 24 }}>
        {value}
      </div>
    </div>
  );
}

function Amount({
  label,
  value,
  strong,
  danger,
}: {
  label: string;
  value: number;
  strong?: boolean;
  danger?: boolean;
}) {
  return (
    <div style={amountBox}>
      <div style={{ color: "#64748b", fontSize: 13 }}>{label}</div>
      <div
        style={{
          fontWeight: 900,
          fontSize: strong ? 22 : 18,
          color: danger ? "#be123c" : "#312e81",
        }}
      >
        {money(value)}
      </div>
    </div>
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
      <label style={labelStyle}>{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value || 0))}
        style={input}
      />
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  padding: 24,
  background: "linear-gradient(135deg, #e6fffb 0%, #f5f3ff 48%, #ffffff 100%)",
  fontFamily: "Arial",
};

const hero: React.CSSProperties = {
  background: "rgba(255,255,255,0.95)",
  border: "1px solid #dbeafe",
  borderRadius: 24,
  padding: 22,
  boxShadow: "0 18px 40px rgba(31, 41, 55, 0.10)",
  display: "flex",
  gap: 20,
  alignItems: "center",
  flexWrap: "wrap",
};

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.95)",
  borderRadius: 22,
  border: "1px solid #e0e7ff",
  padding: 18,
  marginTop: 16,
  boxShadow: "0 14px 30px rgba(31, 41, 55, 0.08)",
};

const title: React.CSSProperties = {
  margin: "0 0 12px",
  color: "#312e81",
};

const grid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const summaryGrid: React.CSSProperties = {
  marginTop: 16,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 12,
};

const amountGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 10,
};

const denomGrid: React.CSSProperties = {
  marginTop: 12,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
};

const voucherGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
  marginTop: 14,
};

const voucherCard: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 14,
  padding: 10,
  background: "#fff",
};

const voucherNameStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  marginBottom: 8,
  color: "#475569",
  wordBreak: "break-word",
};

const label: React.CSSProperties = {
  display: "block",
  fontWeight: 900,
  color: "#312e81",
  marginBottom: 6,
};

const labelStyle = label;

const input: React.CSSProperties = {
  width: "100%",
  padding: 12,
  borderRadius: 12,
  border: "1px solid #cbd5e1",
};

const lockedInput: React.CSSProperties = {
  ...input,
  background: "#f3f4f6",
  fontWeight: 900,
};

const backBtn: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 12,
  border: "1px solid #dbeafe",
  background: "white",
  fontWeight: 900,
  cursor: "pointer",
};

const statCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.95)",
  border: "1px solid #ccfbf1",
  borderRadius: 18,
  padding: 16,
  boxShadow: "0 10px 24px rgba(31, 41, 55, 0.07)",
};

const corteCard: React.CSSProperties = {
  padding: 14,
  borderRadius: 16,
  border: "1px solid #99f6e4",
  background: "#ecfeff",
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
};

const amountBox: React.CSSProperties = {
  padding: 12,
  borderRadius: 14,
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
};

const highlightBox: React.CSSProperties = {
  padding: 16,
  borderRadius: 18,
  background: "#ecfeff",
  border: "1px solid #99f6e4",
  marginBottom: 14,
};

const totalDenomBox: React.CSSProperties = {
  gridColumn: "1 / -1",
  padding: 14,
  borderRadius: 16,
  background: "#f5f3ff",
  border: "1px solid #ddd6fe",
  display: "flex",
  justifyContent: "space-between",
  fontWeight: 900,
  color: "#312e81",
};

const infoBox: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 14,
  background: "#eff6ff",
  border: "1px solid #bfdbfe",
  color: "#1e3a8a",
  fontWeight: 800,
};

const warningBox: React.CSSProperties = {
  padding: 12,
  borderRadius: 14,
  background: "#fff7ed",
  border: "1px solid #fed7aa",
  color: "#9a3412",
  fontWeight: 800,
};

const errorBox: React.CSSProperties = {
  marginTop: 12,
  background: "#fff1f2",
  border: "1px solid #fecdd3",
  color: "#be123c",
  padding: 12,
  borderRadius: 14,
  fontWeight: 800,
};

const saveBtn: React.CSSProperties = {
  marginTop: 18,
  marginBottom: 30,
  width: "100%",
  padding: 16,
  borderRadius: 16,
  border: "none",
  background: "linear-gradient(90deg, #0d9488, #4338ca)",
  color: "white",
  cursor: "pointer",
  fontWeight: 900,
  fontSize: 16,
};

const smallBtn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid #99f6e4",
  background: "white",
  color: "#0f766e",
  fontWeight: 800,
  cursor: "pointer",
}; 