"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getCierres,
  sincronizarDesdeFirebase,
} from "../../../lib/storage";
import {
  exportarCierresExcel,
  exportarRelacionEntregaEfectivo,
} from "../../../lib/exportExcel";
import type { CierreDia } from "../../../lib/types";

const money = (n: number) =>
  (Number(n) || 0).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
  });

type Session = {
  username?: string;
  email?: string;
  role?: "ADMIN" | "SUPERVISOR" | "CONSULTA" | "SUCURSAL";
};

export default function AdminCierresPage() {
  const router = useRouter();

  const [session, setSession] = useState<Session>({});
  const [cierres, setCierres] = useState<CierreDia[]>([]);
  const [checking, setChecking] = useState(true);

  const [filtroFecha, setFiltroFecha] = useState("");
  const [filtroSucursal, setFiltroSucursal] = useState("TODAS");
  const [filtroEstado, setFiltroEstado] = useState("TODOS");
  const [filtroTurno, setFiltroTurno] = useState("TODOS");

  async function cargar() {
    await sincronizarDesdeFirebase();
    setCierres(getCierres());
  }

  useEffect(() => {
    const raw = localStorage.getItem("session");

    if (!raw) {
      router.replace("/acceso");
      return;
    }

    try {
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

      cargar().finally(() => {
        setChecking(false);
      });
    } catch {
      router.replace("/acceso");
    }
  }, [router]);

  const sucursales = useMemo(() => {
    return Array.from(new Set(cierres.map((c) => c.sucursalId))).sort();
  }, [cierres]);

  const cierresFiltrados = useMemo(() => {
    return cierres.filter((c) => {
      const turno = c.turno || "GENERAL";

      const cumpleFecha = !filtroFecha || c.fecha === filtroFecha;
      const cumpleSucursal =
        filtroSucursal === "TODAS" || c.sucursalId === filtroSucursal;

      const cumpleTurno = filtroTurno === "TODOS" || turno === filtroTurno;

      let cumpleEstado = true;
      if (filtroEstado === "REVISADOS") cumpleEstado = !!c.revisado;
      if (filtroEstado === "PENDIENTES") cumpleEstado = !c.revisado;

      return cumpleFecha && cumpleSucursal && cumpleEstado && cumpleTurno;
    });
  }, [cierres, filtroFecha, filtroSucursal, filtroEstado, filtroTurno]);

  const revisadosFiltrados = useMemo(
    () => cierresFiltrados.filter((c) => c.revisado),
    [cierresFiltrados]
  );

  const pendientesFiltrados = useMemo(
    () => cierresFiltrados.filter((c) => !c.revisado),
    [cierresFiltrados]
  );

  const totalEsperadoFiltrado = useMemo(() => {
    return cierresFiltrados.reduce(
      (acc, c) => acc + Number(c.totalEsperado || 0),
      0
    );
  }, [cierresFiltrados]);

  const totalBolsaFiltrada = useMemo(() => {
    return cierresFiltrados.reduce(
      (acc, c) => acc + Number(c.bolsaFinal || 0),
      0
    );
  }, [cierresFiltrados]);

  const totalDiferenciaFiltrada = useMemo(() => {
    return cierresFiltrados.reduce(
      (acc, c) => acc + Number(c.diferencia || 0),
      0
    );
  }, [cierresFiltrados]);

  const sobrantesPorSucursal = useMemo(() => {
    const map = new Map<string, number>();

    for (const c of cierres) {
      map.set(c.sucursalId, Number(c.saldoSobranteActual || 0));
    }

    return Array.from(map.entries())
      .map(([sucursal, saldo]) => ({ sucursal, saldo }))
      .sort((a, b) => a.sucursal.localeCompare(b.sucursal));
  }, [cierres]);

  const totalSobrantes = useMemo(() => {
    return sobrantesPorSucursal.reduce((acc, r) => acc + r.saldo, 0);
  }, [sobrantesPorSucursal]);

  const relacionRows = useMemo(() => {
    return cierresFiltrados.map((c) => ({
      id: c.id,
      fecha: c.fecha,
      sucursal: c.sucursalId,
      turno: c.turno || "GENERAL",
      total: Number(c.totalEsperado || 0),
      tarjetas: Number(c.totalesPorMetodo?.tarjeta || 0),
      transferencias: Number(c.totalesPorMetodo?.transferencia || 0),
      vales: Number(c.totalesPorMetodo?.vales || 0),
      otros: Number(c.totalesPorMetodo?.otros || 0),
      efectivo: Number(c.totalesPorMetodo?.efectivo || 0),
      bolsaFinal: Number(c.bolsaFinal || 0),
      diferencia: Number(c.diferencia || 0),
      revisado: !!c.revisado,
      revisadoBy: c.revisadoBy || "",
      revisadoAt: c.revisadoAt || "",
    }));
  }, [cierresFiltrados]);

  const totalesRelacion = useMemo(() => {
    return relacionRows.reduce(
      (acc, r) => {
        acc.total += r.total;
        acc.tarjetas += r.tarjetas;
        acc.transferencias += r.transferencias;
        acc.vales += r.vales;
        acc.otros += r.otros;
        acc.efectivo += r.efectivo;
        acc.bolsaFinal += r.bolsaFinal;
        acc.diferencia += r.diferencia;
        return acc;
      },
      {
        total: 0,
        tarjetas: 0,
        transferencias: 0,
        vales: 0,
        otros: 0,
        efectivo: 0,
        bolsaFinal: 0,
        diferencia: 0,
      }
    );
  }, [relacionRows]);

  function limpiarFiltros() {
    setFiltroFecha("");
    setFiltroSucursal("TODAS");
    setFiltroEstado("TODOS");
    setFiltroTurno("TODOS");
  }

  if (checking) return null;

  return (
    <main style={pageStyle}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={topButtons}>
          <button onClick={() => router.push("/admin")} style={btn}>
            ← Volver al panel
          </button>

          <button onClick={cargar} style={btn}>
            Actualizar
          </button>

          <button
            onClick={() => exportarCierresExcel(cierresFiltrados as any)}
            style={btn}
          >
            Exportar Excel
          </button>

          <button
  onClick={() => exportarRelacionEntregaEfectivo(cierresFiltrados as any)}
  style={btn}
>
  Exportar entrega efectivo
</button>
        </div>

        <header style={hero}>
          <div>
            <div style={badge}>
              {session.role === "CONSULTA"
                ? "Modo consulta"
                : session.role === "SUPERVISOR"
                ? "Modo supervisor"
                : "Modo administración"}
            </div>

            <h1 style={h1}>Historial de cierres</h1>

            <p style={subtitle}>
              {session.username || "Usuario"} puede ver el total entregado, los
              turnos, PDFs, vouchers y la relación de importes por sucursal.
            </p>
          </div>
        </header>

        <section style={card}>
          <h2 style={title}>Sobrantes por sucursal</h2>

          {sobrantesPorSucursal.length === 0 ? (
            <div style={emptyBox}>No hay sobrantes registrados.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {sobrantesPorSucursal.map((r) => (
                <div key={r.sucursal} style={sobranteRow}>
                  <span>{r.sucursal}</span>
                  <b style={{ color: r.saldo > 0 ? "#16a34a" : "#111827" }}>
                    {money(r.saldo)}
                  </b>
                </div>
              ))}

              <div style={sobranteTotal}>
                <span>TOTAL SOBRANTES</span>
                <span>{money(totalSobrantes)}</span>
              </div>
            </div>
          )}
        </section>

        <section style={card}>
          <h2 style={title}>Filtros</h2>

          <div style={filterGrid}>
            <div>
              <label style={label}>Fecha</label>
              <input
                type="date"
                value={filtroFecha}
                onChange={(e) => setFiltroFecha(e.target.value)}
                style={input}
              />
            </div>

            <div>
              <label style={label}>Sucursal</label>
              <select
                value={filtroSucursal}
                onChange={(e) => setFiltroSucursal(e.target.value)}
                style={input}
              >
                <option value="TODAS">Todas</option>
                {sucursales.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={label}>Turno</label>
              <select
                value={filtroTurno}
                onChange={(e) => setFiltroTurno(e.target.value)}
                style={input}
              >
                <option value="TODOS">Todos</option>
                <option value="GENERAL">General</option>
                <option value="MATUTINO">Matutino</option>
                <option value="VESPERTINO">Vespertino</option>
              </select>
            </div>

            <div>
              <label style={label}>Estado</label>
              <select
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value)}
                style={input}
              >
                <option value="TODOS">Todos</option>
                <option value="REVISADOS">Revisados</option>
                <option value="PENDIENTES">Pendientes</option>
              </select>
            </div>
          </div>

          <button onClick={limpiarFiltros} style={{ ...btn, marginTop: 14 }}>
            Limpiar filtros
          </button>
        </section>

        <section style={statsGrid}>
          <StatCard label="Cierres filtrados" value={String(cierresFiltrados.length)} />
          <StatCard label="Revisados filtrados" value={String(revisadosFiltrados.length)} />
          <StatCard label="Pendientes filtrados" value={String(pendientesFiltrados.length)} />
          <StatCard label="Total esperado filtrado" value={money(totalEsperadoFiltrado)} />
          <StatCard label="Bolsa final filtrada" value={money(totalBolsaFiltrada)} />
          <StatCard label="Diferencia filtrada" value={money(totalDiferenciaFiltrada)} />
        </section>

        <section style={card}>
          <h2 style={title}>Relación de entrega de efectivo</h2>

          {relacionRows.length === 0 ? (
            <div style={emptyBox}>No hay cierres con esos filtros.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Fecha</th>
                    <th style={th}>Sucursal</th>
                    <th style={th}>Turno</th>
                    <th style={th}>Total</th>
                    <th style={th}>Tarjeta</th>
                    <th style={th}>Transferencia</th>
                    <th style={th}>Vales</th>
                    <th style={th}>Otros</th>
                    <th style={th}>Efectivo</th>
                    <th style={th}>Bolsa</th>
                    <th style={th}>Diferencia</th>
                    <th style={th}>Estado</th>
                    <th style={th}>Detalle</th>
                  </tr>
                </thead>

                <tbody>
                  {relacionRows.map((r) => (
                    <tr key={r.id}>
                      <td style={td}>{r.fecha}</td>
                      <td style={td}>{r.sucursal}</td>
                      <td style={td}>
                        <span style={turnoBadge}>{r.turno || "GENERAL"}</span>
                      </td>
                      <td style={tdMoney}>{money(r.total)}</td>
                      <td style={tdMoney}>{money(r.tarjetas)}</td>
                      <td style={tdMoney}>{money(r.transferencias)}</td>
                      <td style={tdMoney}>{money(r.vales)}</td>
                      <td style={tdMoney}>{money(r.otros)}</td>
                      <td style={tdMoney}>{money(r.efectivo)}</td>
                      <td style={tdMoney}>{money(r.bolsaFinal)}</td>
                      <td
                        style={{
                          ...tdMoney,
                          color: r.diferencia !== 0 ? "#be123c" : "#0f766e",
                        }}
                      >
                        {money(r.diferencia)}
                      </td>
                      <td style={td}>
                        <span
                          style={r.revisado ? statusOk : statusPending}
                        >
                          {r.revisado ? "Revisado" : "Pendiente"}
                        </span>
                      </td>
                      <td style={td}>
                        <button
                          type="button"
                          onClick={() => router.push(`/admin/cierres/${r.id}`)}
                          style={detailBtn}
                        >
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  ))}

                  <tr>
                    <td style={tdTotal} colSpan={3}>
                      TOTALES
                    </td>
                    <td style={tdMoneyTotal}>{money(totalesRelacion.total)}</td>
                    <td style={tdMoneyTotal}>{money(totalesRelacion.tarjetas)}</td>
                    <td style={tdMoneyTotal}>{money(totalesRelacion.transferencias)}</td>
                    <td style={tdMoneyTotal}>{money(totalesRelacion.vales)}</td>
                    <td style={tdMoneyTotal}>{money(totalesRelacion.otros)}</td>
                    <td style={tdMoneyTotal}>{money(totalesRelacion.efectivo)}</td>
                    <td style={tdMoneyTotal}>{money(totalesRelacion.bolsaFinal)}</td>
                    <td style={tdMoneyTotal}>{money(totalesRelacion.diferencia)}</td>
                    <td style={tdTotal}></td>
                    <td style={tdTotal}></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={statCard}>
      <div style={{ color: "#64748b", fontSize: 13 }}>{label}</div>
      <div style={{ color: "#111827", fontSize: 26, fontWeight: 900 }}>
        {value}
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  padding: 24,
  minHeight: "100vh",
  background: "linear-gradient(135deg, #e6fffb 0%, #f5f3ff 48%, #ffffff 100%)",
  fontFamily: "Arial",
};

const topButtons: React.CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
};

const hero: React.CSSProperties = {
  marginTop: 20,
  background: "rgba(255,255,255,0.95)",
  border: "1px solid #dbeafe",
  borderRadius: 24,
  padding: 22,
  boxShadow: "0 18px 40px rgba(31, 41, 55, 0.10)",
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

const h1: React.CSSProperties = {
  margin: "10px 0 4px",
  fontSize: 38,
  color: "#312e81",
};

const subtitle: React.CSSProperties = {
  margin: 0,
  color: "#475569",
  fontSize: 16,
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
  margin: "0 0 14px",
  color: "#312e81",
};

const btn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid #dbeafe",
  background: "white",
  color: "#111827",
  fontWeight: 900,
  cursor: "pointer",
};

const filterGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 12,
};

