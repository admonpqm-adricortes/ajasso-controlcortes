export type Role = "ADMIN" | "SUPERVISOR" | "SUCURSAL";

export type TurnoCierre = "GENERAL" | "MATUTINO" | "VESPERTINO";

export type Session = {
  username: string;
  role: Role;
  email?: string;
  sucursalId?: string;
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
  fecha: string;
  turno?: TurnoCierre;
  metodos: MetodosPago;
  total: number;
  status: "ABIERTO" | "CERRADO";
  createdAt: string;
  createdBy: string;

  origen?: "PDF" | "MANUAL";
  pdfName?: string;
  pdfDataUrl?: string;
  usuarioPdf?: string;
  uploadedByEmail?: string;
};

export type CorteEliminado = {
  id: string;
  corte: Corte;
  eliminadoPor: string;
  eliminadoAt: string;
  motivo?: string;
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

export type DatosTerminal = {
  importeTerminal?: number;
  afiliacion?: string;
  observacionDiferencia?: string;
};

export type CierreDia = {
  id: string;
  sucursalId: string;
  fecha: string;
  turno?: TurnoCierre;
  cortesIds: string[];
  totalesPorMetodo: MetodosPago;
  totalEsperado: number;
  bolsaFinal: number;
  diferencia: number;
  bolsa?: BolsaFinal;
  observaciones?: string;
  createdAt: string;
  createdBy: string;

  datosTerminal?: DatosTerminal;

  pdfName?: string;
  pdfDataUrl?: string;

  vouchers?: {
    name: string;
    dataUrl: string;
  }[];

  revisado: boolean;
  revisadoBy?: string;
  revisadoAt?: string;
  revisadoRole?: string;
  ultimaRevisionAt?: string;

  saldoSobranteAnterior?: number;
  efectivoNetoRequerido?: number;
  sobranteCorte?: number;
  saldoSobranteActual?: number;
};