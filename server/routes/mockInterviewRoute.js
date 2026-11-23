import express from "express";
import isAuth from "../middlewares/isAuth.js";
import { synthesizeSpeech } from "../controllers/ttsController.js";

const mockInterviewRouter = express.Router();

mockInterviewRouter.post("/tts", isAuth, synthesizeSpeech);

export default mockInterviewRouter;