const label: React.CSSProperties = {
  display: "block",
  fontWeight: 900,
  color: "#111827",
  marginBottom: 6,
};

const input: React.CSSProperties = {
  width: "100%",
  padding: 12,
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  background: "white",
};

const statsGrid: React.CSSProperties = {
  marginTop: 16,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 12,
};

const statCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.95)",
  border: "1px solid #e0e7ff",
  borderRadius: 18,
  padding: 16,
  boxShadow: "0 10px 24px rgba(31, 41, 55, 0.07)",
};

const sobranteRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "10px 0",
  borderBottom: "1px solid #e5e7eb",
};

const sobranteTotal: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  paddingTop: 12,
  fontWeight: 900,
};

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 1100,
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: 10,
  background: "#f8fafc",
  borderBottom: "1px solid #e5e7eb",
  color: "#312e81",
  fontWeight: 900,
  fontSize: 13,
};

const td: React.CSSProperties = {
  padding: 10,
  borderBottom: "1px solid #e5e7eb",
  fontSize: 13,
};

const tdMoney: React.CSSProperties = {
  ...td,
  textAlign: "right",
  fontWeight: 800,
};

const tdTotal: React.CSSProperties = {
  ...td,
  fontWeight: 900,
  background: "#f8fafc",
};

const tdMoneyTotal: React.CSSProperties = {
  ...tdMoney,
  fontWeight: 900,
  background: "#f8fafc",
};

const turnoBadge: React.CSSProperties = {
  display: "inline-flex",
  padding: "4px 10px",
  borderRadius: 999,
  background: "#ecfeff",
  color: "#0f766e",
  border: "1px solid #99f6e4",
  fontWeight: 900,
  fontSize: 12,
};

const statusOk: React.CSSProperties = {
  display: "inline-flex",
  padding: "4px 10px",
  borderRadius: 999,
  background: "#ecfdf5",
  color: "#166534",
  border: "1px solid #bbf7d0",
  fontWeight: 900,
  fontSize: 12,
};

const statusPending: React.CSSProperties = {
  display: "inline-flex",
  padding: "4px 10px",
  borderRadius: 999,
  background: "#fff7ed",
  color: "#9a3412",
  border: "1px solid #fed7aa",
  fontWeight: 900,
  fontSize: 12,
};

const detailBtn: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: 10,
  border: "1px solid #99f6e4",
  background: "white",
  color: "#0f766e",
  fontWeight: 900,
  cursor: "pointer",
};

const emptyBox: React.CSSProperties = {
  padding: 12,
  borderRadius: 14,
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
  color: "#64748b",
};