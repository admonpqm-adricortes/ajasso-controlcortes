export type Role = "ADMIN" | "SUCURSAL";

export type Session = {
  username: string;
  role: Role;
};

export type MetodosPago = {
  efectivo?: number;
  tarjeta?: number;
  transferencia?: number;
  vales?: number;
  otros?: number;
};

export type Corte = {
  id: string;
  sucursalId: string;
  fecha: string; // YYYY-MM-DD
  metodos: MetodosPago;
  total: number;
  status: "ABIERTO" | "CERRADO";
  createdAt: string;
  createdBy: string;
};

export type DenominacionesMXN = {
  b1000: number;
  b500: number;
  b200: number;
  b100: number;
  b50: number;
  b20: number;
  m20: number;
  m10: number;
  m5: number;
  m2: number;
  m1: number;
  m050: number;
};

export type BolsaFinal = {
  denominaciones?: DenominacionesMXN;
  totalCalculado?: number;
};

export type CierreDia = {
  id: string;
  sucursalId: string;
  fecha: string;
  cortesIds: string[];
  totalesPorMetodo: MetodosPago;
  totalEsperado: number;
  bolsaFinal: number;
  diferencia: number;
  bolsa?: BolsaFinal;
  observaciones?: string;
  createdAt: string;
  createdBy: string;

  pdfName?: string;
  pdfDataUrl?: string;

  // NUEVO: voucher terminal
  voucherName?: string;
  voucherDataUrl?: string;

  revisado?: boolean;
  revisadoBy?: string;
  revisadoAt?: string;

  saldoSobranteAnterior?: number;
  efectivoNetoRequerido?: number;
  sobranteCorte?: number;
  saldoSobranteActual?: number;
};