import type {
  CierreDia,
  Corte,
  CorteEliminado,
  DenominacionesMXN,
  MetodosPago,
  TurnoCierre,
} from "./types";

import {
  restCreateDoc,
  restDeleteDoc,
  restGetCollection,
  restSetDoc,
  restUpdateDoc,
} from "./firestoreRest";

/* =========================
   Helpers
========================= */

export function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn("No se pudo guardar en localStorage:", key, e);

    if (key === "cortes" || key === "cierres" || key === "cortesEliminados") {
      localStorage.removeItem(key);
    }
  }
}

function removeUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => removeUndefinedDeep(item)) as T;
  }

  if (value && typeof value === "object") {
    const out: Record<string, any> = {};

    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      if (v === undefined) continue;
      out[k] = removeUndefinedDeep(v);
    }

    return out as T;
  }

  return value;
}

/* =========================
   Utils fechas / dinero
========================= */

export function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function totalDenominacionesMXN(d: DenominacionesMXN) {
  return (
    d.b1000 * 1000 +
    d.b500 * 500 +
    d.b200 * 200 +
    d.b100 * 100 +
    d.b50 * 50 +
    d.b20 * 20 +
    d.m20 * 20 +
    d.m10 * 10 +
    d.m5 * 5 +
    d.m2 * 2 +
    d.m1 * 1 +
    d.m050 * 0.5
  );
}

/* =========================
   CORTES
========================= */

const CORTES_KEY = "cortes";
const CORTES_ELIMINADOS_KEY = "cortesEliminados";

export function getCortes(): Corte[] {
  return read<Corte[]>(CORTES_KEY, []);
}

export function getCortesEliminados(): CorteEliminado[] {
  return read<CorteEliminado[]>(CORTES_ELIMINADOS_KEY, []);
}

export async function saveCorte(corte: Corte) {
  const all = getCortes();
  all.push(corte);
  write(CORTES_KEY, all);

  const payload = removeUndefinedDeep(corte);
  await restSetDoc("cortes", corte.id, payload);
}

export function getCortesPendientes(
  sucursalId: string,
  fecha: string,
  turno?: TurnoCierre
): Corte[] {
  return getCortes().filter((c) => {
    const turnoCorte = c.turno || "GENERAL";

    return (
      c.sucursalId === sucursalId &&
      c.fecha === fecha &&
      c.status === "ABIERTO" &&
      (!turno || turnoCorte === turno)
    );
  });
}

export function cerrarCortes(ids: string[]) {
  const idSet = new Set(ids);

  const updated = getCortes().map((c) =>
    idSet.has(c.id) ? { ...c, status: "CERRADO" as const } : c
  );

  write(CORTES_KEY, updated);

  ids.forEach((id) => {
    restUpdateDoc("cortes", id, { status: "CERRADO" }).catch((e) =>
      console.error("Error cerrando corte en Firebase:", e)
    );
  });
}

export async function eliminarCorte(params: {
  corteId: string;
  username: string;
  role?: string;
  motivo?: string;
}) {
  if (params.role !== "ADMIN") {
    throw new Error("Solo ADMIN puede eliminar cortes.");
  }

  const cortes = getCortes();
  const corte = cortes.find((c) => c.id === params.corteId);

  if (!corte) {
    throw new Error("No se encontró el corte.");
  }

  if (corte.status !== "ABIERTO") {
    throw new Error("Solo se pueden eliminar cortes abiertos.");
  }

  const usadoEnCierre = getCierres().some((cierre) =>
    (cierre.cortesIds || []).includes(params.corteId)
  );

  if (usadoEnCierre) {
    throw new Error("No se puede eliminar: este corte ya pertenece a un cierre.");
  }

  const eliminado: CorteEliminado = {
    id: `deleted_${corte.id}`,
    corte,
    eliminadoPor: params.username || "ADMIN",
    eliminadoAt: new Date().toISOString(),
    motivo: params.motivo?.trim() || undefined,
  };

  const eliminados = getCortesEliminados();
  write(CORTES_ELIMINADOS_KEY, [eliminado, ...eliminados]);

  await restSetDoc(
    "cortes_eliminados",
    eliminado.id,
    removeUndefinedDeep(eliminado)
  );

  const updated = cortes.filter((c) => c.id !== params.corteId);
  write(CORTES_KEY, updated);

  await restDeleteDoc("cortes", params.corteId);

  return true;
}

