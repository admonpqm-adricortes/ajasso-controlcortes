"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { saveCorte, uid, totalMetodos } from "@/lib/storage";
import type { MetodosPago, Corte } from "@/lib/types";
import { parseTotalesDesdePdfText } from "@/lib/corteParser";

declare global {
  interface Window {
    pdfjsLib?: any;
  }
}

const PDFJS_VERSION = "3.11.174";
const PDFJS_SRC = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
const PDFJS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;

type Session = {
  username?: string;
  email?: string;
  role?: string;
  sucursalId?: string;
};

type Modo = "PDF" | "MANUAL";

function money(n: number) {
  return (Number(n) || 0).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
  });
}

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

function detectarUsuarioPdf(text: string) {
  const lines = text
    .split(/\n+/)
    .map((x) => x.trim())
    .filter(Boolean);

  for (const line of lines.slice(0, 25)) {
    const match = line.match(/usuario\s*:?\s*([A-ZÁÉÍÓÚÑ0-9._ -]+)/i);
    if (match?.[1]) {
      return match[1].trim().toUpperCase();
    }
  }

  return "";
}

export default function NuevoCortePage() {
  const router = useRouter();

  const [session, setSession] = useState<Session>({});
  const [modo, setModo] = useState<Modo>("PDF");

  const [fecha, setFecha] = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  });

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfName, setPdfName] = useState("");
  const [pdfText, setPdfText] = useState("");
  const [usuarioPdf, setUsuarioPdf] = useState("");
  const [leyendoPdf, setLeyendoPdf] = useState(false);
  const [errorPdf, setErrorPdf] = useState("");

  const [metodos, setMetodos] = useState<MetodosPago>({
    efectivo: 0,
    tarjeta: 0,
    transferencia: 0,
    vales: 0,
    otros: 0,
  });

  useEffect(() => {
    const raw = localStorage.getItem("session");

    if (!raw) {
      router.replace("/acceso");
      return;
    }

    try {
      const s = JSON.parse(raw) as Session;
      const role = String(s?.role ?? "").toUpperCase();

      if (role !== "SUCURSAL") {
        router.replace("/admin");
        return;
      }

      if (!s.sucursalId) {
        router.replace("/acceso");
        return;
      }

      setSession(s);
    } catch {
      router.replace("/acceso");
    }
  }, [router]);

  const total = useMemo(() => totalMetodos(metodos), [metodos]);

  const setM = (k: keyof MetodosPago, v: number) =>
    setMetodos((prev) => ({ ...prev, [k]: Number.isFinite(v) ? v : 0 }));

  async function onPickPdf(file: File | null) {
    setErrorPdf("");
    setPdfText("");
    setUsuarioPdf("");
    setPdfFile(null);
    setPdfName("");

    if (!file) return;

    setPdfFile(file);
    setPdfName(file.name);
    setLeyendoPdf(true);

    try {
      const text = await pdfFileToText(file);
      setPdfText(text);
      localStorage.setItem("ultimoPdfTextoCorte", text);

      const parsed = parseTotalesDesdePdfText(text);
      const detectedUser = detectarUsuarioPdf(text);

      setUsuarioPdf(detectedUser);

      setMetodos({
        efectivo: Number(parsed.efectivo || 0),
        tarjeta: Number(parsed.tarjeta || 0),
        transferencia: Number(parsed.transferencia || 0),
        vales: Number(parsed.vales || 0),
        otros: Number(parsed.otros || 0),
      });
    } catch (e: any) {
      console.error(e);
      setErrorPdf(e?.message || "No se pudo leer el PDF");
    } finally {
      setLeyendoPdf(false);
    }
  }

  async function guardar() {
    try {
      if (!session.username || !session.sucursalId) {
        throw new Error("No hay sesión de sucursal válida");
      }

      if (modo === "PDF" && !pdfFile) {
        throw new Error("Debes subir el PDF del corte");
      }

      if (total <= 0) {
        throw new Error("El corte no tiene importes para guardar");
      }

      let pdfDataUrl: string | undefined;

      if (pdfFile) {
        pdfDataUrl = await fileToBase64(pdfFile);
      }

      const corte = {
        id: uid(),
        sucursalId: session.sucursalId,
        fecha,
        metodos: {
          efectivo: Number(metodos.efectivo ?? 0),
          tarjeta: Number(metodos.tarjeta ?? 0),
          transferencia: Number(metodos.transferencia ?? 0),
          vales: Number(metodos.vales ?? 0),
          otros: Number(metodos.otros ?? 0),
        },
        total: Number(total),
        status: "ABIERTO",
        createdAt: new Date().toISOString(),
        createdBy: session.username,

        origen: modo,
        pdfName: pdfFile?.name,
        pdfDataUrl,
        usuarioPdf: usuarioPdf || undefined,
        uploadedByEmail: session.email,
      } as Corte;

      await Promise.resolve(saveCorte(corte));

      alert("Corte guardado ✅");
      router.replace("/sucursal");
    } catch (e: any) {
      alert(e?.message ?? "No se pudo guardar el corte");
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        background:
          "linear-gradient(135deg, #e6fffb 0%, #f5f3ff 48%, #ffffff 100%)",
        fontFamily: "Arial",
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
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
              Nuevo corte
            </h1>

            <p style={{ margin: 0, color: "#4b5563" }}>
              Sucursal: <b>{session.sucursalId || "—"}</b>
            </p>
          </div>
        </header>

        <section style={card}>
          <h2 style={title}>Tipo de captura</h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <button
              onClick={() => setModo("PDF")}
              style={modo === "PDF" ? modeActive : modeBtn}
            >
              📄 Subir PDF del corte
              <small>Opción principal recomendada</small>
            </button>

            <button
              onClick={() => setModo("MANUAL")}
              style={modo === "MANUAL" ? modeActive : modeBtn}
            >
              ✍️ Captura manual
              <small>Solo para contingencias</small>
            </button>
          </div>
        </section>

        <section style={card}>
          <h2 style={title}>Datos generales</h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={label}>Sucursal asignada</label>
              <div style={lockedInput}>{session.sucursalId || "—"}</div>
            </div>

            <div>
              <label style={label}>Fecha</label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                style={input}
              />
            </div>
          </div>
        </section>

        {modo === "PDF" ? (
          <section style={card}>
            <h2 style={title}>PDF del corte de turno</h2>

            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => onPickPdf(e.target.files?.[0] || null)}
            />

            <div style={{ marginTop: 10 }}>
              <b>Archivo:</b> {pdfName || "—"}
            </div>

            {leyendoPdf ? (
              <div style={infoBox}>Leyendo PDF y extrayendo importes…</div>
            ) : null}

            {errorPdf ? <div style={errorBox}>{errorPdf}</div> : null}

            {usuarioPdf ? (
              <div style={successBox}>
                Usuario detectado en PDF: <b>{usuarioPdf}</b>
              </div>
            ) : null}
          </section>
        ) : (
          <section style={warningBox}>
            Captura manual activa. Usar solo si no se pudo obtener o leer el PDF.
          </section>
        )}

        <section style={card}>
          <h2 style={title}>Métodos de pago</h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {(
              ["efectivo", "tarjeta", "transferencia", "vales", "otros"] as (
                | keyof MetodosPago
              )[]
            ).map((k) => (
              <div key={k}>
                <label style={{ ...label, textTransform: "capitalize" }}>{k}</label>
                <input
                  type="number"
                  value={Number(metodos[k] ?? 0)}
                  onChange={(e) => setM(k, Number(e.target.value))}
                  disabled={modo === "PDF"}
                  style={{
                    ...input,
                    background: modo === "PDF" ? "#f3f4f6" : "white",
                  }}
                />
              </div>
            ))}
          </div>

          <div style={totalBox}>
            <span>Total del corte</span>
            <span>{money(total)}</span>
          </div>

          {modo === "PDF" ? (
            <p style={{ color: "#64748b", marginTop: 10 }}>
              Los importes se leen automáticamente desde el PDF. Si algo no
              coincide, usa captura manual solo como contingencia.
            </p>
          ) : null}

          <button onClick={guardar} style={saveBtn}>
            Guardar corte
          </button>
        </section>

        {pdfText ? (
          <details style={{ marginTop: 16 }}>
            <summary>Debug: texto del PDF</summary>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>
              {pdfText.slice(0, 2500)}
            </pre>
          </details>
        ) : null}
      </div>
    </main>
  );
}

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

