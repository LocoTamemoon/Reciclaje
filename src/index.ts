import express from "express";
import path from "path";
import { env } from "./config/env";
import { empresasRouter } from "./routes/empresas";
import { solicitudesRouter } from "./routes/solicitudes";
import { resenasRouter } from "./routes/resenas";
import { usuariosRouter } from "./routes/usuarios";
import { errorHandler } from "./middleware/errorHandler";
import { authRouter } from "./routes/auth";
import { transaccionesRouter } from "./routes/transacciones";
import { materialesRouter } from "./routes/materiales";
import { recolectorRouter } from "./routes/recolector";

const app = express();
app.use(express.json());
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.json({ name: "reciclaje-backend", status: "ok", endpoints: ["/api/empresas", "/api/solicitudes", "/api/resenas", "/api/usuarios"] });
});

app.use("/api/empresas", empresasRouter);
app.use("/api/solicitudes", solicitudesRouter);
app.use("/api/resenas", resenasRouter);
app.use("/api/usuarios", usuariosRouter);
app.use("/api/auth", authRouter);
app.use("/api/transacciones", transaccionesRouter);
app.use("/api/materiales", materialesRouter);
app.use("/api/recolector", recolectorRouter);

app.use((req, res) => {
  res.status(404).sendFile(path.resolve("public", "404.html"));
});

app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`Servidor en puerto ${env.port}`);
});
