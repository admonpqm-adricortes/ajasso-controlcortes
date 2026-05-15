import { firebaseConfig } from "./firebase";

const BASE_URL = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;

function getToken() {
  const token = localStorage.getItem("firebaseToken");
  if (!token) {
    throw new Error("Sesión Firebase no válida. Vuelve a iniciar sesión.");
  }
  return token;
}

function toFirestoreValue(value: any): any {
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };

  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: value }
      : { doubleValue: value };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(toFirestoreValue),
      },
    };
  }

  if (typeof value === "object") {
    return {
      mapValue: {
        fields: toFirestoreFields(value),
      },
    };
  }

  return { stringValue: String(value) };
}

function fromFirestoreValue(value: any): any {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;

  if ("arrayValue" in value) {
    return (value.arrayValue.values || []).map(fromFirestoreValue);
  }

  if ("mapValue" in value) {
    return fromFirestoreFields(value.mapValue.fields || {});
  }

  return undefined;
}

function toFirestoreFields(data: any) {
  return Object.fromEntries(
    Object.entries(data || {})
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, toFirestoreValue(v)])
  );
}

function fromFirestoreFields(fields: any) {
  return Object.fromEntries(
    Object.entries(fields || {}).map(([k, v]) => [k, fromFirestoreValue(v)])
  );
}

export async function restSetDoc(collection: string, id: string, data: any) {
  const token = getToken();

  const res = await fetch(`${BASE_URL}/${collection}/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      fields: toFirestoreFields(data),
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Firebase no permitió guardar: ${error}`);
  }
}

export async function restUpdateDoc(collection: string, id: string, data: any) {
  const token = getToken();

  const cleanData = Object.fromEntries(
    Object.entries(data || {}).filter(([, v]) => v !== undefined)
  );

  const updateMask = Object.keys(cleanData)
    .map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`)
    .join("&");

  const res = await fetch(`${BASE_URL}/${collection}/${id}?${updateMask}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      fields: toFirestoreFields(cleanData),
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Firebase no permitió actualizar: ${error}`);
  }
}

export async function restGetCollection<T>(collection: string): Promise<T[]> {
  const token = getToken();

  const res = await fetch(`${BASE_URL}/${collection}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Firebase no permitió leer: ${error}`);
  }

  const json = await res.json();

  return (json.documents || []).map((doc: any) =>
    fromFirestoreFields(doc.fields || {})
  ) as T[];
}