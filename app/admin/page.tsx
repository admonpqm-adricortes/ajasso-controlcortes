"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { sincronizarDesdeFirebase } from "../../lib/storage";

export default function AdminPage() {
  const router = useRouter();

  useEffect(() => {
    const raw = localStorage.getItem("session");

    if (!raw) {
      router.replace("/acceso");
      return;
    }

    const s = JSON.parse(raw);

    if (s.role !== "ADMIN") {
      router.replace("/sucursal");
      return;
    }

    sincronizarDesdeFirebase().catch(console.error);
  }, [router]);

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
        <h1 style={{ margin: 0 }}>Panel ADMIN</h1>

        <p style={{ marginTop: 8, color: "#555" }}>
          Bienvenido AJASSO 👋
        </p>

        <div
          style={{
            display: "grid",
            gap: 12,
            marginTop: 20,
          }}
        >
          <button
            onClick={() => router.push("/admin/cierres")}
            style={btn}
          >
            📊 Ver cierres
          </button>

          <button
            onClick={() => router.push("/admin/conciliacion")}
            style={btn}
          >
            🧾 Conciliación bancaria
          </button>

          <button
            onClick={() => {
              localStorage.removeItem("session");
              router.replace("/acceso");
            }}
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