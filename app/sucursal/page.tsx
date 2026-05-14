"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { sincronizarDesdeFirebase } from "../../lib/storage";

type Session = {
  username: string;
  email: string;
  role: "ADMIN" | "SUCURSAL";
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

export default function SucursalPage() {
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);

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

      if (!s.expiresAt) {
        cerrarSesion(router);
        return;
      }

      const expired = Date.now() > new Date(s.expiresAt).getTime();

      if (expired) {
        cerrarSesion(router);
        return;
      }

      sincronizarDesdeFirebase().catch(console.error);

      setSession(s);
    } catch (e) {
      console.error(e);
      cerrarSesion(router);
    }
  }, [router]);

  if (!session) {
    return null;
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        background: "#f6f7fb",
        fontFamily: "Arial",
      }}
    >
      <div
        style={{
          maxWidth: 900,
          margin: "0 auto",
          background: "white",
          border: "1px solid #eee",
          borderRadius: 16,
          padding: 24,
        }}
      >
        <h1 style={{ marginTop: 0 }}>Panel de sucursal</h1>

        <p style={{ color: "#555" }}>
          Usuario: <b>{session.username}</b>
        </p>

        <p style={{ marginTop: 4, color: "#888", fontSize: 13 }}>
          Sesión válida hasta:
          {" "}
          {new Date(session.expiresAt).toLocaleString()}
        </p>

        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            marginTop: 20,
          }}
        >
          <button
            onClick={() => router.push("/sucursal/nuevo")}
            style={btn}
          >
            Nuevo corte
          </button>

          <button
            onClick={() => router.push("/sucursal/cierre")}
            style={btn}
          >
            Cierre del día
          </button>

          <button
            onClick={() => cerrarSesion(router)}
            style={{
              ...btn,
              background: "#fff1f2",
              border: "1px solid #fecdd3",
            }}
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </main>
  );
}

const btn: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "white",
  cursor: "pointer",
  fontWeight: 700,
}; 