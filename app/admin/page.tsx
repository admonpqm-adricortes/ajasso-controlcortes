"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { sincronizarDesdeFirebase } from "../../lib/storage";

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

export default function AdminPage() {
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

      if (s.role !== "ADMIN" && s.role !== "SUPERVISOR") {
        router.replace("/sucursal");
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
      sincronizarDesdeFirebase().catch(console.error);
    } catch (e) {
      console.error(e);
      cerrarSesion(router);
    }
  }, [router]);

  if (!session) return null;

  const esSupervisor = session.role === "SUPERVISOR";

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#f6f7fb",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 600,
          background: "white",
          padding: 24,
          borderRadius: 16,
          border: "1px solid #eee",
        }}
      >
        <h1 style={{ margin: 0 }}>
          {esSupervisor ? "Panel SUPERVISOR" : "Panel ADMIN"}
        </h1>

        <p style={{ marginTop: 8, color: "#555" }}>
          Bienvenido {session.username} 👋
        </p>

        <p style={{ marginTop: 4, color: "#888", fontSize: 13 }}>
          Rol: <b>{session.role}</b>
        </p>

        <p style={{ marginTop: 4, color: "#888", fontSize: 13 }}>
          Sesión válida hasta: {new Date(session.expiresAt).toLocaleString()}
        </p>

        {esSupervisor ? (
          <div
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 12,
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              color: "#1e3a8a",
              fontSize: 14,
            }}
          >
            Modo supervisión: acceso de consulta y revisión.
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gap: 12,
            marginTop: 20,
          }}
        >
          <button onClick={() => router.push("/admin/cierres")} style={btn}>
            📊 Ver cierres
          </button>

          <button
            onClick={() => router.push("/admin/conciliacion")}
            style={btn}
          >
            🧾 Conciliación bancaria
          </button>

          <button
            onClick={() => cerrarSesion(router)}
            style={{
              ...btn,
              background: "#fee2e2",
              border: "1px solid #fecaca",
            }}
          >
            🚪 Cerrar sesión
          </button>
        </div>
      </div>
    </main>
  );
}

const btn: React.CSSProperties = {
  padding: 14,
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "white",
  fontWeight: 800,
  cursor: "pointer",
};