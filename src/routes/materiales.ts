import { Router, Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { listarMaterialesCatalogo } from "../repositories/materialesRepo";

export const materialesRouter = Router();

materialesRouter.get("/", asyncHandler(async (req: Request, res: Response) => {
  const list = await listarMaterialesCatalogo();
  res.json(list);
}));