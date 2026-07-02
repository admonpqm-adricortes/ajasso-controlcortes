"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { firebaseConfig } from "../../lib/firebase";

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

function configFromEmail(email: string): {
  username: string;
  role: Role;
  sucursalId?: string;
} {
  const e = email.trim().toLowerCase();

  if (e === "ingresos@proquimed.com.mx") {
    return { username: "AJASSO", role: "ADMIN" };
  }

  if (e === "tesoreria@proquimed.com.mx") {
    return { username: "TESORERIA", role: "SUPERVISOR" };
  }

  if (e === "contabilidad@proquimed.com.mx") {
    return { username: "CONTABILIDAD", role: "SUPERVISOR" };
  }

  if (e === "sucesor.navarro@proquimed.com.mx") {
    return { username: "AUDITORIA", role: "SUPERVISOR" };
  }

  if (e === "sucursal.mc@proquimed.com.mx") {
    return {
      username: "MEDICA CAMPESTRE",
      role: "SUCURSAL",
      sucursalId: "M-MEDICA CAMPESTRE",
    };
  }

  if (e === "sucursal.puntadeleste@proquimed.com.mx") {
    return {
      username: "PUNTA DEL ESTE",
      role: "SUCURSAL",
      sucursalId: "P-PUNTA DEL ESTE",
    };
  }

  if (e === "sucursal.torre2@proquimed.com.mx") {
    return {
      username: "TORRE II",
      role: "SUCURSAL",
      sucursalId: "D-TORRE II",
    };
  }
  
  if (e === "servicioalcliente2@proquimed.com.mx") {
    return {
      username: "SALUD OCUPACIONAL",
      role: "SUCURSAL",
      sucursalId: "K-SALUD OCUPACIONAL",
    };
  } 

  if (e === "sucursal.brisas@proquimed.com.mx") {
    return {
      username: "BRISAS",
      role: "SUCURSAL",
      sucursalId: "H-BRISAS",
    };
  }
  
  if (e === "sucursal.arbide@proquimed.com.mx") {
    return {
      username: "ARBIDE",
      role: "SUCURSAL",
      sucursalId: "I-ARBIDE",
    };
  }
  
  if (e === "sucursal.centro@proquimed.com.mx") {
    return {
      username: "CENTRO",
      role: "SUCURSAL",
      sucursalId: "L-CENTRO",
    };
  }
  
  if (e === "sucursal.romita@proquimed.com.mx") {
    return {
      username: "ROMITA",
      role: "SUCURSAL",
      sucursalId: "R-ROMITA",
    };
  } 

  throw new Error("Usuario sin rol asignado");
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

  if (error.includes("Usuario sin rol asignado")) {
    return "Este usuario no tiene permisos asignados";
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
      const userConfig = configFromEmail(user.email);

      const now = Date.now();
      const expiresInMs = Number(user.expiresIn || 3600) * 1000;

      const session: Session = {
        username: userConfig.username,
        email: user.email,
        role: userConfig.role,
        sucursalId: userConfig.sucursalId,
        localId: user.localId,
        loginAt: new Date(now).toISOString(),
        expiresAt: new Date(now + expiresInMs).toISOString(),
      };

      localStorage.setItem("session", JSON.stringify(session));
      localStorage.setItem("firebaseToken", user.idToken);
      localStorage.setItem("firebaseRefreshToken", user.refreshToken);

      if (session.role === "ADMIN" || session.role === "SUPERVISOR") {
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
        background:
          "linear-gradient(135deg, #e6fffb 0%, #f5f3ff 45%, #ffffff 100%)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 560,
          background: "rgba(255,255,255,0.94)",
          padding: 30,
          borderRadius: 24,
          border: "1px solid #dbeafe",
          boxShadow: "0 18px 45px rgba(31, 41, 55, 0.12)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <img
            src="/logotipo-proquimed.png"
            alt="PROQUIMED Laboratorio Clínico"
            style={{
              width: "100%",
              maxWidth: 300,
              height: "auto",
              objectFit: "contain",
              marginBottom: 14,
            }}
          />

          <div
            style={{
              display: "inline-flex",
              padding: "6px 12px",
              borderRadius: 999,
              background: "#ecfeff",
              color: "#0f766e",
              border: "1px solid #99f6e4",
              fontWeight: 800,
              fontSize: 13,
            }}
          >
            Sistema de control de cortes
          </div>
        </div>

        <h1
          style={{
            margin: 0,
            color: "#312e81",
            fontSize: 34,
            textAlign: "center",
          }}
        >
          Acceso
        </h1>

        <p
          style={{
            marginTop: 8,
            color: "#4b5563",
            textAlign: "center",
            fontSize: 16,
          }}
        >
          Ingresa con tu correo institucional y contraseña.
        </p>

        <form
          onSubmit={onSubmit}
          style={{ display: "grid", gap: 13, marginTop: 22 }}
        >
          <label style={{ fontWeight: 800, color: "#312e81" }}>Correo</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="usuario@proquimed.com.mx"
            type="email"
            autoComplete="email"
            style={inputStyle}
          />

          <label style={{ fontWeight: 800, color: "#312e81" }}>
            Contraseña
          </label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
            type="password"
            autoComplete="current-password"
            style={inputStyle}
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 10,
              padding: 14,
              borderRadius: 14,
              border: "none",
              background: loading
                ? "#94a3b8"
                : "linear-gradient(90deg, #0d9488, #4338ca)",
              color: "white",
              fontWeight: 900,
              fontSize: 16,
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: "0 10px 20px rgba(13, 148, 136, 0.22)",
            }}
          >
            {loading ? "Ingresando..." : "Entrar"}
          </button>

          {msg ? (
            <p
              style={{
                color: "#be123c",
                background: "#fff1f2",
                border: "1px solid #fecdd3",
                padding: 10,
                borderRadius: 12,
                margin: 0,
                fontWeight: 700,
              }}
            >
              {msg}
            </p>
          ) : null}
        </form>
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: 13,
  borderRadius: 13,
  border: "1px solid #cbd5e1",
  background: "#f8fafc",
  outlineColor: "#14b8a6",
  fontSize: 15,
};