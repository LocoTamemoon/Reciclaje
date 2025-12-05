import { Request, Response, NextFunction } from "express";

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  try { console.error("error_handler", { message: String(err?.message||""), code: String(err?.code||""), name: String(err?.name||""), stack: String(err?.stack||"").slice(0,200) }); } catch {}
  const code = err && err.code ? String(err.code) : "";
  if (code === "ECONNREFUSED") {
    res.status(503).json({ error: "database_unavailable", message: "Base de datos no disponible" });
    return;
  }
  if (String(err?.message) === "delivery_min_total") {
    res.status(400).json({ error: "delivery_min_total" });
    return;
  }
  if (String(err?.message) === "delivery_cooldown") {
    const retry = Number((err as any)?.retry_after_sec || 60);
    res.status(429).json({ error: "delivery_cooldown", retry_after_sec: retry });
    return;
  }
  if (String(err?.message) === "credenciales_invalidas") {
    res.status(401).json({ error: "credenciales_invalidas" });
    return;
  }
  if (String(err?.message) === "empresa_inactiva") {
    res.status(403).json({ error: "empresa_inactiva" });
    return;
  }
  res.status(500).json({ error: "internal_error", message: err?.message || "Error" });
}
