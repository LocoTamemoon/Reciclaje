import { Request, Response, NextFunction } from "express";

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  const code = err && err.code ? String(err.code) : "";
  if (code === "ECONNREFUSED") {
    res.status(503).json({ error: "database_unavailable", message: "Base de datos no disponible" });
    return;
  }
  res.status(500).json({ error: "internal_error", message: err?.message || "Error" });
}