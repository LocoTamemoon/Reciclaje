"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const env_1 = require("./config/env");
const empresas_1 = require("./routes/empresas");
const solicitudes_1 = require("./routes/solicitudes");
const resenas_1 = require("./routes/resenas");
const usuarios_1 = require("./routes/usuarios");
const errorHandler_1 = require("./middleware/errorHandler");
const auth_1 = require("./routes/auth");
const transacciones_1 = require("./routes/transacciones");
const materiales_1 = require("./routes/materiales");
const recolector_1 = require("./routes/recolector");
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use(express_1.default.static("public"));
app.get("/", (req, res) => {
    res.json({ name: "reciclaje-backend", status: "ok", endpoints: ["/api/empresas", "/api/solicitudes", "/api/resenas", "/api/usuarios"] });
});
app.use("/api/empresas", empresas_1.empresasRouter);
app.use("/api/solicitudes", solicitudes_1.solicitudesRouter);
app.use("/api/resenas", resenas_1.resenasRouter);
app.use("/api/usuarios", usuarios_1.usuariosRouter);
app.use("/api/auth", auth_1.authRouter);
app.use("/api/transacciones", transacciones_1.transaccionesRouter);
app.use("/api/materiales", materiales_1.materialesRouter);
app.use("/api/recolector", recolector_1.recolectorRouter);
app.use((req, res) => {
    res.status(404).sendFile(path_1.default.resolve("public", "404.html"));
});
app.use(errorHandler_1.errorHandler);
app.listen(env_1.env.port, () => {
    console.log(`Servidor en puerto ${env_1.env.port}`);
});
