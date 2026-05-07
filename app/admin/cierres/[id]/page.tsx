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

export default function AdminCierreDetallePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [cierre, setCierre] = useState<CierreDia | null>(null);
  const [cortes, setCortes] = useState<Corte[]>([]);
  const [loading, setLoading] = useState(false);

  function cargar() {
    const raw = localStorage.getItem("session");
    if (!raw) {
      router.replace("/acceso");
      return;
    }

    const s = JSON.parse(raw);
    if (s.role !== "ADMIN") {
      router.replace("/sucursal");
      return;
    }

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

    try {
      setLoading(true);

      const raw = localStorage.getItem("session");
      if (!raw) throw new Error("No hay sesión");
      const s = JSON.parse(raw);

      marcarCierreRevisado({
        cierreId: cierre.id,
        revisado,
        username: s.username || "ADMIN",
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
      <main
        style={{
          padding: 24,
          fontFamily: "Arial",
          background: "#f6f7fb",
          minHeight: "100vh",
        }}
      >
        <button
          onClick={() => router.push("/admin/cierres")}
          style={btn}
        >
          ← Volver a cierres
        </button>
        <h2 style={{ marginTop: 14 }}>No se encontró el cierre.</h2>
      </main>
    );
  }

  return (
    <main
      style={{
        padding: 24,
        fontFamily: "Arial",
        background: "#f6f7fb",
        minHeight: "100vh",
      }}
    >
      <div
        style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}
      >
        <button
          onClick={() => router.push("/admin/cierres")}
          style={btn}
        >
          ← Volver a cierres
        </button>

        <button
          onClick={() => toggleRevision(!cierre.revisado)}
          disabled={loading}
          style={{
            ...btn,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {cierre.revisado ? "Marcar como pendiente" : "Marcar como correcto"}
        </button>

        <h1 style={{ margin: 0 }}>Detalle cierre</h1>
      </div>

      <div style={{ marginTop: 16, display: "grid", gap: 12, maxWidth: 980 }}>
        <div style={card}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>
            {cierre.sucursalId} — {cierre.fecha}
          </div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Cierre #{cierre.id.slice(-6)} · creado por {cierre.createdBy} ·{" "}
            {new Date(cierre.createdAt).toLocaleString("es-MX")}
          </div>

          {cierre.pdfName ? (
            <div style={{ marginTop: 8 }}>
              <b>PDF:</b> {cierre.pdfName}
            </div>
          ) : null}

          <div style={{ marginTop: 8 }}>
            <b>Estado revisión:</b>{" "}
            {cierre.revisado ? "✅ Revisado" : "⏳ Pendiente"}
          </div>
        </div>

        <div style={card}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Totales</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>Efectivo: <b>{money(cierre.totalesPorMetodo.efectivo ?? 0)}</b></div>
            <div>Tarjeta: <b>{money(cierre.totalesPorMetodo.tarjeta ?? 0)}</b></div>
            <div>Transferencia: <b>{money(cierre.totalesPorMetodo.transferencia ?? 0)}</b></div>
            <div>Vales: <b>{money(cierre.totalesPorMetodo.vales ?? 0)}</b></div>
            <div>Otros: <b>{money(cierre.totalesPorMetodo.otros ?? 0)}</b></div>
            <div>Total esperado: <b>{money(cierre.totalEsperado)}</b></div>
            <div>Bolsa final: <b>{money(cierre.bolsaFinal)}</b></div>
            <div>Diferencia: <b>{money(cierre.diferencia)}</b></div>
          </div>

          {cierre.observaciones && (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 12,
                background: "#fafafa",
                border: "1px solid #eee",
              }}
            >
              <b>Observaciones:</b> {cierre.observaciones}
            </div>
          )}
        </div>

        <div style={card}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>
            Control de sobrantes
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              Saldo sobrante anterior:{" "}
              <b>{money(cierre.saldoSobranteAnterior ?? 0)}</b>
            </div>
            <div>
              Efectivo neto requerido:{" "}
              <b>{money(cierre.efectivoNetoRequerido ?? 0)}</b>
            </div>
            <div>
              Sobrante del corte: <b>{money(cierre.sobranteCorte ?? 0)}</b>
            </div>
            <div>
              Saldo sobrante actual:{" "}
              <b>{money(cierre.saldoSobranteActual ?? 0)}</b>
            </div>
          </div>
        </div>

        <div style={card}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>
            Voucher terminal
          </div>

          {!cierre.voucherDataUrl ? (
            <div style={emptyBox}>
              Este cierre no capturó voucher terminal.
            </div>
          ) : (
            <>
              {cierre.voucherName ? (
                <div style={{ marginBottom: 10 }}>
                  <b>Archivo:</b> {cierre.voucherName}
                </div>
              ) : null}

              <img
                src={cierre.voucherDataUrl}
                alt="Voucher terminal"
                style={{
                  width: "100%",
                  maxWidth: 420,
                  borderRadius: 12,
                  border: "1px solid #ddd",
                }}
              />
            </>
          )}
        </div>

        <div style={card}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>
            Vista previa del PDF
          </div>

          {!cierre.pdfDataUrl ? (
            <div style={emptyBox}>
              Este cierre no tiene PDF guardado.
            </div>
          ) : (
            <iframe
              src={cierre.pdfDataUrl}
              style={{
                width: "100%",
                height: 520,
                border: "1px solid #ddd",
                borderRadius: 12,
                background: "white",
              }}
            />
          )}
        </div>

        <div style={card}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>
            Denominaciones {denoms ? "" : "(no capturadas)"}
          </div>

          {!denoms ? (
            <div style={emptyBox}>
              Este cierre no capturó denominaciones.
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr",
                  gap: 10,
                  fontWeight: 900,
                  opacity: 0.8,
                }}
              >
                <div>Denominación</div>
                <div>Cantidad</div>
                <div>Subtotal</div>
              </div>

              <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                {denomRows.map((r) => (
                  <div
                    key={r.key}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 1fr 1fr",
                      gap: 10,
                      padding: 10,
                      borderRadius: 12,
                      border: "1px solid #eee",
                    }}
                  >
                    <div>{r.label}</div>
                    <div>{r.qty}</div>
                    <div style={{ fontWeight: 900 }}>{money(r.subtotal)}</div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 12,
                  background: "#fafafa",
                  border: "1px solid #eee",
                  display: "flex",
                  justifyContent: "space-between",
                  fontWeight: 900,
                }}
              >
                <span>Total denominaciones</span>
                <span>{money(cierre.bolsa?.totalCalculado ?? 0)}</span>
              </div>
            </>
          )}
        </div>

        {cortes.length > 0 && (
          <div style={card}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>
              Cortes relacionados
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              {cortes.map((c) => (
                <div
                  key={c.id}
                  style={{
                    border: "1px solid #eee",
                    borderRadius: 12,
                    padding: 10,
                  }}
                >
                  <div><b>Corte:</b> {c.id}</div>
                  <div><b>Fecha:</b> {c.fecha}</div>
                  <div><b>Total:</b> {money(c.total)}</div>
                  <div><b>Status:</b> {c.status}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

const btn: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "white",
  fontWeight: 800,
};

const card: React.CSSProperties = {
  background: "white",
  borderRadius: 14,
  border: "1px solid #eee",
  padding: 14,
};

const emptyBox: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: "#fafafa",
  border: "1px solid #eee",
  opacity: 0.85,
};