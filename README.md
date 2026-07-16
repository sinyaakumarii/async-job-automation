# 🚀 Asynchronous AI Job Processor Portal

A high-performance, production-grade asynchronous background task processing system built using **Node.js (Express)**, **Redis**, and **BullMQ**. It safely offloads heavy and slow LLM API calls (Google Gemini 3.5 Flash) to a queue-based background worker, ensuring instantaneous server responses (202 Accepted) and preventing server blocking or timeouts under heavy load.

---

## 🧐 What is this project about? (The Core Problem & Solution)

### The Problem:
When integrating Large Language Models (LLMs) like OpenAI, Anthropic, or Gemini into real-world applications, generating responses can take anywhere from **3 to 15 seconds**. If a client makes a synchronous request:
1. The server thread gets blocked waiting for the API response.
2. It increases the risk of request timeouts.
3. If thousands of users click "Generate" at the same time, the server will crash instantly.

### Our Solution (Queue-Worker Pattern):
This project implements a robust **Queue-Worker Architecture**:
* **Immediate Response:** When a user submits a prompt, the system instantly schedules the task in a queue and returns a unique `jobId` with a **202 Accepted** status code in milliseconds.
* **Background Worker:** A background worker picks up the job from a Redis-backed queue and processes the Gemini AI API call asynchronously.
* **Client Polling:** A dynamic, real-time frontend UI polls the status of the job (`pending` ➔ `processing` ➔ `completed` / `failed`) every 1.5 seconds until the result is ready.

---

## 🛠️ System Architecture & Flow

The entire workflow functions smoothly as follows:

1. **Client Request:** User enters a prompt in the frontend UI and hits "Generate".
2. **Fast Ingest (Producer):** The Express API Server receives the prompt, generates a secure UUID as a `jobId`, registers the job status as `pending` in the database, pushes the task into **Redis**, and immediately sends a `202 Accepted` response back to the client.
3. **Queue Management:** Redis and **BullMQ** keep the tasks lined up safely.
4. **Asynchronous Execution (Consumer/Worker):** An independent background worker continuously polls Redis for new tasks, triggers the **Gemini 3.5 Flash** model, and updates the state.
5. **Dynamic Polling:** The Frontend UI tracks the status via `/v1/jobs/:id` and smoothly presents the generated response.

---

## ✨ Features Implemented

* **Asynchronous Execution:** No client-side thread blocking.
* **Modern Dashboard (Tailwind UI):** A fast, responsive, and gorgeous dark-themed dashboard built with Tailwind CSS and dynamic JavaScript polling.
* **Strict Idempotency Guard:** Prevents duplicate expensive API requests by caching and locking processed `jobId` records.
* **Exponential Backoff Retries:** Automatically retries failed API attempts (up to 3 times) with exponentially increasing delays (e.g., 2s, 4s, 8s) to handle rate-limiting.
* **Sentry/Slack-ready Alerting System:** Triggers a critical terminal alert notification if a task fails all retry attempts.
* **Real Google Gemini 3.5 Flash Integration:** Connected with the latest `@google/genai` SDK.

---

## 🚀 Tech Stack Used

* **Frontend:** HTML5, Tailwind CSS, Vanilla JavaScript (Fetch API & Polling)
* **Backend Runtime:** Node.js (Express framework)
* **Message Broker & Queue Store:** Redis
* **Task Queue Manager:** BullMQ
* **AI Engine:** Google Gemini AI Studio (`@google/genai`)
* **Unique Identification:** UUID

---

## 💻 Setup & Installation Instructions

### 1. Prerequisites
Ensure you have **Node.js** and **Redis** installed and running on your local machine.
```bash
# If using Docker to run Redis:
docker run --name local-redis -p 6379:6379 -d redis