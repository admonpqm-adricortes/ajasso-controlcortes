"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import {
  getCierres,
  getCortes,
  marcarCierreRevisado,
} from "@/lib/storage";
import type { CierreDia, Corte, DenominacionesMXN } from "@/lib/types";

const money = (n: number) =>
  (Number(n) || 0).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
  });

function descargarArchivo(dataUrl?: string, fileName = "archivo") {
  if (!dataUrl) return;

  try {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = fileName;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (e) {
    console.error(e);
    alert("No se pudo abrir el archivo");
  }
}

type Session = {
  username?: string;
  email?: string;
  role?: "ADMIN" | "SUPERVISOR" | "CONSULTA" | "SUCURSAL";
};

export default function AdminCierreDetallePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [session, setSession] = useState<Session>({});
  const [cierre, setCierre] = useState<CierreDia | null>(null);
  const [cortes, setCortes] = useState<Corte[]>([]);
  const [loading, setLoading] = useState(false);

  const esAdmin = session.role === "ADMIN";
  const esConsulta =
    session.role === "SUPERVISOR" || session.role === "CONSULTA";

  function cargar() {
    const raw = localStorage.getItem("session");
    if (!raw) {
      router.replace("/acceso");
      return;
    }

    const s = JSON.parse(raw) as Session;

    if (
      s.role !== "ADMIN" &&
      s.role !== "SUPERVISOR" &&
      s.role !== "CONSULTA"
    ) {
      router.replace("/sucursal");
      return;
    }

    setSession(s);

    const found = getCierres().find((x) => x.id === id) ?? null;
    setCierre(found);

    if (found) {
      const all = getCortes();
      setCortes(all.filter((c) => found.cortesIds.includes(c.id)));
    } else {
      setCortes([]);
    }
  }

  useEffect(() => {
    cargar();
  }, [id, router]);

  const denoms = cierre?.bolsa?.denominaciones;

  const denomRows = useMemo(() => {
    if (!denoms) return [];

    const map: [keyof DenominacionesMXN, string, number][] = [
      ["b1000", "Billete $1000", 1000],
      ["b500", "Billete $500", 500],
      ["b200", "Billete $200", 200],
      ["b100", "Billete $100", 100],
      ["b50", "Billete $50", 50],
      ["b20", "Billete $20", 20],
      ["m20", "Moneda $20", 20],
      ["m10", "Moneda $10", 10],
      ["m5", "Moneda $5", 5],
      ["m2", "Moneda $2", 2],
      ["m1", "Moneda $1", 1],
      ["m050", "Moneda $0.50", 0.5],
    ];

    return map.map(([k, label, val]) => {
      const qty = Number((denoms as any)[k] ?? 0);
      return { key: String(k), label, qty, subtotal: qty * val };
    });
  }, [denoms]);

  function toggleRevision(revisado: boolean) {
    if (!cierre) return;

    if (!esAdmin) {
      alert("Solo ADMIN puede modificar la revisión.");
      return;
    }

    try {
      setLoading(true);

      marcarCierreRevisado({
        cierreId: cierre.id,
        revisado,
        username: session.username || "ADMIN",
        role: session.role || "ADMIN",
      });

      cargar();
    } catch (e: any) {
      alert(e?.message || "No se pudo actualizar la revisión");
    } finally {
      setLoading(false);
    }
  }

  if (!cierre) {
    return (
      <main style={pageStyle}>
        <button onClick={() => router.push("/admin/cierres")} style={btn}>
          ← Volver a cierres
        </button>
        <h2 style={{ marginTop: 14 }}>No se encontró el cierre.</h2>
      </main>
    );
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
            <div style={badge}>
              {cierre.revisado ? "✅ Revisado" : "⏳ Pendiente"}
            </div>

            <h1 style={{ margin: "8px 0 4px", color: "#312e81" }}>
              Detalle de cierre
            </h1>

            <div style={{ color: "#4b5563" }}>
              <b>{cierre.sucursalId}</b> · {cierre.fecha} ·{" "}
              {cierre.turno || "GENERAL"} · Cierre #{cierre.id.slice(-6)}
            </div>
          </div>
        </header>

        <div
          style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}
        >
          <button onClick={() => router.push("/admin/cierres")} style={btn}>
            ← Volver a cierres
          </button>

          {esAdmin ? (
            <button
              onClick={() => toggleRevision(!cierre.revisado)}
              disabled={loading}
              style={{
                ...btn,
                background: cierre.revisado ? "#fff7ed" : "#ecfeff",
                border: cierre.revisado
                  ? "1px solid #fed7aa"
                  : "1px solid #99f6e4",
                color: cierre.revisado ? "#9a3412" : "#0f766e",
              }}
            >
              {cierre.revisado ? "Marcar como pendiente" : "Marcar como correcto"}
            </button>
          ) : null}
        </div>

        {esConsulta ? (
          <div style={supervisorBox}>
            Modo consulta: puedes revisar la información, pero no modificarla.
          </div>
        ) : null}

        <section style={gridCards}>
          <MiniCard label="Creado por" value={cierre.createdBy || "—"} />
          <MiniCard
            label="Fecha de creación"
            value={new Date(cierre.createdAt).toLocaleString("es-MX")}
          />
          <MiniCard label="Turno" value={cierre.turno || "GENERAL"} />
          <MiniCard
            label="Revisado por"
            value={cierre.revisadoBy || "Pendiente"}
          />
        </section>

        <section style={card}>
          <h2 style={title}>Totales</h2>

          <div style={totalsGrid}>
            <Amount
              label="Efectivo"
              value={cierre.totalesPorMetodo.efectivo ?? 0}
            />
            <Amount
              label="Tarjeta"
              value={cierre.totalesPorMetodo.tarjeta ?? 0}
            />
            <Amount
              label="Transferencia"
              value={cierre.totalesPorMetodo.transferencia ?? 0}
            />
            <Amount label="Vales" value={cierre.totalesPorMetodo.vales ?? 0} />
            <Amount label="Otros" value={cierre.totalesPorMetodo.otros ?? 0} />
            <Amount label="Total esperado" value={cierre.totalEsperado} strong />
            <Amount label="Bolsa final" value={cierre.bolsaFinal} strong />
            <Amount
              label="Diferencia"
              value={cierre.diferencia}
              danger={cierre.diferencia !== 0}
            />
          </div>

          {cierre.observaciones ? (
            <div style={noteBox}>
              <b>Observaciones:</b> {cierre.observaciones}
            </div>
          ) : null}
        </section>

        <section style={card}>
          <h2 style={title}>Control de sobrantes</h2>

          <div style={totalsGrid}>
            <Amount
              label="Saldo sobrante anterior"
              value={cierre.saldoSobranteAnterior ?? 0}
            />
            <Amount
              label="Efectivo neto requerido"
              value={cierre.efectivoNetoRequerido ?? 0}
            />
            <Amount label="Sobrante del corte" value={cierre.sobranteCorte ?? 0} />
            <Amount
              label="Saldo sobrante actual"
              value={cierre.saldoSobranteActual ?? 0}
              strong
            />
          </div>
        </section>

        <section style={card}>
          <h2 style={title}>Denominaciones {denoms ? "" : "(no capturadas)"}</h2>

          {!denoms ? (
            <div style={emptyBox}>Este cierre no capturó denominaciones.</div>
          ) : (
            <>
              <div style={denomHeader}>
                <div>Denominación</div>
                <div>Cantidad</div>
                <div>Subtotal</div>
              </div>

              <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                {denomRows.map((r) => {
                  const used = r.qty > 0;

                  return (
                    <div
                      key={r.key}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "2fr 1fr 1fr",
                        gap: 10,
                        padding: 12,
                        borderRadius: 14,
                        border: used ? "1px solid #99f6e4" : "1px solid #eee",
                        background: used ? "#ecfeff" : "white",
                      }}
                    >
                      <div style={{ fontWeight: used ? 900 : 500 }}>
                        {r.label}
                      </div>

                      <div>
                        <span
                          style={{
                            display: "inline-flex",
                            minWidth: 34,
                            justifyContent: "center",
                            padding: "4px 10px",
                            borderRadius: 999,
                            background: used ? "#0d9488" : "#f3f4f6",
                            color: used ? "white" : "#6b7280",
                            fontWeight: 900,
                          }}
                        >
                          {r.qty}
                        </span>
                      </div>

                      <div
                        style={{
                          fontWeight: 900,
                          color: used ? "#0f766e" : "#6b7280",
                        }}
                      >
                        {money(r.subtotal)}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={totalDenomBox}>
                <span>Total denominaciones</span>
                <span>{money(cierre.bolsa?.totalCalculado ?? 0)}</span>
              </div>
            </>
          )}
        </section>

        <section style={twoColumns}>
          <div style={card}>
            <h2 style={title}>Vouchers terminal</h2>

            {!cierre.vouchers || cierre.vouchers.length === 0 ? (
              <div style={emptyBox}>Este cierre no capturó voucher terminal.</div>
            ) : (
              <div style={voucherGrid}>
                {cierre.vouchers.map((v, idx) => (
                  <div key={`${v.name}-${idx}`} style={voucherCard}>
                    <div style={voucherNameStyle}>{v.name}</div>

                    <img
                      src={v.dataUrl}
                      alt={v.name}
                      style={{
                        width: "100%",
                        maxHeight: 260,
                        objectFit: "contain",
                        borderRadius: 12,
                        border: "1px solid #e5e7eb",
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={card}>
            <h2 style={title}>PDFs de cortes incluidos</h2>

            {cortes.filter((c) => c.pdfDataUrl).length === 0 ? (
              <div style={emptyBox}>
                Este cierre no tiene PDFs de cortes relacionados.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {cortes
                  .filter((c) => c.pdfDataUrl)
                  .map((c) => (
                    <div key={c.id} style={pdfRelatedCard}>
                      <div>
                        <b>{c.usuarioPdf || c.createdBy || "Corte"}</b>

                        <div style={{ color: "#64748b", fontSize: 13 }}>
                          {c.pdfName || "PDF del corte"}
                        </div>

                        <div style={{ color: "#64748b", fontSize: 13 }}>
                          Total: {money(c.total || 0)}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          descargarArchivo(c.pdfDataUrl, c.pdfName || "corte.pdf")
                        }
                        style={smallBtn}
                      >
                        👁 Abrir PDF
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </section>

        {cortes.length > 0 ? (
          <section style={card}>
            <h2 style={title}>Cortes relacionados</h2>

            <div style={{ display: "grid", gap: 8 }}>
              {cortes.map((c) => (
                <div key={c.id} style={relatedCard}>
                  <div>
                    <b>Corte:</b> {c.id}
                  </div>
                  <div>
                    <b>Fecha:</b> {c.fecha}
                  </div>
                  <div>
                    <b>Turno:</b> {c.turno || "GENERAL"}
                  </div>
                  <div>
                    <b>Total:</b> {money(c.total)}
                  </div>
                  <div>
                    <b>Status:</b> {c.status}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={miniCard}>
      <div style={{ color: "#64748b", fontSize: 13 }}>{label}</div>
      <div style={{ color: "#312e81", fontWeight: 900, marginTop: 4 }}>
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
          marginTop: 4,
        }}
      >
        {money(value)}
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  padding: 24,
  fontFamily: "Arial",
  background: "linear-gradient(135deg, #e6fffb 0%, #f5f3ff 48%, #ffffff 100%)",
  minHeight: "100vh",
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

const badge: React.CSSProperties = {
  display: "inline-flex",
  padding: "6px 12px",
  borderRadius: 999,
  background: "#ecfeff",
  color: "#0f766e",
  border: "1px solid #99f6e4",
  fontWeight: 900,
  fontSize: 13,
};

const btn: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #dbeafe",
  background: "white",
  fontWeight: 900,
  cursor: "pointer",
  color: "#312e81",
};

const supervisorBox: React.CSSProperties = {
  marginTop: 14,
  padding: 12,
  borderRadius: 14,
  background: "#eff6ff",
  border: "1px solid #bfdbfe",
  color: "#1e3a8a",
  fontWeight: 800,
};

const gridCards: React.CSSProperties = {
  marginTop: 16,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 12,
};

const miniCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.92)",
  border: "1px solid #e0e7ff",
  borderRadius: 18,
  padding: 14,
  boxShadow: "0 10px 24px rgba(31, 41, 55, 0.07)",
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

const totalsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 10,
};

const amountBox: React.CSSProperties = {
  padding: 12,
  borderRadius: 14,
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
};

const noteBox: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 14,
  background: "#fff7ed",
  border: "1px solid #fed7aa",
};

const denomHeader: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "2fr 1fr 1fr",
  gap: 10,
  fontWeight: 900,
  color: "#312e81",
  opacity: 0.9,
};

const totalDenomBox: React.CSSProperties = {
  marginTop: 12,
  padding: 14,
  borderRadius: 16,
  background: "#f5f3ff",
  border: "1px solid #ddd6fe",
  display: "flex",
  justifyContent: "space-between",
  fontWeight: 900,
  color: "#312e81",
};

const twoColumns: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 16,
};

const relatedCard: React.CSSProperties = {
  border: "1px solid #e0e7ff",
  borderRadius: 14,
  padding: 12,
  background: "#f8fafc",
};

const emptyBox: React.CSSProperties = {
  padding: 12,
  borderRadius: 14,
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
  color: "#64748b",
};

const pdfRelatedCard: React.CSSProperties = {
  border: "1px solid #99f6e4",
  borderRadius: 16,
  padding: 14,
  background: "#ecfeff",
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
};

const voucherGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const voucherCard: React.CSSProperties = {
  border: "1px solid #e5e7eb",
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

const smallBtn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid #99f6e4",
  background: "white",
  color: "#0f766e",
  fontWeight: 800,
  cursor: "pointer",
};