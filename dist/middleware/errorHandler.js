"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
function errorHandler(err, req, res, next) {
    const code = err && err.code ? String(err.code) : "";
    if (code === "ECONNREFUSED") {
        res.status(503).json({ error: "database_unavailable", message: "Base de datos no disponible" });
        return;
    }
    res.status(500).json({ error: "internal_error", message: err?.message || "Error" });
}
