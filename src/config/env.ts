import dotenv from "dotenv";
dotenv.config();

export const env = {
  port: parseInt(process.env.PORT || "3000", 10),
  databaseUrl: process.env.DATABASE_URL || "",
};
if (!env.databaseUrl) {
  throw new Error("DATABASE_URL no configurado");
}
