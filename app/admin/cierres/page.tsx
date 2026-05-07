"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getCierres } from "../../../lib/storage";
import {
  exportarCierresExcel,
  exportarRelacionEntregaEfectivo,
} from "../../../lib/exportExcel";
import type { CierreDia, DenominacionesMXN } from "../../../lib/types";

const LIMITE_ALERTA_SOBRANTE = 100;

const money = (n: number) =>
  (Number(n) || 0).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
  });

function formatDateTime(value?: string) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("es-MX");
  } catch {
    return value;
  }
}

function number(n: number | undefined) {
  return Number(n || 0);
}

function sumarDenominaciones(
  cierres: CierreDia[]
): Record<keyof DenominacionesMXN, number> {
  const base: Record<keyof DenominacionesMXN, number> = {
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

  for (const c of cierres) {
    const d = c.bolsa?.denominaciones;
    if (!d) continue;

    base.b1000 += number(d.b1000);
    base.b500 += number(d.b500);
    base.b200 += number(d.b200);
    base.b100 += number(d.b100);
    base.b50 += number(d.b50);
    base.b20 += number(d.b20);
    base.m20 += number(d.m20);
    base.m10 += number(d.m10);
    base.m5 += number(d.m5);
    base.m2 += number(d.m2);
    base.m1 += number(d.m1);
    base.m050 += number(d.m050);
  }

  return base;
}

export default function AdminCierresPage() {
  const router = useRouter();
  const [cierres, setCierres] = useState<CierreDia[]>([]);
  const [checking, setChecking] = useState(true);

  const [filtroFecha, setFiltroFecha] = useState("");
  const [filtroSucursal, setFiltroSucursal] = useState("TODAS");
  const [filtroEstado, setFiltroEstado] = useState("TODOS");

  function cargar() {
    setCierres(getCierres());
  }

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

    cargar();
    setChecking(false);
  }, [router]);

  const sucursales = useMemo(() => {
    const unicas = Array.from(new Set(cierres.map((c) => c.sucursalId)));
    return unicas.sort();
  }, [cierres]);

  const cierresFiltrados = useMemo(() => {
    return cierres.filter((c) => {
      const cumpleFecha = !filtroFecha || c.fecha === filtroFecha;
      const cumpleSucursal =
        filtroSucursal === "TODAS" || c.sucursalId === filtroSucursal;

      let cumpleEstado = true;
      if (filtroEstado === "REVISADOS") cumpleEstado = !!c.revisado;
      if (filtroEstado === "PENDIENTES") cumpleEstado = !c.revisado;

      return cumpleFecha && cumpleSucursal && cumpleEstado;
    });
  }, [cierres, filtroFecha, filtroSucursal, filtroEstado]);

  const revisadosFiltrados = useMemo(
    () => cierresFiltrados.filter((c) => c.revisado),
    [cierresFiltrados]
  );

  const pendientesFiltrados = useMemo(
    () => cierresFiltrados.filter((c) => !c.revisado),
    [cierresFiltrados]
  );

  const totalBolsaRevisadaFiltrada = useMemo(
    () =>
      revisadosFiltrados.reduce(
        (acc, c) => acc + Number(c.bolsaFinal || 0),
        0
      ),
    [revisadosFiltrados]
  );

  const totalDiferenciaRevisadaFiltrada = useMemo(
    () =>
      revisadosFiltrados.reduce(
        (acc, c) => acc + Number(c.diferencia || 0),
        0
      ),
    [revisadosFiltrados]
  );

  const totalEsperadoFiltrado = useMemo(
    () =>
      cierresFiltrados.reduce(
        (acc, c) => acc + Number(c.totalEsperado || 0),
        0
      ),
    [cierresFiltrados]
  );

  const relacionRows = useMemo(() => {
    return cierresFiltrados.map((c) => ({
      id: c.id,
      fecha: c.fecha,
      sucursal: c.sucursalId,
      total: Number(c.totalEsperado || 0),
      tarjetas: Number(c.totalesPorMetodo?.tarjeta || 0),
      transferencias: Number(c.totalesPorMetodo?.transferencia || 0),
      vales: Number(c.totalesPorMetodo?.vales || 0),
      otros: Number(c.totalesPorMetodo?.otros || 0),
      efectivo: Number(c.totalesPorMetodo?.efectivo || 0),
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
        return acc;
      },
      {
        total: 0,
        tarjetas: 0,
        transferencias: 0,
        vales: 0,
        otros: 0,
        efectivo: 0,
      }
    );
  }, [relacionRows]);

  const resumenPorSucursal = useMemo(() => {
    const map = new Map<
      string,
      {
        sucursal: string;
        total: number;
        tarjetas: number;
        transferencias: number;
        vales: number;
        otros: number;
        efectivo: number;
      }
    >();

    for (const r of relacionRows) {
      if (!map.has(r.sucursal)) {
        map.set(r.sucursal, {
          sucursal: r.sucursal,
          total: 0,
          tarjetas: 0,
          transferencias: 0,
          vales: 0,
          otros: 0,
          efectivo: 0,
        });
      }

      const row = map.get(r.sucursal)!;
      row.total += r.total;
      row.tarjetas += r.tarjetas;
      row.transferencias += r.transferencias;
      row.vales += r.vales;
      row.otros += r.otros;
      row.efectivo += r.efectivo;
    }

    return Array.from(map.values()).sort((a, b) =>
      a.sucursal.localeCompare(b.sucursal)
    );
  }, [relacionRows]);

  const totalesResumenSucursal = useMemo(() => {
    return resumenPorSucursal.reduce(
      (acc, r) => {
        acc.total += r.total;
        acc.tarjetas += r.tarjetas;
        acc.transferencias += r.transferencias;
        acc.vales += r.vales;
        acc.otros += r.otros;
        acc.efectivo += r.efectivo;
        return acc;
      },
      {
        total: 0,
        tarjetas: 0,
        transferencias: 0,
        vales: 0,
        otros: 0,
        efectivo: 0,
      }
    );
  }, [resumenPorSucursal]);

  const sobrantesPorSucursal = useMemo(() => {
    const map: Record<string, number> = {};

    for (const c of cierres) {
      const suc = c.sucursalId;
      if (map[suc] !== undefined) continue;
      map[suc] = Number(c.saldoSobranteActual ?? c.sobranteCorte ?? 0);
    }

    return map;
  }, [cierres]);

  const totalSobrantes = useMemo(() => {
    return Object.values(sobrantesPorSucursal).reduce(
      (acc, n) => acc + n,
      0
    );
  }, [sobrantesPorSucursal]);

  const alertasSobrante = useMemo(() => {
    return Object.entries(sobrantesPorSucursal)
      .filter(([, saldo]) => Number(saldo) > LIMITE_ALERTA_SOBRANTE)
      .sort((a, b) => Number(b[1]) - Number(a[1]));
  }, [sobrantesPorSucursal]);

  const revisadosConDenoms = useMemo(
    () => cierresFiltrados.filter((c) => c.revisado && c.bolsa?.denominaciones),
    [cierresFiltrados]
  );

  const denomsEntrega = useMemo(
    () => sumarDenominaciones(revisadosConDenoms),
    [revisadosConDenoms]
  );

  const totalEntregaEfectivo = useMemo(() => {
    return (
      denomsEntrega.b1000 * 1000 +
      denomsEntrega.b500 * 500 +
      denomsEntrega.b200 * 200 +
      denomsEntrega.b100 * 100 +
      denomsEntrega.b50 * 50 +
      denomsEntrega.b20 * 20 +
      denomsEntrega.m20 * 20 +
      denomsEntrega.m10 * 10 +
      denomsEntrega.m5 * 5 +
      denomsEntrega.m2 * 2 +
      denomsEntrega.m1 * 1 +
      denomsEntrega.m050 * 0.5
    );
  }, [denomsEntrega]);

  const totalCortesEntrega = useMemo(() => {
    return revisadosConDenoms.reduce(
      (acc, c) => acc + number(c.bolsaFinal),
      0
    );
  }, [revisadosConDenoms]);

  const diferenciaEntrega = useMemo(
    () => totalEntregaEfectivo - totalCortesEntrega,
    [totalEntregaEfectivo, totalCortesEntrega]
  );

  const entregaCuadra = Math.abs(diferenciaEntrega) < 0.01;

  function limpiarFiltros() {
    setFiltroFecha("");
    setFiltroSucursal("TODAS");
    setFiltroEstado("TODOS");
  }

  if (checking) return null;

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
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        <button onClick={() => router.push("/admin")} style={btn}>
          ← Volver al panel
        </button>

        <button onClick={cargar} style={btn}>
          Actualizar
        </button>

        <button
          onClick={() => exportarCierresExcel(cierresFiltrados)}
          style={btn}
        >
          Exportar Excel
        </button>

        <button
          onClick={() => exportarRelacionEntregaEfectivo(cierresFiltrados)}
          style={btn}
        >
          Exportar entrega efectivo
        </button>
      </div>

      <h1 style={{ margin: 0 }}>Historial de cierres</h1>
      <p style={{ marginTop: 6, color: "#666" }}>
        AJASSO puede ver el total entregado y la relación de importes según
        fecha, sucursal y estado.
      </p>

      {!entregaCuadra && revisadosConDenoms.length > 0 && (
        <section
          style={{
            ...card,
            marginBottom: 20,
            border: "1px solid #fca5a5",
            background: "#fef2f2",
          }}
        >
          <div
            style={{
              fontWeight: 900,
              marginBottom: 12,
              color: "#991b1b",
            }}
          >
            ⚠️ Alerta: la entrega de efectivo no cuadra
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <div>
              Total por denominaciones: <b>{money(totalEntregaEfectivo)}</b>
            </div>
            <div>
              Total cortes (bolsa final): <b>{money(totalCortesEntrega)}</b>
            </div>
            <div>
              Diferencia: <b>{money(diferenciaEntrega)}</b>
            </div>
          </div>

          <div style={{ marginTop: 10, fontSize: 13, color: "#7f1d1d" }}>
            Revisa si alguna sucursal capturó mal las denominaciones o si la
            bolsa final no coincide con el efectivo físico enviado.
          </div>
        </section>
      )}

      {alertasSobrante.length > 0 && (
        <section
          style={{
            ...card,
            marginBottom: 20,
            border: "1px solid #fca5a5",
            background: "#fef2f2",
          }}
        >
          <div
            style={{
              fontWeight: 900,
              marginBottom: 12,
              color: "#991b1b",
            }}
          >
            ⚠️ Alerta de sobrante alto
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {alertasSobrante.map(([suc, saldo]) => (
              <div
                key={suc}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #fecaca",
                  background: "white",
                }}
              >
                <span>
                  <b>{suc}</b> tiene sobrante acumulado alto
                </span>
                <b style={{ color: "#b91c1c" }}>{money(Number(saldo))}</b>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 10, fontSize: 13, color: "#7f1d1d" }}>
            Revisa caja chica o envíos redondeados. Esta alerta aparece cuando el
            sobrante de una sucursal supera {money(LIMITE_ALERTA_SOBRANTE)}.
          </div>
        </section>
      )}

      <section style={{ ...card, marginBottom: 20 }}>
        <div style={{ fontWeight: 900, marginBottom: 12 }}>
          Sobrantes por sucursal
        </div>

        {Object.keys(sobrantesPorSucursal).length === 0 ? (
          <div style={{ color: "#666" }}>
            Aún no hay sobrantes registrados por sucursal.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {Object.entries(sobrantesPorSucursal)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([suc, saldo]) => (
                <div
                  key={suc}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: 10,
                    borderBottom: "1px solid #eee",
                  }}
                >
                  <span>{suc}</span>
                  <b
                    style={{
                      color:
                        saldo > LIMITE_ALERTA_SOBRANTE
                          ? "#b91c1c"
                          : saldo > 0
                          ? "#b45309"
                          : "#16a34a",
                    }}
                  >
                    {money(saldo)}
                  </b>
                </div>
              ))}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                paddingTop: 10,
                fontWeight: 900,
              }}
            >
              <span>TOTAL SOBRANTES</span>
              <span>{money(totalSobrantes)}</span>
            </div>
          </div>
        )}
      </section>

      <section style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontWeight: 900, marginBottom: 12 }}>Filtros</div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
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
            <label style={label}>Estado</label>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              style={input}
            >
              <option value="TODOS">Todos</option>
              <option value="REVISADOS">Solo revisados</option>
              <option value="PENDIENTES">Solo pendientes</option>
            </select>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <button onClick={limpiarFiltros} style={btn}>
            Limpiar filtros
          </button>
        </div>
      </section>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(220px, 1fr))",
          gap: 12,
          margin: "16px 0 20px 0",
        }}
      >
        <div style={card}>
          <div style={muted}>Cierres filtrados</div>
          <div style={big}>{cierresFiltrados.length}</div>
        </div>

        <div style={card}>
          <div style={muted}>Revisados filtrados</div>
          <div style={big}>{revisadosFiltrados.length}</div>
        </div>

        <div style={card}>
          <div style={muted}>Pendientes filtrados</div>
          <div style={big}>{pendientesFiltrados.length}</div>
        </div>

        <div style={card}>
          <div style={muted}>Total esperado filtrado</div>
          <div style={bigMoney}>{money(totalEsperadoFiltrado)}</div>
        </div>
      </div>

      <div style={{ ...card, marginBottom: 20 }}>
        <div style={{ fontWeight: 900, marginBottom: 6 }}>
          Total para entregar
        </div>
        <div style={{ fontSize: 28, fontWeight: 900 }}>
          {money(totalBolsaRevisadaFiltrada)}
        </div>
        <div style={{ marginTop: 8, color: "#666" }}>
          Suma de <b>bolsa final</b> de los cierres revisados según los filtros
          actuales.
        </div>
        <div style={{ marginTop: 6, color: "#666" }}>
          Diferencia acumulada revisada:{" "}
          <b>{money(totalDiferenciaRevisadaFiltrada)}</b>
        </div>
      </div>

      <section style={{ ...card, marginBottom: 20 }}>
        <div style={{ fontWeight: 900, marginBottom: 12 }}>
          Relación de entrega de efectivo
        </div>

        {revisadosConDenoms.length === 0 ? (
          <div style={{ color: "#666" }}>
            No hay cierres revisados con denominaciones capturadas para esta
            vista.
          </div>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(220px, 1fr))",
                gap: 12,
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  ...miniCard,
                  border: entregaCuadra
                    ? "2px solid #bbf7d0"
                    : "2px solid #fecaca",
                }}
              >
                <div style={muted}>Total por denominaciones</div>
                <div style={miniMoney}>{money(totalEntregaEfectivo)}</div>
              </div>

              <div style={miniCard}>
                <div style={muted}>Total cortes</div>
                <div style={miniMoney}>{money(totalCortesEntrega)}</div>
              </div>

              <div
                style={{
                  ...miniCard,
                  border: entregaCuadra
                    ? "2px solid #bbf7d0"
                    : "2px solid #fecaca",
                }}
              >
                <div style={muted}>Diferencia</div>
                <div
                  style={{
                    ...miniMoney,
                    color: entregaCuadra ? "#166534" : "#b91c1c",
                  }}
                >
                  {money(diferenciaEntrega)}
                </div>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  minWidth: 760,
                }}
              >
                <thead>
                  <tr>
                    <th style={th}>Tipo</th>
                    <th style={th}>Denominación</th>
                    <th style={th}>Cantidad</th>
                    <th style={th}>Importe</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={td}>Billete</td>
                    <td style={td}>$1000</td>
                    <td style={tdMoney}>{denomsEntrega.b1000}</td>
                    <td style={tdMoney}>{money(denomsEntrega.b1000 * 1000)}</td>
                  </tr>
                  <tr>
                    <td style={td}>Billete</td>
                    <td style={td}>$500</td>
                    <td style={tdMoney}>{denomsEntrega.b500}</td>
                    <td style={tdMoney}>{money(denomsEntrega.b500 * 500)}</td>
                  </tr>
                  <tr>
                    <td style={td}>Billete</td>
                    <td style={td}>$200</td>
                    <td style={tdMoney}>{denomsEntrega.b200}</td>
                    <td style={tdMoney}>{money(denomsEntrega.b200 * 200)}</td>
                  </tr>
                  <tr>
                    <td style={td}>Billete</td>
                    <td style={td}>$100</td>
                    <td style={tdMoney}>{denomsEntrega.b100}</td>
                    <td style={tdMoney}>{money(denomsEntrega.b100 * 100)}</td>
                  </tr>
                  <tr>
                    <td style={td}>Billete</td>
                    <td style={td}>$50</td>
                    <td style={tdMoney}>{denomsEntrega.b50}</td>
                    <td style={tdMoney}>{money(denomsEntrega.b50 * 50)}</td>
                  </tr>
                  <tr>
                    <td style={td}>Billete</td>
                    <td style={td}>$20</td>
                    <td style={tdMoney}>{denomsEntrega.b20}</td>
                    <td style={tdMoney}>{money(denomsEntrega.b20 * 20)}</td>
                  </tr>

                  <tr>
                    <td style={td}>Moneda</td>
                    <td style={td}>$20</td>
                    <td style={tdMoney}>{denomsEntrega.m20}</td>
                    <td style={tdMoney}>{money(denomsEntrega.m20 * 20)}</td>
                  </tr>
                  <tr>
                    <td style={td}>Moneda</td>
                    <td style={td}>$10</td>
                    <td style={tdMoney}>{denomsEntrega.m10}</td>
                    <td style={tdMoney}>{money(denomsEntrega.m10 * 10)}</td>
                  </tr>
                  <tr>
                    <td style={td}>Moneda</td>
                    <td style={td}>$5</td>
                    <td style={tdMoney}>{denomsEntrega.m5}</td>
                    <td style={tdMoney}>{money(denomsEntrega.m5 * 5)}</td>
                  </tr>
                  <tr>
                    <td style={td}>Moneda</td>
                    <td style={td}>$2</td>
                    <td style={tdMoney}>{denomsEntrega.m2}</td>
                    <td style={tdMoney}>{money(denomsEntrega.m2 * 2)}</td>
                  </tr>
                  <tr>
                    <td style={td}>Moneda</td>
                    <td style={td}>$1</td>
                    <td style={tdMoney}>{denomsEntrega.m1}</td>
                    <td style={tdMoney}>{money(denomsEntrega.m1 * 1)}</td>
                  </tr>
                  <tr>
                    <td style={td}>Moneda</td>
                    <td style={td}>$0.50</td>
                    <td style={tdMoney}>{denomsEntrega.m050}</td>
                    <td style={tdMoney}>{money(denomsEntrega.m050 * 0.5)}</td>
                  </tr>

                  <tr>
                    <td style={tdTotal} colSpan={3}>
                      TOTAL
                    </td>
                    <td style={tdMoneyTotal}>{money(totalEntregaEfectivo)}</td>
                  </tr>
                  <tr>
                    <td style={tdTotal} colSpan={3}>
                      TOTAL CORTES
                    </td>
                    <td style={tdMoneyTotal}>{money(totalCortesEntrega)}</td>
                  </tr>
                  <tr>
                    <td style={tdTotal} colSpan={3}>
                      DIFERENCIA
                    </td>
                    <td
                      style={{
                        ...tdMoneyTotal,
                        color: entregaCuadra ? "#166534" : "#b91c1c",
                      }}
                    >
                      {money(diferenciaEntrega)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section style={{ ...card, marginBottom: 20 }}>
        <div style={{ fontWeight: 900, marginBottom: 12 }}>
          Resumen por sucursal
        </div>

        {resumenPorSucursal.length === 0 ? (
          <div style={{ color: "#666" }}>
            No hay datos para resumir con esos filtros.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                minWidth: 980,
              }}
            >
              <thead>
                <tr>
                  <th style={th}>Sucursal</th>
                  <th style={th}>Total general</th>
                  <th style={th}>Tarjetas</th>
                  <th style={th}>Transferencias</th>
                  <th style={th}>Vales</th>
                  <th style={th}>Otros</th>
                  <th style={th}>Efectivo</th>
                </tr>
              </thead>

              <tbody>
                {resumenPorSucursal.map((r) => (
                  <tr key={r.sucursal}>
                    <td style={td}>
                      <b>{r.sucursal}</b>
                    </td>
                    <td style={tdMoney}>{money(r.total)}</td>
                    <td style={tdMoney}>{money(r.tarjetas)}</td>
                    <td style={tdMoney}>{money(r.transferencias)}</td>
                    <td style={tdMoney}>{money(r.vales)}</td>
                    <td style={tdMoney}>{money(r.otros)}</td>
                    <td style={tdMoney}>{money(r.efectivo)}</td>
                  </tr>
                ))}

                <tr>
                  <td style={tdTotal}>TOTAL GENERAL</td>
                  <td style={tdMoneyTotal}>
                    {money(totalesResumenSucursal.total)}
                  </td>
                  <td style={tdMoneyTotal}>
                    {money(totalesResumenSucursal.tarjetas)}
                  </td>
                  <td style={tdMoneyTotal}>
                    {money(totalesResumenSucursal.transferencias)}
                  </td>
                  <td style={tdMoneyTotal}>
                    {money(totalesResumenSucursal.vales)}
                  </td>
                  <td style={tdMoneyTotal}>
                    {money(totalesResumenSucursal.otros)}
                  </td>
                  <td style={tdMoneyTotal}>
                    {money(totalesResumenSucursal.efectivo)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ ...card, marginBottom: 20 }}>
        <div style={{ fontWeight: 900, marginBottom: 12 }}>
          Relación de importes
        </div>

        {relacionRows.length === 0 ? (
          <div style={{ color: "#666" }}>
            No hay cierres registrados con esos filtros.
          </div>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  minWidth: 1100,
                }}
              >
                <thead>
                  <tr>
                    <th style={th}>Fecha de corte</th>
                    <th style={th}>Sucursal</th>
                    <th style={th}>Monto total</th>
                    <th style={th}>Importes tarjetas</th>
                    <th style={th}>Importes transferencias</th>
                    <th style={th}>Importe en vales</th>
                    <th style={th}>Otros</th>
                    <th style={th}>Importe efectivo</th>
                    <th style={th}>Revisado</th>
                  </tr>
                </thead>

                <tbody>
                  {relacionRows.map((r) => (
                    <tr key={r.id}>
                      <td style={td}>{r.fecha}</td>
                      <td style={td}>{r.sucursal}</td>
                      <td style={tdMoney}>{money(r.total)}</td>
                      <td style={tdMoney}>{money(r.tarjetas)}</td>
                      <td style={tdMoney}>{money(r.transferencias)}</td>
                      <td style={tdMoney}>{money(r.vales)}</td>
                      <td style={tdMoney}>{money(r.otros)}</td>
                      <td style={tdMoney}>{money(r.efectivo)}</td>
                      <td style={td}>
                        {r.revisado
                          ? `✅ ${r.revisadoBy}${
                              r.revisadoAt
                                ? " · " + formatDateTime(r.revisadoAt)
                                : ""
                            }`
                          : "⏳ Pendiente"}
                      </td>
                    </tr>
                  ))}

                  <tr>
                    <td style={tdTotal} colSpan={2}>
                      TOTALES
                    </td>
                    <td style={tdMoneyTotal}>{money(totalesRelacion.total)}</td>
                    <td style={tdMoneyTotal}>
                      {money(totalesRelacion.tarjetas)}
                    </td>
                    <td style={tdMoneyTotal}>
                      {money(totalesRelacion.transferencias)}
                    </td>
                    <td style={tdMoneyTotal}>{money(totalesRelacion.vales)}</td>
                    <td style={tdMoneyTotal}>{money(totalesRelacion.otros)}</td>
                    <td style={tdMoneyTotal}>
                      {money(totalesRelacion.efectivo)}
                    </td>
                    <td style={tdTotal}>—</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div
              style={{
                marginTop: 14,
                display: "grid",
                gridTemplateColumns: "repeat(6, minmax(160px, 1fr))",
                gap: 12,
              }}
            >
              <div style={miniCard}>
                <div style={muted}>Total general</div>
                <div style={miniMoney}>{money(totalesRelacion.total)}</div>
              </div>

              <div style={miniCard}>
                <div style={muted}>Tarjetas</div>
                <div style={miniMoney}>{money(totalesRelacion.tarjetas)}</div>
              </div>

              <div style={miniCard}>
                <div style={muted}>Transferencias</div>
                <div style={miniMoney}>
                  {money(totalesRelacion.transferencias)}
                </div>
              </div>

              <div style={miniCard}>
                <div style={muted}>Vales</div>
                <div style={miniMoney}>{money(totalesRelacion.vales)}</div>
              </div>

              <div style={miniCard}>
                <div style={muted}>Otros</div>
                <div style={miniMoney}>{money(totalesRelacion.otros)}</div>
              </div>

              <div style={{ ...miniCard, border: "2px solid #d1fae5" }}>
                <div style={muted}>Efectivo</div>
                <div style={miniMoney}>{money(totalesRelacion.efectivo)}</div>
              </div>
            </div>
          </>
        )}
      </section>

      {cierresFiltrados.length > 0 && (
        <section style={card}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>
            Historial detallado
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {cierresFiltrados.map((c) => (
              <div
                key={c.id}
                style={{
                  background: "white",
                  border: "1px solid #eee",
                  borderRadius: 12,
                  padding: 12,
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr 1fr auto",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div>
                  <b>{c.sucursalId}</b>
                  <div style={{ fontSize: 12 }}>Fecha: {c.fecha}</div>
                  <div style={{ fontSize: 12 }}>Usuario: {c.createdBy}</div>
                  <div style={{ fontSize: 12 }}>
                    Revisión:{" "}
                    {c.revisado
                      ? `✅ ${c.revisadoBy || ""} · ${formatDateTime(
                          c.revisadoAt
                        )}`
                      : "⏳ Pendiente"}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12 }}>Total esperado</div>
                  <b>{money(c.totalEsperado)}</b>
                </div>

                <div>
                  <div style={{ fontSize: 12 }}>Bolsa final</div>
                  <b>{money(c.bolsaFinal)}</b>
                </div>

                <div>
                  <div style={{ fontSize: 12 }}>Diferencia</div>
                  <b>{money(c.diferencia)}</b>
                </div>

                <button
                  onClick={() => router.push(`/admin/cierres/${c.id}`)}
                  style={btn}
                >
                  Ver detalle
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
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

const muted: React.CSSProperties = {
  fontSize: 12,
  color: "#666",
  marginBottom: 6,
};

const big: React.CSSProperties = {
  fontSize: 30,
  fontWeight: 900,
};

const bigMoney: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 900,
};

const miniMoney: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 900,
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

const tdTotal: React.CSSProperties = {
  padding: 10,
  borderTop: "2px solid #ddd",
  fontSize: 13,
  fontWeight: 900,
  background: "#fafafa",
};

const tdMoneyTotal: React.CSSProperties = {
  padding: 10,
  borderTop: "2px solid #ddd",
  fontSize: 13,
  fontWeight: 900,
  background: "#fafafa",
  textAlign: "right",
  whiteSpace: "nowrap",
};