const label: React.CSSProperties = {
  display: "block",
  fontWeight: 900,
  color: "#312e81",
  marginBottom: 6,
};

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

const modeBtn: React.CSSProperties = {
  padding: 16,
  borderRadius: 18,
  border: "1px solid #dbeafe",
  background: "white",
  cursor: "pointer",
  textAlign: "left",
  fontWeight: 900,
  color: "#312e81",
  display: "grid",
  gap: 5,
};

const modeActive: React.CSSProperties = {
  ...modeBtn,
  background: "#ecfeff",
  border: "1px solid #99f6e4",
  color: "#0f766e",
};

const backBtn: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 12,
  border: "1px solid #dbeafe",
  background: "white",
  fontWeight: 900,
  cursor: "pointer",
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

const successBox: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 14,
  background: "#ecfdf5",
  border: "1px solid #bbf7d0",
  color: "#166534",
  fontWeight: 800,
};

const errorBox: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 14,
  background: "#fff1f2",
  border: "1px solid #fecdd3",
  color: "#be123c",
  fontWeight: 800,
};

const warningBox: React.CSSProperties = {
  ...card,
  background: "#fff7ed",
  border: "1px solid #fed7aa",
  color: "#9a3412",
  fontWeight: 800,
};

const totalBox: React.CSSProperties = {
  marginTop: 16,
  padding: 14,
  borderRadius: 16,
  background: "#f5f3ff",
  border: "1px solid #ddd6fe",
  display: "flex",
  justifyContent: "space-between",
  fontWeight: 900,
  color: "#312e81",
  fontSize: 20,
};

const saveBtn: React.CSSProperties = {
  marginTop: 14,
  width: "100%",
  padding: 14,
  borderRadius: 14,
  border: "none",
  background: "linear-gradient(90deg, #0d9488, #4338ca)",
  color: "white",
  cursor: "pointer",
  fontWeight: 900,
  fontSize: 16,
};