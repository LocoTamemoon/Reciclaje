"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.materialesRouter = void 0;
const express_1 = require("express");
const asyncHandler_1 = require("../middleware/asyncHandler");
const materialesRepo_1 = require("../repositories/materialesRepo");
exports.materialesRouter = (0, express_1.Router)();
exports.materialesRouter.get("/", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const list = await (0, materialesRepo_1.listarMaterialesCatalogo)();
    res.json(list);
}));
