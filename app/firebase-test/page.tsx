"use client";

import { useState } from "react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function FirebaseTestPage() {
  const [msg, setMsg] = useState("");

  async function probarFirebase() {
    try {
      setMsg("Guardando prueba...");

      await setDoc(doc(db, "pruebas", "conexion"), {
        mensaje: "Firebase conectado correctamente",
        fecha: new Date().toISOString(),
        createdAt: serverTimestamp(),
      });

      setMsg("✅ Prueba guardada en Firebase");
    } catch (e: any) {
      console.error(e);
      setMsg("❌ Error: " + (e?.message || "No se pudo guardar"));
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "Arial" }}>
      <h1>Prueba Firebase</h1>

      <button
        onClick={probarFirebase}
        style={{
          padding: 12,
          borderRadius: 10,
          border: "1px solid #ddd",
          background: "white",
          fontWeight: 800,
          cursor: "pointer",
        }}
      >
        Probar conexión
      </button>

      <p style={{ marginTop: 16 }}>{msg}</p>
    </main>
  );
}