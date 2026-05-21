"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCortes, getCierres, sincronizarDesdeFirebase } from "../../lib/storage";

type Role = "ADMIN" | "SUPERVISOR" | "SUCURSAL";

type Session = {
  username: string;
  email: string;
  role: Role;
  sucursalId?: string;
  localId: string;
  loginAt: string;
  expiresAt: string;
};

function cerrarSesion(router: ReturnType<typeof useRouter>) {
  localStorage.removeItem("session");
  localStorage.removeItem("firebaseToken");
  localStorage.removeItem("firebaseRefreshToken");

  router.replace("/acceso");
}

function formatDateLong(date = new Date()) {
  return date.toLocaleDateString("es-MX", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function SucursalPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [cortesPendientes, setCortesPendientes] = useState(0);
  const [cierresSucursal, setCierresSucursal] = useState(0);

  function calcularResumen(s: Session) {
    const cortes = getCortes().filter(
      (c) => c.sucursalId === s.sucursalId && c.status === "ABIERTO"
    );

    const cierres = getCierres().filter((c) => c.sucursalId === s.sucursalId);

    setCortesPendientes(cortes.length);
    setCierresSucursal(cierres.length);
  }

  useEffect(() => {
    const raw = localStorage.getItem("session");

    if (!raw) {
      router.replace("/acceso");
      return;
    }

    try {
      const s = JSON.parse(raw) as Session;

      if (s.role !== "SUCURSAL") {
        router.replace("/admin");
        return;
      }

      if (!s.sucursalId) {
        cerrarSesion(router);
        return;
      }

      if (!s.expiresAt) {
        cerrarSesion(router);
        return;
      }

      const expired = Date.now() > new Date(s.expiresAt).getTime();

      if (expired) {
        cerrarSesion(router);
        return;
      }

      setSession(s);

      sincronizarDesdeFirebase()
        .then(() => calcularResumen(s))
        .catch((e) => {
          console.error(e);
          calcularResumen(s);
        });
    } catch (e) {
      console.error(e);
      cerrarSesion(router);
    }
  }, [router]);

  if (!session) return null;

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        background:
          "linear-gradient(135deg, #e6fffb 0%, #f5f3ff 48%, #ffffff 100%)",
        fontFamily: "Arial",
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <header
          style={{
            background: "rgba(255,255,255,0.95)",
            border: "1px solid #dbeafe",
            borderRadius: 24,
            padding: 22,
            boxShadow: "0 18px 40px rgba(31, 41, 55, 0.10)",
            display: "grid",
            gridTemplateColumns: "180px 1fr",
            gap: 20,
            alignItems: "center",
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: 18,
              padding: 12,
              border: "1px solid #eef2ff",
              display: "grid",
              placeItems: "center",
            }}
          >
            <img
              src="/logotipo-proquimed.png"
              alt="PROQUIMED Laboratorio Clínico"
              style={{
                width: "100%",
                maxWidth: 160,
                height: "auto",
                objectFit: "contain",
              }}
            />
          </div>

          <div>
            <div
              style={{
                display: "inline-flex",
                padding: "6px 12px",
                borderRadius: 999,
                background: "#ecfeff",
                color: "#0f766e",
                border: "1px solid #99f6e4",
                fontWeight: 900,
                fontSize: 13,
                marginBottom: 10,
              }}
            >
              Panel de sucursal
            </div>

            <h1
              style={{
                margin: 0,
                fontSize: 36,
                color: "#312e81",
                lineHeight: 1.05,
              }}
            >
              {session.sucursalId}
            </h1>

            <p style={{ margin: "8px 0 0", color: "#4b5563", fontSize: 16 }}>
              {formatDateLong()} · Bienvenida <b>{session.username}</b>
            </p>
          </div>
        </header>

        <section
          style={{
            marginTop: 18,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          <InfoCard label="Usuario" value={session.username} />
          <InfoCard label="Sucursal asignada" value={session.sucursalId || "—"} />
          <InfoCard
            label="Sesión válida hasta"
            value={new Date(session.expiresAt).toLocaleString()}
          />
        </section>

        <section
          style={{
            marginTop: 18,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          <StatCard
            label="Cortes pendientes"
            value={String(cortesPendientes)}
            help="Cortes abiertos por cerrar"
          />
          <StatCard
            label="Cierres registrados"
            value={String(cierresSucursal)}
            help="Historial de esta sucursal"
          />
        </section>

        <section
          style={{
            marginTop: 22,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
            gap: 16,
          }}
        >
          <button onClick={() => router.push("/sucursal/nuevo")} style={actionCard}>
            <span style={iconBubble}>🧾</span>
            <span>
              <strong>Nuevo corte</strong>
              <small>Captura manual para contingencias</small>
            </span>
          </button>

          <button onClick={() => router.push("/sucursal/cierre")} style={actionCard}>
            <span style={{ ...iconBubble, background: "#f5f3ff", color: "#4338ca" }}>
              💼
            </span>
            <span>
              <strong>Cierre del día</strong>
              <small>PDF, voucher, bolsa y denominaciones</small>
            </span>
          </button>

          <button
            onClick={() => cerrarSesion(router)}
            style={{
              ...actionCard,
              border: "1px solid #fecaca",
              background: "#fff1f2",
            }}
          >
            <span
              style={{
                ...iconBubble,
                background: "#fee2e2",
                color: "#991b1b",
              }}
            >
              🚪
            </span>
            <span>
              <strong>Cerrar sesión</strong>
              <small>Salir de forma segura</small>
            </span>
          </button>
        </section>
      </div>
    </main>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.92)",
        border: "1px solid #e0e7ff",
        borderRadius: 18,
        padding: 16,
        boxShadow: "0 10px 24px rgba(31, 41, 55, 0.07)",
      }}
    >
      <div style={{ color: "#64748b", fontSize: 13, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ color: "#312e81", fontWeight: 900, fontSize: 16 }}>
        {value}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  help,
}: {
  label: string;
  value: string;
  help: string;
}) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.95)",
        border: "1px solid #ccfbf1",
        borderRadius: 22,
        padding: 18,
        boxShadow: "0 14px 30px rgba(31, 41, 55, 0.08)",
      }}
    >
      <div style={{ color: "#0f766e", fontWeight: 900, fontSize: 13 }}>
        {label}
      </div>
      <div style={{ color: "#312e81", fontWeight: 900, fontSize: 38 }}>
        {value}
      </div>
      <div style={{ color: "#64748b", fontSize: 13 }}>{help}</div>
    </div>
  );
}

const actionCard: React.CSSProperties = {
  minHeight: 120,
  borderRadius: 22,
  border: "1px solid #dbeafe",
  background: "rgba(255,255,255,0.95)",
  boxShadow: "0 14px 30px rgba(31, 41, 55, 0.09)",
  padding: 18,
  cursor: "pointer",
  display: "flex",
  gap: 14,
  alignItems: "center",
  textAlign: "left",
  color: "#312e81",
};

const iconBubble: React.CSSProperties = {
  width: 46,
  height: 46,
  borderRadius: 16,
  background: "#ecfeff",
  color: "#0f766e",
  display: "grid",
  placeItems: "center",
  fontSize: 24,
  flexShrink: 0,
};