"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { saveCorte, uid, totalMetodos } from "@/lib/storage";
import type { MetodosPago, Corte } from "@/lib/types";

export default function NuevoCortePage() {
  const router = useRouter();
  const [user, setUser] = useState<string>("");

  const branches = useMemo(
    () => ["M-MEDICA CAMPESTRE", "P-PUNTA DEL ESTE"],
    []
  );

  const [sucursalId, setSucursalId] = useState(branches[0]);
  const [fecha, setFecha] = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  });

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

    const s = JSON.parse(raw);
    const role = String(s?.role ?? "").toUpperCase();

    if (role !== "SUCURSAL") {
      router.replace("/admin");
      return;
    }

    setUser(String(s?.username ?? ""));
  }, [router]);

  const setM = (k: keyof MetodosPago, v: number) =>
    setMetodos((prev) => ({ ...prev, [k]: Number.isFinite(v) ? v : 0 }));

  const total = totalMetodos(metodos);

  function guardar() {
    try {
      const corte: Corte = {
        id: uid(),
        sucursalId,
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
        createdBy: user,
      };

      saveCorte(corte);
      router.replace("/sucursal");
    } catch (e: any) {
      alert(e?.message ?? "No se pudo guardar el corte");
    }
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
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button
          onClick={() => router.push("/sucursal")}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: "white",
            cursor: "pointer",
            fontWeight: 800,
          }}
        >
          ← Volver
        </button>

        <h1 style={{ margin: 0 }}>Nuevo corte</h1>
      </div>

      <div
        style={{
          marginTop: 16,
          background: "white",
          padding: 16,
          borderRadius: 14,
          border: "1px solid #eee",
          maxWidth: 720,
        }}
      >
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
        >
          <div>
            <label style={{ fontWeight: 800 }}>Sucursal</label>
            <select
              value={sucursalId}
              onChange={(e) => setSucursalId(e.target.value)}
              style={{
                width: "100%",
                marginTop: 6,
                padding: 10,
                borderRadius: 10,
                border: "1px solid #ddd",
              }}
            >
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontWeight: 800 }}>Fecha</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              style={{
                width: "100%",
                marginTop: 6,
                padding: 10,
                borderRadius: 10,
                border: "1px solid #ddd",
              }}
            />
          </div>
        </div>

        <h3 style={{ marginBottom: 8, marginTop: 18 }}>Métodos</h3>

        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
        >
          {(
            ["efectivo", "tarjeta", "transferencia", "vales", "otros"] as (
              | keyof MetodosPago
            )[]
          ).map((k) => (
            <div key={k}>
              <label
                style={{ fontWeight: 700, textTransform: "capitalize" }}
              >
                {k}
              </label>
              <input
                type="number"
                value={Number(metodos[k] ?? 0)}
                onChange={(e) => setM(k, Number(e.target.value))}
                style={{
                  width: "100%",
                  marginTop: 6,
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #ddd",
                }}
              />
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 12,
            background: "#fafafa",
            border: "1px solid #eee",
            display: "flex",
            justifyContent: "space-between",
            fontWeight: 900,
          }}
        >
          <span>Total</span>
          <span>${total.toFixed(2)}</span>
        </div>

        <button
          onClick={guardar}
          style={{
            marginTop: 12,
            width: "100%",
            padding: "12px 12px",
            borderRadius: 12,
            border: "none",
            background: "#111827",
            color: "white",
            cursor: "pointer",
            fontWeight: 900,
          }}
        >
          Guardar corte
        </button>
      </div>
    </main>
  );
}