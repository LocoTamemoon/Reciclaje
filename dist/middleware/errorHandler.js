"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
function errorHandler(err, req, res, next) {
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
        const retry = Number(err?.retry_after_sec || 60);
        res.status(429).json({ error: "delivery_cooldown", retry_after_sec: retry });
        return;
    }
    res.status(500).json({ error: "internal_error", message: err?.message || "Error" });
}
