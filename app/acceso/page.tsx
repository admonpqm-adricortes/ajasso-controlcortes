"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { firebaseConfig } from "../../lib/firebase";

type Session = {
  username: string;
  email: string;
  role: "ADMIN" | "SUCURSAL";
  localId: string;
  loginAt: string;
  expiresAt: string;
};

function roleFromEmail(email: string): Session["role"] {
  const e = email.trim().toLowerCase();

  if (e === "admin@ajasso.com") return "ADMIN";
  if (e === "medmat@ajasso.com") return "SUCURSAL";

  throw new Error("Usuario sin rol asignado");
}

function usernameFromEmail(email: string) {
  const e = email.trim().toLowerCase();

  if (e === "admin@ajasso.com") return "AJASSO";
  if (e === "medmat@ajasso.com") return "MEDMAT";

  return email;
}

function mensajeAmigable(error: string) {
  if (error.includes("INVALID_LOGIN_CREDENTIALS")) {
    return "Correo o contraseña incorrectos";
  }

  if (error.includes("EMAIL_NOT_FOUND")) {
    return "El correo no está registrado";
  }

  if (error.includes("INVALID_PASSWORD")) {
    return "La contraseña es incorrecta";
  }

  if (error.includes("USER_DISABLED")) {
    return "Este usuario está deshabilitado";
  }

  if (error.includes("TOO_MANY_ATTEMPTS_TRY_LATER")) {
    return "Demasiados intentos. Intenta más tarde";
  }

  return "No se pudo iniciar sesión";
}

async function loginFirebase(email: string, password: string) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseConfig.apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error("ERROR FIREBASE LOGIN:", data);
    throw new Error(data?.error?.message || "Login inválido");
  }

  return data as {
    email: string;
    idToken: string;
    refreshToken: string;
    localId: string;
    expiresIn: string;
  };
}

export default function AccesoPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setMsg("");
      setLoading(true);

      const cleanEmail = email.trim().toLowerCase();
      const cleanPassword = password.trim();

      if (!cleanEmail || !cleanPassword) {
        throw new Error("Ingresa correo y contraseña");
      }

      const user = await loginFirebase(cleanEmail, cleanPassword);

      const role = roleFromEmail(user.email);
      const username = usernameFromEmail(user.email);

      const now = Date.now();
      const expiresInMs = Number(user.expiresIn || 3600) * 1000;

      const session: Session = {
        username,
        email: user.email,
        role,
        localId: user.localId,
        loginAt: new Date(now).toISOString(),
        expiresAt: new Date(now + expiresInMs).toISOString(),
      };

      localStorage.setItem("session", JSON.stringify(session));
      localStorage.setItem("firebaseToken", user.idToken);
      localStorage.setItem("firebaseRefreshToken", user.refreshToken);

      if (role === "ADMIN") {
        router.replace("/admin");
        return;
      }

      router.replace("/sucursal");
    } catch (e: any) {
      console.error(e);
      setMsg(mensajeAmigable(e?.message || ""));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "#f6f7fb",
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
          Ingresa con tu correo y contraseña autorizados.
        </p>

        <form
          onSubmit={onSubmit}
          style={{ display: "grid", gap: 12, marginTop: 16 }}
        >
          <label style={{ fontWeight: 700 }}>Correo</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@ajasso.com"
            type="email"
            autoComplete="email"
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
            placeholder="Contraseña"
            type="password"
            autoComplete="current-password"
            style={{
              padding: 12,
              borderRadius: 10,
              border: "1px solid #ddd",
            }}
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 8,
              padding: 12,
              borderRadius: 10,
              border: "1px solid #111",
              background: loading ? "#6b7280" : "#111827",
              color: "white",
              fontWeight: 800,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Ingresando..." : "Entrar"}
          </button>

          {msg ? <p style={{ color: "crimson", margin: 0 }}>{msg}</p> : null}
        </form>
      </div>
    </main>
  );
} 