export async function restaurarCorteEliminado(params: {
  eliminadoId: string;
  username: string;
  role?: string;
}) {
  if (params.role !== "ADMIN") {
    throw new Error("Solo ADMIN puede restaurar cortes.");
  }

  const eliminados = getCortesEliminados();
  const found = eliminados.find((x) => x.id === params.eliminadoId);

  if (!found) {
    throw new Error("No se encontró el corte eliminado.");
  }

  const cortes = getCortes();

  if (cortes.some((c) => c.id === found.corte.id)) {
    throw new Error("Este corte ya existe nuevamente en cortes activos.");
  }

  const corteRestaurado: Corte = {
    ...found.corte,
    status: "ABIERTO",
  };

  write(CORTES_KEY, [corteRestaurado, ...cortes]);
  await restSetDoc(
    "cortes",
    corteRestaurado.id,
    removeUndefinedDeep(corteRestaurado)
  );

  const restantes = eliminados.filter((x) => x.id !== params.eliminadoId);
  write(CORTES_ELIMINADOS_KEY, restantes);

  await restDeleteDoc("cortes_eliminados", params.eliminadoId);

  return true;
}

/* =========================
   CIERRES
========================= */

const CIERRES_KEY = "cierres";

export function getCierres(): CierreDia[] {
  return read<CierreDia[]>(CIERRES_KEY, []);
}

export async function saveCierre(cierre: CierreDia) {
  const payload = removeUndefinedDeep(cierre);

  await restCreateDoc("cierres", cierre.id, payload);

  const all = getCierres();
  all.unshift(cierre);
  write(CIERRES_KEY, all);
}

export function existeCierre(
  sucursalId: string,
  fecha: string,
  turno: TurnoCierre = "GENERAL"
) {
  return getCierres().some((c) => {
    const turnoCierre = c.turno || "GENERAL";

    return (
      c.sucursalId === sucursalId &&
      c.fecha === fecha &&
      turnoCierre === turno
    );
  });
}

export function updateCierre(cierreId: string, patch: Partial<CierreDia>) {
  const all = getCierres();

  const updated = all.map((c) => (c.id === cierreId ? { ...c, ...patch } : c));

  write(CIERRES_KEY, updated);

  const payload = removeUndefinedDeep(patch);

  restUpdateDoc("cierres", cierreId, payload).catch((e) =>
    console.error("Error actualizando cierre en Firebase:", e)
  );

  return updated.find((c) => c.id === cierreId) ?? null;
}

export function marcarCierreRevisado(params: {
  cierreId: string;
  revisado: boolean;
  username: string;
  role?: string;
}) {
  const now = new Date().toISOString();

  return updateCierre(params.cierreId, {
    revisado: params.revisado,
    revisadoBy: params.revisado ? params.username : undefined,
    revisadoRole: params.revisado ? params.role || "ADMIN" : undefined,
    revisadoAt: params.revisado ? now : undefined,
    ultimaRevisionAt: now,
  });
}

export function getUltimoCierreSucursal(sucursalId: string): CierreDia | null {
  const cierres = getCierres().filter((c) => c.sucursalId === sucursalId);

  if (cierres.length === 0) return null;

  const ordenados = [...cierres].sort((a, b) => {
    const keyA = `${a.fecha}|${a.createdAt}`;
    const keyB = `${b.fecha}|${b.createdAt}`;
    return keyA < keyB ? 1 : keyA > keyB ? -1 : 0;
  });

  return ordenados[0] ?? null;
}

export function getSaldoSobranteSucursal(sucursalId: string) {
  const ultimo = getUltimoCierreSucursal(sucursalId);
  return Number(ultimo?.saldoSobranteActual ?? 0);
}

/* =========================
   TOTALES
========================= */

