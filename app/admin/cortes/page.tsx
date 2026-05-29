"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  eliminarCorte,
  getCierres,
  getCortes,
  getCortesEliminados,
  restaurarCorteEliminado,
  sincronizarDesdeFirebase,
} from "@/lib/storage";
import type { Corte, CorteEliminado } from "@/lib/types";

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

function descargarArchivo(dataUrl?: string, fileName = "corte.pdf") {
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

export default function AdminCortesPage() {
  const router = useRouter();

  const [session, setSession] = useState<Session>({});
  const [cortes, setCortes] = useState<Corte[]>([]);
  const [eliminados, setEliminados] = useState<CorteEliminado[]>([]);
  const [loading, setLoading] = useState(true);
  const [eliminandoId, setEliminandoId] = useState("");
  const [restaurandoId, setRestaurandoId] = useState("");

  const [filtroFecha, setFiltroFecha] = useState("");
  const [filtroSucursal, setFiltroSucursal] = useState("TODAS");
  const [filtroEstado, setFiltroEstado] = useState("TODOS");
  const [filtroTurno, setFiltroTurno] = useState("TODOS");
  const [tab, setTab] = useState<"ACTIVOS" | "ELIMINADOS">("ACTIVOS");

  function cargarLocal() {
    setCortes(getCortes());
    setEliminados(getCortesEliminados());
  }

  function actualizar() {
    setLoading(true);
    sincronizarDesdeFirebase()
      .then(() => cargarLocal())
      .catch((e) => {
        console.error(e);
        cargarLocal();
      })
      .finally(() => setLoading(false));
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

      sincronizarDesdeFirebase()
        .then(() => cargarLocal())
        .catch((e) => {
          console.error(e);
          cargarLocal();
        })
        .finally(() => setLoading(false));
    } catch (e) {
      console.error(e);
      router.replace("/acceso");
    }
  }, [router]);

  const esAdmin = session.role === "ADMIN";

  const cierres = useMemo(() => getCierres(), [cortes]);

  const cortesEnCierre = useMemo(() => {
    const set = new Set<string>();

    for (const cierre of cierres) {
      for (const id of cierre.cortesIds || []) {
        set.add(id);
      }
    }

    return set;
  }, [cierres]);

  const sucursales = useMemo(() => {
    return Array.from(
      new Set([
        ...cortes.map((c) => c.sucursalId),
        ...eliminados.map((e) => e.corte.sucursalId),
      ])
    ).sort();
  }, [cortes, eliminados]);

  const cortesFiltrados = useMemo(() => {
    return cortes.filter((c) => {
      const turno = c.turno || "GENERAL";

      const cumpleFecha = !filtroFecha || c.fecha === filtroFecha;
      const cumpleSucursal =
        filtroSucursal === "TODAS" || c.sucursalId === filtroSucursal;
      const cumpleEstado =
        filtroEstado === "TODOS" || c.status === filtroEstado;
      const cumpleTurno = filtroTurno === "TODOS" || turno === filtroTurno;

      return cumpleFecha && cumpleSucursal && cumpleEstado && cumpleTurno;
    });
  }, [cortes, filtroFecha, filtroSucursal, filtroEstado, filtroTurno]);

  const eliminadosFiltrados = useMemo(() => {
    return eliminados.filter((e) => {
      const c = e.corte;
      const turno = c.turno || "GENERAL";

      const cumpleFecha = !filtroFecha || c.fecha === filtroFecha;
      const cumpleSucursal =
        filtroSucursal === "TODAS" || c.sucursalId === filtroSucursal;
      const cumpleTurno = filtroTurno === "TODOS" || turno === filtroTurno;

      return cumpleFecha && cumpleSucursal && cumpleTurno;
    });
  }, [eliminados, filtroFecha, filtroSucursal, filtroTurno]);

  const totalFiltrado = useMemo(() => {
    return cortesFiltrados.reduce((acc, c) => acc + Number(c.total || 0), 0);
  }, [cortesFiltrados]);

  const totalEliminadoFiltrado = useMemo(() => {
    return eliminadosFiltrados.reduce(
      (acc, e) => acc + Number(e.corte.total || 0),
      0
    );
  }, [eliminadosFiltrados]);

  async function onEliminar(corte: Corte) {
    if (!esAdmin) {
      alert("Solo ADMIN puede eliminar cortes.");
      return;
    }

    if (corte.status !== "ABIERTO") {
      alert("Solo se pueden eliminar cortes abiertos.");
      return;
    }

    if (cortesEnCierre.has(corte.id)) {
      alert("No se puede eliminar: este corte ya pertenece a un cierre.");
      return;
    }

    const motivo = window.prompt(
      `Motivo de eliminación del corte:\n\nSucursal: ${
        corte.sucursalId
      }\nFecha: ${corte.fecha}\nTurno: ${
        corte.turno || "GENERAL"
      }\nTotal: ${money(corte.total)}\n\nEscribe un motivo:`
    );

    if (motivo === null) return;

    if (!motivo.trim()) {
      alert("Debes escribir un motivo para eliminar.");
      return;
    }

    const ok = window.confirm(
      `¿Seguro que deseas eliminar este corte?\n\nSucursal: ${
        corte.sucursalId
      }\nFecha: ${corte.fecha}\nTurno: ${
        corte.turno || "GENERAL"
      }\nTotal: ${money(corte.total)}\nMotivo: ${motivo}\n\nQuedará guardado en historial de eliminados.`
    );

    if (!ok) return;

    try {
      setEliminandoId(corte.id);

      await eliminarCorte({
        corteId: corte.id,
        username: session.username || "ADMIN",
        role: session.role,
        motivo,
      });

      cargarLocal();

      alert("Corte eliminado y respaldado ✅");
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "No se pudo eliminar el corte");
    } finally {
      setEliminandoId("");
    }
  }

  async function onRestaurar(item: CorteEliminado) {
    if (!esAdmin) {
      alert("Solo ADMIN puede restaurar cortes.");
      return;
    }

    const c = item.corte;

    const ok = window.confirm(
      `¿Restaurar este corte eliminado?\n\nSucursal: ${
        c.sucursalId
      }\nFecha: ${c.fecha}\nTurno: ${
        c.turno || "GENERAL"
      }\nTotal: ${money(c.total)}\n\nEl corte volverá a aparecer como ABIERTO.`
    );

    if (!ok) return;

    try {
      setRestaurandoId(item.id);

      await restaurarCorteEliminado({
        eliminadoId: item.id,
        username: session.username || "ADMIN",
        role: session.role,
      });

      cargarLocal();

      alert("Corte restaurado ✅");
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "No se pudo restaurar el corte");
    } finally {
      setRestaurandoId("");
    }
  }

  function limpiarFiltros() {
    setFiltroFecha("");
    setFiltroSucursal("TODAS");
    setFiltroEstado("TODOS");
    setFiltroTurno("TODOS");
  }

  if (loading) return null;

  return (
    <main style={pageStyle}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={topButtons}>
          <button onClick={() => router.push("/admin")} style={btn}>
            ← Volver al panel
          </button>

          <button onClick={actualizar} style={btn}>
            Actualizar
          </button>
        </div>

        <header style={hero}>
          <div>
            <div style={badge}>
              {esAdmin ? "Modo administración" : "Modo consulta"}
            </div>

            <h1 style={h1}>Administrar cortes</h1>

            <p style={subtitle}>
              Consulta cortes capturados, revisa PDFs, elimina cortes abiertos y
              recupera cortes eliminados desde historial.
            </p>
          </div>
        </header>

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

            {tab === "ACTIVOS" ? (
              <div>
                <label style={label}>Estado</label>
                <select
                  value={filtroEstado}
                  onChange={(e) => setFiltroEstado(e.target.value)}
                  style={input}
                >
                  <option value="TODOS">Todos</option>
                  <option value="ABIERTO">Abiertos</option>
                  <option value="CERRADO">Cerrados</option>
                </select>
              </div>
            ) : null}
          </div>

          <button onClick={limpiarFiltros} style={{ ...btn, marginTop: 14 }}>
            Limpiar filtros
          </button>
        </section>

        <section style={statsGrid}>
          <StatCard
            label="Cortes activos filtrados"
            value={String(cortesFiltrados.length)}
          />
          <StatCard label="Total activo filtrado" value={money(totalFiltrado)} />
          <StatCard
            label="Eliminados filtrados"
            value={String(eliminadosFiltrados.length)}
          />
          <StatCard
            label="Total eliminado filtrado"
            value={money(totalEliminadoFiltrado)}
          />
        </section>

        <section style={tabsBox}>
          <button
            onClick={() => setTab("ACTIVOS")}
            style={tab === "ACTIVOS" ? tabActive : tabBtn}
          >
            Cortes activos
          </button>

          <button
            onClick={() => setTab("ELIMINADOS")}
            style={tab === "ELIMINADOS" ? tabActive : tabBtn}
          >
            Historial eliminados
          </button>
        </section>

        {tab === "ACTIVOS" ? (
          <section style={card}>
            <h2 style={title}>Cortes capturados</h2>

            {cortesFiltrados.length === 0 ? (
              <div style={emptyBox}>No hay cortes con esos filtros.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={table}>
                  <thead>
                    <tr>
                      <th style={th}>Fecha</th>
                      <th style={th}>Sucursal</th>
                      <th style={th}>Turno</th>
                      <th style={th}>Usuario PDF</th>
                      <th style={th}>Creado por</th>
                      <th style={th}>Total</th>
                      <th style={th}>Estado</th>
                      <th style={th}>PDF</th>
                      <th style={th}>Acciones</th>
                    </tr>
                  </thead>

                  <tbody>
                    {cortesFiltrados.map((c) => {
                      const perteneceACierre = cortesEnCierre.has(c.id);
                      const puedeEliminar =
                        esAdmin && c.status === "ABIERTO" && !perteneceACierre;

                      return (
                        <tr key={c.id}>
                          <td style={td}>{c.fecha}</td>
                          <td style={td}>{c.sucursalId}</td>
                          <td style={td}>
                            <span style={turnoBadge}>{c.turno || "GENERAL"}</span>
                          </td>
                          <td style={td}>{c.usuarioPdf || "—"}</td>
                          <td style={td}>{c.createdBy || "—"}</td>
                          <td style={tdMoney}>{money(c.total)}</td>
                          <td style={td}>
                            <span
                              style={
                                c.status === "ABIERTO"
                                  ? statusOpen
                                  : statusClosed
                              }
                            >
                              {c.status}
                            </span>
                          </td>
                          <td style={td}>
                            {c.pdfDataUrl ? (
                              <button
                                type="button"
                                onClick={() =>
                                  descargarArchivo(
                                    c.pdfDataUrl,
                                    c.pdfName || "corte.pdf"
                                  )
                                }
                                style={smallBtn}
                              >
                                Ver PDF
                              </button>
                            ) : (
                              <span style={{ color: "#94a3b8" }}>Sin PDF</span>
                            )}
                          </td>
                          <td style={td}>
                            <button
                              type="button"
                              disabled={!puedeEliminar || eliminandoId === c.id}
                              onClick={() => onEliminar(c)}
                              title={
                                !esAdmin
                                  ? "Solo ADMIN puede eliminar"
                                  : c.status !== "ABIERTO"
                                  ? "Solo se eliminan cortes abiertos"
                                  : perteneceACierre
                                  ? "Este corte ya pertenece a un cierre"
                                  : "Eliminar corte"
                              }
                              style={{
                                ...deleteBtn,
                                opacity:
                                  !puedeEliminar || eliminandoId === c.id
                                    ? 0.45
                                    : 1,
                                cursor:
                                  !puedeEliminar || eliminandoId === c.id
                                    ? "not-allowed"
                                    : "pointer",
                              }}
                            >
                              {eliminandoId === c.id
                                ? "Eliminando..."
                                : "Eliminar"}
                            </button>

                            {perteneceACierre ? (
                              <div style={miniHelp}>Incluido en cierre</div>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : (
          <section style={card}>
            <h2 style={title}>Historial de cortes eliminados</h2>

            {eliminadosFiltrados.length === 0 ? (
              <div style={emptyBox}>No hay cortes eliminados con esos filtros.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={table}>
                  <thead>
                    <tr>
                      <th style={th}>Eliminado</th>
                      <th style={th}>Eliminado por</th>
                      <th style={th}>Fecha corte</th>
                      <th style={th}>Sucursal</th>
                      <th style={th}>Turno</th>
                      <th style={th}>Total</th>
                      <th style={th}>Motivo</th>
                      <th style={th}>PDF</th>
                      <th style={th}>Acciones</th>
                    </tr>
                  </thead>

                  <tbody>
                    {eliminadosFiltrados.map((item) => {
                      const c = item.corte;

                      return (
                        <tr key={item.id}>
                          <td style={td}>
                            {new Date(item.eliminadoAt).toLocaleString("es-MX")}
                          </td>
                          <td style={td}>{item.eliminadoPor || "—"}</td>
                          <td style={td}>{c.fecha}</td>
                          <td style={td}>{c.sucursalId}</td>
                          <td style={td}>
                            <span style={turnoBadge}>{c.turno || "GENERAL"}</span>
                          </td>
                          <td style={tdMoney}>{money(c.total)}</td>
                          <td style={td}>{item.motivo || "—"}</td>
                          <td style={td}>
                            {c.pdfDataUrl ? (
                              <button
                                type="button"
                                onClick={() =>
                                  descargarArchivo(
                                    c.pdfDataUrl,
                                    c.pdfName || "corte.pdf"
                                  )
                                }
                                style={smallBtn}
                              >
                                Ver PDF
                              </button>
                            ) : (
                              <span style={{ color: "#94a3b8" }}>Sin PDF</span>
                            )}
                          </td>
                          <td style={td}>
                            <button
                              type="button"
                              disabled={!esAdmin || restaurandoId === item.id}
                              onClick={() => onRestaurar(item)}
                              style={{
                                ...restoreBtn,
                                opacity:
                                  !esAdmin || restaurandoId === item.id
                                    ? 0.45
                                    : 1,
                                cursor:
                                  !esAdmin || restaurandoId === item.id
                                    ? "not-allowed"
                                    : "pointer",
                              }}
                            >
                              {restaurandoId === item.id
                                ? "Restaurando..."
                                : "Restaurar"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
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

const tabsBox: React.CSSProperties = {
  marginTop: 16,
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const tabBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 999,
  border: "1px solid #dbeafe",
  background: "white",
  color: "#312e81",
  fontWeight: 900,
  cursor: "pointer",
};

const tabActive: React.CSSProperties = {
  ...tabBtn,
  background: "#ecfeff",
  color: "#0f766e",
  border: "1px solid #99f6e4",
};

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 1050,
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
  verticalAlign: "top",
};

const tdMoney: React.CSSProperties = {
  ...td,
  textAlign: "right",
  fontWeight: 900,
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

const statusOpen: React.CSSProperties = {
  display: "inline-flex",
  padding: "4px 10px",
  borderRadius: 999,
  background: "#ecfdf5",
  color: "#166534",
  border: "1px solid #bbf7d0",
  fontWeight: 900,
  fontSize: 12,
};

const statusClosed: React.CSSProperties = {
  display: "inline-flex",
  padding: "4px 10px",
  borderRadius: 999,
  background: "#f8fafc",
  color: "#475569",
  border: "1px solid #e5e7eb",
  fontWeight: 900,
  fontSize: 12,
};

const smallBtn: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: 10,
  border: "1px solid #99f6e4",
  background: "white",
  color: "#0f766e",
  fontWeight: 900,
  cursor: "pointer",
};

const deleteBtn: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: 10,
  border: "1px solid #fecaca",
  background: "#fff1f2",
  color: "#991b1b",
  fontWeight: 900,
};

const restoreBtn: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: 10,
  border: "1px solid #bbf7d0",
  background: "#ecfdf5",
  color: "#166534",
  fontWeight: 900,
};

const miniHelp: React.CSSProperties = {
  marginTop: 6,
  fontSize: 11,
  color: "#64748b",
};

const emptyBox: React.CSSProperties = {
  padding: 12,
  borderRadius: 14,
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
  color: "#64748b",
};