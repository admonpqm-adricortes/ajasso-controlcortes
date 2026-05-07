// lib/corteParser.ts

export type TotalesPDF = {
  efectivo: number
  tarjeta: number
  transferencia: number
  vales: number
  otros: number
  total: number
}

function parseMoney(value: string): number {
  const cleaned = value.replace(/\$/g, "").replace(/,/g, "").trim()
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

function isMoney(line: string) {
  return /\$[\d,]+\.\d{2}/.test(line)
}

export function parseTotalesDesdePdfText(rawText: string): TotalesPDF {

  const lines = rawText
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean)

  const moneyLines = lines
    .filter(l => isMoney(l))
    .map(l => parseMoney(l))

  console.log("MONEY LINES:", moneyLines)

  const result: TotalesPDF = {
    efectivo: 0,
    tarjeta: 0,
    transferencia: 0,
    vales: 0,
    otros: 0,
    total: 0
  }

  // buscamos el bloque final (últimos montos)
  const last = moneyLines.slice(-8)

  if (last.length >= 8) {

    const [
      efectivoInicial,
      efectivo,
      credito,
      debito,
      cheque,
      transferencia,
      vales,
      total
    ] = last

    result.efectivo = efectivo
    result.tarjeta = credito + debito
    result.transferencia = transferencia
    result.vales = vales
    result.otros = cheque
    result.total = total
  }

  console.log("RESULT:", result)

  return result
}