export function sumMetodos(cortes: Corte[]): MetodosPago {
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

export function totalMetodos(m: MetodosPago) {
  return (
    (m.efectivo ?? 0) +
    (m.tarjeta ?? 0) +
    (m.transferencia ?? 0) +
    (m.vales ?? 0) +
    (m.otros ?? 0)
  );
}

/* =========================
   Crear cierre
========================= */

export async function crearCierre(input: {
  sucursalId: string;
  fecha: string;
  turno?: TurnoCierre;
  bolsaFinal: number;
  denominaciones?: DenominacionesMXN;
  observaciones?: string;
  createdBy: string;
  totalesPdf?: MetodosPago;
  pdfName?: string;
  pdfDataUrl?: string;
  vouchers?: {
    name: string;
    dataUrl: string;
  }[];
  saldoSobranteAnterior?: number;
}) {
  const turno = input.turno || "GENERAL";

  if (existeCierre(input.sucursalId, input.fecha, turno)) {
    throw new Error("Ya existe un cierre para esta fecha y turno");
  }

  const cortes = getCortesPendientes(input.sucursalId, input.fecha, turno);

  let totalesPorMetodo: MetodosPago = {
    efectivo: 0,
    tarjeta: 0,
    transferencia: 0,
    vales: 0,
    otros: 0,
  };

  let cortesIds: string[] = [];

  if (cortes.length > 0) {
    totalesPorMetodo = sumMetodos(cortes);
    cortesIds = cortes.map((c) => c.id);
  } else if (input.totalesPdf) {
    totalesPorMetodo = {
      efectivo: Number(input.totalesPdf.efectivo ?? 0),
      tarjeta: Number(input.totalesPdf.tarjeta ?? 0),
      transferencia: Number(input.totalesPdf.transferencia ?? 0),
      vales: Number(input.totalesPdf.vales ?? 0),
      otros: Number(input.totalesPdf.otros ?? 0),
    };
  } else {
    throw new Error("No hay cortes abiertos para cerrar");
  }

  const totalEsperado = totalMetodos(totalesPorMetodo);
  const bolsaFinal = Number(input.bolsaFinal ?? 0);

  if (!Number.isFinite(bolsaFinal) || bolsaFinal < 0) {
    throw new Error("Bolsa final inválida");
  }

  const efectivoEsperado = Number(totalesPorMetodo.efectivo ?? 0);

  const saldoSobranteAnterior = Number(
    input.saldoSobranteAnterior ?? getSaldoSobranteSucursal(input.sucursalId)
  );

  const efectivoNetoRequerido = Math.max(
    0,
    efectivoEsperado - saldoSobranteAnterior
  );

  const diferencia = bolsaFinal - efectivoNetoRequerido;
  const sobranteCorte = Math.max(0, bolsaFinal - efectivoNetoRequerido);

  const saldoSobranteActual = Math.max(
    0,
    saldoSobranteAnterior + bolsaFinal - efectivoEsperado
  );

  const LIMITE_DIF_SIN_OBS = 20;

  if (
    Math.abs(diferencia) > LIMITE_DIF_SIN_OBS &&
    !input.observaciones?.trim()
  ) {
    throw new Error(
      `Diferencia mayor a ${LIMITE_DIF_SIN_OBS} MXN: agrega observaciones`
    );
  }

  if (input.denominaciones) {
    const totalDenoms = totalDenominacionesMXN(input.denominaciones);
    const TOLERANCIA = 1;

    if (Math.abs(totalDenoms - bolsaFinal) > TOLERANCIA) {
      throw new Error("Las denominaciones no cuadran con la bolsa final");
    }
  }

  const cierreId = `${input.sucursalId}_${input.fecha}_${turno}`;

  const cierre: CierreDia = {
    id: cierreId,
    sucursalId: input.sucursalId,
    fecha: input.fecha,
    turno,
    cortesIds,
    totalesPorMetodo,
    totalEsperado,
    bolsaFinal,
    diferencia,
    bolsa: input.denominaciones
      ? {
          denominaciones: input.denominaciones,
          totalCalculado: totalDenominacionesMXN(input.denominaciones),
        }
      : undefined,
    observaciones: input.observaciones?.trim()
      ? input.observaciones.trim()
      : undefined,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
    pdfName: input.pdfName,
    pdfDataUrl: input.pdfDataUrl,
    vouchers: input.vouchers?.map((v) => ({
      name: v.name,
      dataUrl: v.dataUrl,
    })),
    revisado: false,
    saldoSobranteAnterior,
    efectivoNetoRequerido,
    sobranteCorte,
    saldoSobranteActual,
  };

  await saveCierre(cierre);

  if (cortesIds.length > 0) {
    cerrarCortes(cortesIds);
  }

  return cierre;
}

/* =========================
   Sincronizar Firebase -> localStorage
========================= */

export async function sincronizarDesdeFirebase() {
  try {
    const cierres = await restGetCollection<CierreDia>("cierres");
    const cortes = await restGetCollection<Corte>("cortes");
    const cortesEliminados =
      await restGetCollection<CorteEliminado>("cortes_eliminados");

    cierres.sort((a, b) => {
      const keyA = `${a.fecha}|${a.createdAt}`;
      const keyB = `${b.fecha}|${b.createdAt}`;
      return keyA < keyB ? 1 : keyA > keyB ? -1 : 0;
    });

    cortes.sort((a, b) => {
      const keyA = `${a.fecha}|${a.createdAt || ""}`;
      const keyB = `${b.fecha}|${b.createdAt || ""}`;
      return keyA < keyB ? 1 : keyA > keyB ? -1 : 0;
    });

    cortesEliminados.sort((a, b) => {
      const keyA = a.eliminadoAt || "";
      const keyB = b.eliminadoAt || "";
      return keyA < keyB ? 1 : keyA > keyB ? -1 : 0;
    });

    write(CIERRES_KEY, cierres);

    write(
      CORTES_KEY,
      cortes.map((c: any) => ({
        ...c,
        pdfDataUrl: undefined,
      }))
    );

    write(
      CORTES_ELIMINADOS_KEY,
      cortesEliminados.map((x: any) => ({
        ...x,
        corte: x.corte
          ? {
              ...x.corte,
              pdfDataUrl: undefined,
            }
          : x.corte,
      }))
    );

    console.log("✅ Sincronización Firebase REST completada", {
      cierres: cierres.length,
      cortes: cortes.length,
      cortesEliminados: cortesEliminados.length,
    });

    return { cierres, cortes, cortesEliminados };
  } catch (e) {
    console.error("❌ Error sincronizando Firebase REST:", e);

    return {
      cierres: getCierres(),
      cortes: getCortes(),
      cortesEliminados: getCortesEliminados(),
    };
  }
}