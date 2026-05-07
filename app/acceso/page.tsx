"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Session = { username: string; role: "ADMIN" | "SUCURSAL" };

export default function AccesoPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string>("");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const u = username.trim().toUpperCase();
    const p = password.trim();

    if (u === "AJASSO" && p === "1234") {
      const session: Session = { username: u, role: "ADMIN" };
      localStorage.setItem("session", JSON.stringify(session));
      router.replace("/admin");
      return;
    }

    if (u === "MEDMAT" && p === "1234") {
      const session: Session = { username: u, role: "SUCURSAL" };
      localStorage.setItem("session", JSON.stringify(session));
      router.replace("/sucursal");
      return;
    }

    setMsg("Usuario o contraseña incorrectos");
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          background: "white",
          padding: 24,
          borderRadius: 16,
          border: "1px solid #eee",
        }}
      >
        <h1 style={{ margin: 0 }}>Acceso</h1>

        <p style={{ marginTop: 8, color: "#555" }}>
          Demo: <b>AJASSO / 1234</b> (Admin) — <b>MEDMAT / 1234</b> (Sucursal)
        </p>

        <form
          onSubmit={onSubmit}
          style={{ display: "grid", gap: 12, marginTop: 16 }}
        >
          <label style={{ fontWeight: 700 }}>Usuario</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="AJASSO o MEDMAT"
            style={{
              padding: 12,
              borderRadius: 10,
              border: "1px solid #ddd",
            }}
          />

          <label style={{ fontWeight: 700 }}>Contraseña</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="1234"
            type="password"
            style={{
              padding: 12,
              borderRadius: 10,
              border: "1px solid #ddd",
            }}
          />

          <button
            type="submit"
            style={{
              marginTop: 8,
              padding: 12,
              borderRadius: 10,
              border: "1px solid #111",
              background: "#111827",
              color: "white",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Entrar
          </button>

          {msg ? <p style={{ color: "crimson", margin: 0 }}>{msg}</p> : null}
        </form>
      </div>
    </main>
  );
}