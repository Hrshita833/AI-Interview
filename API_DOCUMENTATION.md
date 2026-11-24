# 📡 Smart Interview AI — API Documentation

Complete and detailed API documentation for the **Smart Interview AI (InterviewIQ.AI)** backend services.

---

## 📑 Table of Contents
1. [Overview & Base URL](#-overview--base-url)
2. [Authentication & Authorization](#-authentication--authorization)
3. [Standard Error & Success Formats](#-standard-error--success-formats)
4. [API Endpoints Overview](#-api-endpoints-overview)
5. [Authentication APIs (`/api/auth`)](#-authentication-apis-apiauth)
   - [Google Authentication](#1-google-authentication)
   - [User Logout](#2-user-logout)
   - [Get Current User (Auth Route)](#3-get-current-user-auth-route)
6. [User APIs (`/api/user`)](#-user-apis-apiuser)
   - [Get Current User Profile & Credits](#1-get-current-user-profile--credits)
7. [Interview APIs (`/api/interview`)](#-interview-apis-apiinterview)
   - [Upload & Analyze Resume](#1-upload--analyze-resume)
   - [Generate Interview Questions](#2-generate-interview-questions)
   - [Submit Question Answer & Get Real-Time Feedback](#3-submit-question-answer--get-real-time-feedback)
   - [Finish Interview Session](#4-finish-interview-session)
   - [Get User Interview History](#5-get-user-interview-history)
   - [Get Detailed Interview Report by ID](#6-get-detailed-interview-report-by-id)
8. [Mock Interview Voice APIs (`/api/mock-interview`)](#-mock-interview-voice-apis-apimock-interview)
   - [Synthesize Interviewer Speech (Gemini TTS)](#1-synthesize-interviewer-speech-gemini-tts)
9. [Payment & Credit APIs (`/api/payment`)](#-payment--credit-apis-apipayment)
   - [Create Razorpay Order](#1-create-razorpay-order)
   - [Verify Payment & Credit Top-Up](#2-verify-payment--credit-top-up)
10. [Data Models & Schema Reference](#-data-models--schema-reference)

---

## 🌐 Overview & Base URL

* **Development Base URL:** `http://localhost:3000`
* **Production Base URL:** `https://smart-interview-agent2.onrender.com` (or your configured Render server URL)
* **Default Port:** `3000` (Fallback `6000`)
* **Content-Type:** `application/json` (except file uploads which use `multipart/form-data`, and TTS which returns `audio/wav`)

---

## 🔐 Authentication & Authorization

All protected routes are secured via JWT (JSON Web Tokens) stored in an **`HttpOnly` Cookie** named `token`.

### Cookie Details:
| Attribute | Value | Description |
| :--- | :--- | :--- |
| **Name** | `token` | Contains signed JWT with `{ userId }` payload |
| **HttpOnly** | `true` | Prevents client-side XSS attacks |
| **Secure** | `true` in production | Transmitted only over HTTPS in production |
| **SameSite** | `"none"` (prod) / `"lax"` (dev) | Supports cross-origin credentials when deployed |
| **Max-Age** | 7 Days (`7 * 24 * 60 * 60 * 1000` ms) | Token validity period |

> ⚠️ **Note for Frontend Requests:** Always pass `{ withCredentials: true }` in Axios / `credentials: 'include'` in Fetch for all protected requests so the browser automatically sends the cookie.

---

## ⚠️ Standard Error & Success Formats

### Standard Success Response:
```json
{
  "success": true,
  "message": "Operation successful description",
  "data": { ... }
}
```

### Standard Error Response:
```json
{
  "message": "Error description message",
  "error": "Detailed error string (optional in production)"
}
```

### Common HTTP Status Codes:
* `200 OK` — Request succeeded.
* `400 Bad Request` — Missing parameters, invalid input, or text length exceeded (>500 chars).
* `401 Unauthorized` — Token missing, expired, or invalid.
* `404 Not Found` — Requested user or interview session not found.
* `429 Too Many Requests` — TTS generation rate-limited (`{ "error": "TTS_RATE_LIMITED" }`).
* `500 Internal Server Error` — Server, AI service, or database failure.

---

## 📋 API Endpoints Overview

| Module | Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| **Auth** | `POST` | `/api/auth/google` | ❌ No | Sign in or sign up using Firebase Google OAuth credentials |
| **Auth** | `GET` | `/api/auth/logout` | ❌ No | Log out user and clear `token` cookie |
| **Auth** | `GET` | `/api/auth/current-user` | ✅ Yes | Retrieve logged-in user profile |
| **User** | `GET` | `/api/user/current-user` | ✅ Yes | Retrieve current user profile and credit balance |
| **Interview** | `POST` | `/api/interview/resume` | ✅ Yes | Upload PDF resume, extract text, and parse role/skills via Gemini AI |
| **Interview** | `POST` | `/api/interview/generate-questions` | ✅ Yes | Deduct 50 credits and generate 5 progressive AI questions with persona |
| **Interview** | `POST` | `/api/interview/submit-answer` | ✅ Yes | Submit an answer, evaluate with AI, and receive real-time feedback |
| **Interview** | `POST` | `/api/interview/finish` | ✅ Yes | Complete interview session, calculate overall scores, and mark finished |
| **Interview** | `GET` | `/api/interview/get-interview` | ✅ Yes | Fetch user's historical interview list |
| **Interview** | `GET` | `/api/interview/report/:id` | ✅ Yes | Fetch full analytics and question-wise breakdown for a specific interview |
| **Voice / TTS** | `POST` | `/api/mock-interview/tts` | ✅ Yes | Synthesize human interviewer voice (Gemini TTS) as `audio/wav` |
| **Payment** | `POST` | `/api/payment/order` | ✅ Yes | Create a Razorpay order for purchasing interview credits |
| **Payment** | `POST` | `/api/payment/verify` | ✅ Yes | Verify Razorpay payment signature and credit the user's account |

---

## 🔑 Authentication APIs (`/api/auth`)

### 1. Google Authentication
Authenticates a user after Google Sign-in on the frontend. If the user doesn't exist in MongoDB, a new user account is created with an initial balance of **1000 credits**.

* **Route:** `POST /api/auth/google`
* **Auth Required:** No
* **Headers:** `Content-Type: application/json`

#### Request Body:
```json
{
  "name": "Jane Doe",
  "email": "janedoe@example.com"
}
```

#### Success Response (`200 OK`):
*Sets `token` cookie in response header.*
```json
{
  "_id": "6740b3f81e39a04a3f124567",
  "name": "Jane Doe",
  "email": "janedoe@example.com",
  "credits": 1000,
  "createdAt": "2026-11-23T10:00:00.000Z",
  "updatedAt": "2026-11-23T10:00:00.000Z",
  "__v": 0
}
```

#### Error Response (`500 Internal Server Error`):
```json
{
  "message": "Google Auth Error : <error_details>"
}
```

---

### 2. User Logout
Clears the JWT authentication cookie on the client browser.

* **Route:** `GET /api/auth/logout`
* **Auth Required:** No

#### Success Response (`200 OK`):
```json
{
  "message": "Logged Out Successfully"
}
```

---

### 3. Get Current User (Auth Route)
Validates the session cookie and returns user details.

* **Route:** `GET /api/auth/current-user`
* **Auth Required:** Yes (Cookie: `token=<jwt>`)

#### Success Response (`200 OK`):
```json
{
  "_id": "6740b3f81e39a04a3f124567",
  "name": "Jane Doe",
  "email": "janedoe@example.com",
  "credits": 950,
  "createdAt": "2026-11-23T10:00:00.000Z",
  "updatedAt": "2026-11-23T10:30:00.000Z",
  "__v": 0
}
```

---

## 👤 User APIs (`/api/user`)

### 1. Get Current User Profile & Credits
Fetches the currently authenticated user's details, including the live credit balance. Used across the frontend navbar and initial application load.

* **Route:** `GET /api/user/current-user`
* **Auth Required:** Yes (Cookie: `token=<jwt>`)

#### Success Response (`200 OK`):
```json
{
  "_id": "6740b3f81e39a04a3f124567",
  "name": "Jane Doe",
  "email": "janedoe@example.com",
  "credits": 950,
  "createdAt": "2026-11-23T10:00:00.000Z",
  "updatedAt": "2026-11-23T10:30:00.000Z"
}
```

---

## 🎙️ Interview APIs (`/api/interview`)

### 1. Upload & Analyze Resume
Uploads a candidate's PDF resume, extracts the raw text using `pdfjs-dist`, and prompts Google Gemini AI to parse structured information. The uploaded file is deleted immediately after parsing.

* **Route:** `POST /api/interview/resume`
* **Auth Required:** Yes
* **Headers:** `Content-Type: multipart/form-data`
* **File Parameter:** `resume` (PDF file, max 5MB)

#### Success Response (`200 OK`):
```json
{
  "role": "Full Stack Developer",
  "experience": "2 years",
  "projects": [
    "E-commerce Web App with MERN",
    "Real-time Chat Application with Socket.io"
  ],
  "skills": [
    "React.js",
    "Node.js",
    "MongoDB",
    "Express.js",
    "Tailwind CSS"
  ],
  "resumeText": "Jane Doe Full Stack Developer experience with React, Node.js..."
}
```

---

### 2. Generate Interview Questions
Generates 5 tailored interview questions based on the candidate's chosen role, experience, mode (Technical or HR), voice persona (`male` or `female`), and parsed resume data.
* **Credit Requirement:** Minimum 50 credits required. 50 credits are deducted upon successful generation.
* **Persona Mapping:**
  - `gender: "female"` ➡️ Persona: **Ananya**, Voice: **Kore**
  - `gender: "male"` ➡️ Persona: **Arjun**, Voice: **Puck**
* **Question Progression:**
  - Question 1: **Easy** (Time Limit: 60 seconds)
  - Question 2: **Easy** (Time Limit: 60 seconds)
  - Question 3: **Medium** (Time Limit: 90 seconds)
  - Question 4: **Medium** (Time Limit: 90 seconds)
  - Question 5: **Hard** (Time Limit: 120 seconds)

* **Route:** `POST /api/interview/generate-questions`
* **Auth Required:** Yes
* **Headers:** `Content-Type: application/json`

#### Request Body:
```json
{
  "role": "Frontend Developer",
  "experience": "2 years",
  "mode": "Technical",
  "gender": "female",
  "resumeText": "Extracted resume text...",
  "projects": ["Portfolio Website", "Task Manager"],
  "skills": ["JavaScript", "React", "Redux"]
}
```

#### Success Response (`200 OK`):
```json
{
  "interviewId": "6740bf831e39a04a3f124589",
  "creditsLeft": 950,
  "userName": "Jane Doe",
  "gender": "female",
  "personaName": "Ananya",
  "questions": [
    {
      "question": "So tell me, how does the virtual DOM work in React, and why is it useful?",
      "difficulty": "easy",
      "timeLimit": 60,
      "score": 0,
      "confidence": 0,
      "communication": 0,
      "correctness": 0,
      "_id": "6740bf831e39a04a3f12458a"
    },
    {
      "question": "Alright, what is the main difference between state and props in React components?",
      "difficulty": "easy",
      "timeLimit": 60,
      "score": 0,
      "confidence": 0,
      "communication": 0,
      "correctness": 0,
      "_id": "6740bf831e39a04a3f12458b"
    },
    {
      "question": "How do you handle asynchronous data fetching and error states using useEffect or custom hooks?",
      "difficulty": "medium",
      "timeLimit": 90,
      "score": 0,
      "confidence": 0,
      "communication": 0,
      "correctness": 0,
      "_id": "6740bf831e39a04a3f12458c"
    },
    {
      "question": "Can you walk me through a challenging performance bottleneck you resolved in your recent project?",
      "difficulty": "medium",
      "timeLimit": 90,
      "score": 0,
      "confidence": 0,
      "communication": 0,
      "correctness": 0,
      "_id": "6740bf831e39a04a3f12458d"
    },
    {
      "question": "How would you design and structure global state management for a high-traffic enterprise application?",
      "difficulty": "hard",
      "timeLimit": 120,
      "score": 0,
      "confidence": 0,
      "communication": 0,
      "correctness": 0,
      "_id": "6740bf831e39a04a3f12458e"
    }
  ]
}
```

---

### 3. Submit Question Answer & Get Real-Time Feedback
Submits candidate's answer (typed or voice-transcribed) for a specific question.
* **Evaluation Criteria:**
  1. **Confidence (0 to 10)**: Clear, confident, well-presented.
  2. **Communication (0 to 10)**: Simple, concise, articulated language.
  3. **Correctness (0 to 10)**: Accurate, relevant, complete response.
  4. **Final Score**: Average of the above three rounded to whole number.
  5. **Feedback**: 10–15 words of realistic human interviewer feedback.

* **Route:** `POST /api/interview/submit-answer`
* **Auth Required:** Yes
* **Headers:** `Content-Type: application/json`

#### Request Body:
```json
{
  "interviewId": "6740bf831e39a04a3f124589",
  "questionIndex": 0,
  "answer": "The virtual DOM is an in-memory copy of the real DOM. When state updates, React diffs the trees and applies batch changes to the real DOM.",
  "timeTaken": 42
}
```

#### Success Response (`200 OK`):
```json
{
  "feedback": "Clear explanation of diffing algorithm and DOM updates. Good understanding shown."
}
```

---

### 4. Finish Interview Session
Finalizes the interview, aggregates overall performance metrics across all questions, updates interview status to `"completed"`, and stores the final score.

* **Route:** `POST /api/interview/finish`
* **Auth Required:** Yes

#### Request Body:
```json
{
  "interviewId": "6740bf831e39a04a3f124589"
}
```

#### Success Response (`200 OK`):
```json
{
  "finalScore": 8.2,
  "confidence": 8.0,
  "communication": 8.5,
  "correctness": 8.1,
  "questionWiseScore": [
    {
      "question": "So tell me, how does the virtual DOM work in React...",
      "score": 8,
      "feedback": "Clear explanation of diffing algorithm and DOM updates.",
      "confidence": 8,
      "communication": 9,
      "correctness": 8
    }
  ]
}
```

---

### 5. Get User Interview History
Retrieves all historical interview sessions belonging to the logged-in user, sorted chronologically descending (`createdAt: -1`).

* **Route:** `GET /api/interview/get-interview`
* **Auth Required:** Yes

---

### 6. Get Detailed Interview Report by ID
Fetches complete details and metrics for an interview by its MongoDB ID. Used on the Analytics & PDF Download page (`/report/:id`).

* **Route:** `GET /api/interview/report/:id`
* **Auth Required:** Yes
* **URL Parameters:** `:id` — MongoDB ObjectId of the interview

---

## 🔊 Mock Interview Voice APIs (`/api/mock-interview`)

### 1. Synthesize Interviewer Speech (Gemini TTS)
Converts conversational text into human-like spoken audio using Google's Gemini TTS model (`gemini-3.8-flash-tts` with fallback to `gemini-3.1-flash-tts-preview`). Output is encoded in standard 24kHz 16-bit mono WAV format.
* **Features:**
  - Automatically prepends conversational style directives based on gender/persona.
  - In-memory SHA-256 caching for `gender:text` pairs.
  - Automatic fallback on model 404.
  - Backoff and retry on HTTP 429 rate limit.

* **Route:** `POST /api/mock-interview/tts`
* **Auth Required:** Yes (Cookie: `token=<jwt>`)
* **Headers:** `Content-Type: application/json`

#### Request Body:
```json
{
  "text": "So tell me, what got you interested in this role? I would love to hear your story.",
  "gender": "female"
}
```

#### Validation Rules:
- `text`: Required, string, non-empty, maximum 500 characters.
- `gender`: Required, strictly `"male"` or `"female"`.

#### Success Response (`200 OK`):
* **Response Headers:**
  - `Content-Type: audio/wav`
  - `Content-Length: <byte_size>`
  - `Cache-Control: public, max-age=86400`
* **Response Body:** Binary WAV audio stream.

#### Error Responses:
* **`400 Bad Request`**:
  ```json
  { "error": "INVALID_INPUT", "message": "text must be 500 characters or fewer" }
  ```
* **`401 Unauthorized`**:
  ```json
  { "message": "Not authenticated" }
  ```
* **`429 Too Many Requests`**:
  ```json
  { "error": "TTS_RATE_LIMITED" }
  ```
* **`500 Internal Server Error`**:
  ```json
  { "error": "TTS_FAILED", "message": "Detailed error string" }
  ```

---

## 💳 Payment & Credit APIs (`/api/payment`)

### 1. Create Razorpay Order
Initializes a payment order through the Razorpay API and creates a corresponding pending `Payment` record in MongoDB.

* **Route:** `POST /api/payment/order`
* **Auth Required:** Yes
* **Headers:** `Content-Type: application/json`

#### Request Body:
```json
{
  "planId": "basic",
  "amount": 100,
  "credits": 150
}
```

#### Success Response (`200 OK`):
```json
{
  "id": "order_Pkx8291abcdef",
  "entity": "order",
  "amount": 10000,
  "amount_paid": 0,
  "amount_due": 10000,
  "currency": "INR",
  "receipt": "receipt_1732354500000",
  "status": "created",
  "attempts": 0,
  "created_at": 1732354500
}
```

---

### 2. Verify Payment & Credit Top-Up
Verifies the cryptographic HMAC-SHA256 signature returned by Razorpay after client checkout. Upon successful verification:
1. Updates `Payment` record status to `"paid"` and stores `razorpayPaymentId`.
2. Increments the user's `credits` balance using `$inc`.
3. Returns the updated user profile.

* **Route:** `POST /api/payment/verify`
* **Auth Required:** Yes
* **Headers:** `Content-Type: application/json`

#### Request Body:
```json
{
  "razorpay_order_id": "order_Pkx8291abcdef",
  "razorpay_payment_id": "pay_Pkx892019xyz",
  "razorpay_signature": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
}
```

#### Success Response (`200 OK`):
```json
{
  "success": true,
  "message": "Payment verified and credits added",
  "user": {
    "_id": "6740b3f81e39a04a3f124567",
    "name": "Jane Doe",
    "email": "janedoe@example.com",
    "credits": 1100,
    "createdAt": "2026-11-23T10:00:00.000Z",
    "updatedAt": "2026-11-23T11:00:00.000Z"
  }
}
```

---

## 🗄️ Data Models & Schema Reference

### 1. User Schema (`server/models/userModel.js`)
```javascript
{
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  credits: { type: Number, default: 1000 },
  timestamps: true // createdAt, updatedAt
}
```

### 2. Interview Schema (`server/models/interviewModel.js`)
```javascript
{
  userId: { type: ObjectId, ref: 'User', required: true },
  role: { type: String, required: true },
  experience: { type: String, required: true },
  mode: { type: String, enum: ['HR', 'Technical'], required: true },
  gender: { type: String, enum: ['male', 'female'], default: 'female' },
  resumeText: { type: String },
  questions: [
    {
      question: String,
      difficulty: String, // 'easy' | 'medium' | 'hard'
      timeLimit: Number,  // 60, 90, or 120 (seconds)
      answer: String,
      feedback: String,
      score: { type: Number, default: 0 },
      confidence: { type: Number, default: 0 },
      communication: { type: Number, default: 0 },
      correctness: { type: Number, default: 0 }
    }
  ],
  finalScore: { type: Number, default: 0 },
  status: { type: String, enum: ['Incompleted', 'completed'], default: 'Incompleted' },
  timestamps: true // createdAt, updatedAt
}
```

### 3. Payment Schema (`server/models/paymentModel.js`)
```javascript
{
  userId: { type: ObjectId, ref: 'User', required: true },
  planId: String,          // 'free' | 'basic' | 'pro'
  amount: Number,          // in INR (e.g. 100, 500)
  credits: Number,         // 150, 650
  razorpayOrderId: String, // order_xxx
  razorpayPaymentId: String, // pay_xxx
  status: { type: String, enum: ['created', 'paid', 'failed'], default: 'created' },
  timestamps: true // createdAt, updatedAt
}
```

---

*Documentation maintained for Smart Interview AI (InterviewIQ.AI).*
