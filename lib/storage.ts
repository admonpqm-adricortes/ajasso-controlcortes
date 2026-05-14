import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";

import type {
  CierreDia,
  Corte,
  DenominacionesMXN,
  MetodosPago,
} from "./types";

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
  localStorage.setItem(key, JSON.stringify(value));
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

export function getCortes(): Corte[] {
  return read<Corte[]>(CORTES_KEY, []);
}

export async function saveCorte(corte: Corte) {
  const all = getCortes();
  all.push(corte);
  write(CORTES_KEY, all);

  const payload = removeUndefinedDeep(corte);
  await setDoc(doc(db, "cortes", corte.id), payload);
}

export function getCortesPendientes(
  sucursalId: string,
  fecha: string
): Corte[] {
  return getCortes().filter(
    (c) =>
      c.sucursalId === sucursalId &&
      c.fecha === fecha &&
      c.status === "ABIERTO"
  );
}

export function cerrarCortes(ids: string[]) {
  const idSet = new Set(ids);

  const updated = getCortes().map((c) =>
    idSet.has(c.id) ? { ...c, status: "CERRADO" as const } : c
  );

  write(CORTES_KEY, updated);

  ids.forEach((id) => {
    updateDoc(doc(db, "cortes", id), { status: "CERRADO" }).catch((e) =>
      console.error("Error cerrando corte en Firebase:", e)
    );
  });
}

/* =========================
   CIERRES
========================= */

const CIERRES_KEY = "cierres";

export function getCierres(): CierreDia[] {
  return read<CierreDia[]>(CIERRES_KEY, []);
}

export async function saveCierre(cierre: CierreDia) {
  const all = getCierres();
  all.unshift(cierre);
  write(CIERRES_KEY, all);

  const payload = removeUndefinedDeep(cierre);
  await setDoc(doc(db, "cierres", cierre.id), payload);
}

export function existeCierre(sucursalId: string, fecha: string) {
  return getCierres().some(
    (c) => c.sucursalId === sucursalId && c.fecha === fecha
  );
}

export function updateCierre(cierreId: string, patch: Partial<CierreDia>) {
  const all = getCierres();

  const updated = all.map((c) =>
    c.id === cierreId ? { ...c, ...patch } : c
  );

  write(CIERRES_KEY, updated);

  const payload = removeUndefinedDeep(patch);

  updateDoc(doc(db, "cierres", cierreId), payload).catch((e) =>
    console.error("Error actualizando cierre en Firebase:", e)
  );

  return updated.find((c) => c.id === cierreId) ?? null;
}

export function marcarCierreRevisado(params: {
  cierreId: string;
  revisado: boolean;
  username: string;
}) {
  const now = new Date().toISOString();

  return updateCierre(params.cierreId, {
    revisado: params.revisado,
    revisadoBy: params.revisado ? params.username : undefined,
    revisadoAt: params.revisado ? now : undefined,
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
  bolsaFinal: number;
  denominaciones?: DenominacionesMXN;
  observaciones?: string;
  createdBy: string;
  totalesPdf?: MetodosPago;
  pdfName?: string;
  pdfDataUrl?: string;
  voucherName?: string;
  voucherDataUrl?: string;
  saldoSobranteAnterior?: number;
}) {
  if (existeCierre(input.sucursalId, input.fecha)) {
    throw new Error("Ya existe un cierre para esta fecha");
  }

  const cortes = getCortesPendientes(input.sucursalId, input.fecha);

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
    !(input.observaciones?.trim())
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

  const cierre: CierreDia = {
    id: uid(),
    sucursalId: input.sucursalId,
    fecha: input.fecha,
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
    voucherName: input.voucherName,
    voucherDataUrl: input.voucherDataUrl,
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
    const cierresSnap = await getDocs(collection(db, "cierres"));
    const cortesSnap = await getDocs(collection(db, "cortes"));

    const cierres = cierresSnap.docs.map((d) => d.data() as CierreDia);
    const cortes = cortesSnap.docs.map((d) => d.data() as Corte);

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

    write(CIERRES_KEY, cierres);
    write(CORTES_KEY, cortes);

    console.log("✅ Sincronización Firebase completada", {
      cierres: cierres.length,
      cortes: cortes.length,
    });

    return { cierres, cortes };
  } catch (e) {
    console.error("❌ Error sincronizando Firebase:", e);

    return {
      cierres: getCierres(),
      cortes: getCortes(),
    };
  }
} 