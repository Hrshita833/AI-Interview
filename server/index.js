import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import express from 'express';
import dotenv from 'dotenv';
import connectDb from './config/connectDb.js';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRouter from './routes/authRoute.js';
import userRouter from './routes/userRoute.js';
import interviewRouter from './routes/interviewRouter.js';
import paymentRouter from './routes/paymentRoute.js';





dotenv.config();

const app = express();


app.use(cors({
    origin: ["http://localhost:5173", "https://smart-interview-agent2.onrender.com"],
    credentials: true
}))

const PORT = process.env.PORT || 6000;

app.use(express.json())
app.use(cookieParser())

app.use("/api/auth", authRouter)
app.use("/api/user", userRouter)
app.use("/api/interview", interviewRouter)
app.use("/api/payment", paymentRouter)
app.use(express.static(path.join(__dirname, "public")));

app.get("/{*splat}", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});


app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on port ${PORT}`);
    connectDb();
});