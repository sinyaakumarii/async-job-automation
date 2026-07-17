import express from 'express';
import 'dotenv/config'; 
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();
app.use(express.json());
app.use(express.static('public'));

const PORT = 3000;
const REDIS_URL = 'redis://127.0.0.1:6379';

// Gemini API Setup - FIX: Sirf ek baar model name define karein
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const GEMINI_MODEL_NAME = process.env.GEMINI_MODEL || "gemini-1.5-flash";
const model = genAI.getGenerativeModel({ model: GEMINI_MODEL_NAME });

const db = {
  jobs: new Map(),             
  processedRequests: new Set() 
};

// ... (ListModels function waisa hi rahega)
async function listModels() {
  const apiVersion = 'v1beta';
  const url = `https://generativelanguage.googleapis.com/${apiVersion}/models`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY },
  });
  if (!response.ok) throw new Error('Failed to list models');
  const payload = await response.json();
  return payload.models || [];
}

// Redis & Queue Setup
const redisConnection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const aiQueue = new Queue('ai-tasks', { connection: redisConnection });

// API Endpoints
app.post('/v1/analyze', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt required' });

  const jobId = uuidv4(); 
  db.jobs.set(jobId, { id: jobId, status: 'pending', createdAt: new Date().toISOString() });

  await aiQueue.add('process-ai-call', { jobId, prompt }, { jobId });
  return res.status(202).json({ jobId, pollUrl: `http://localhost:${PORT}/v1/jobs/${jobId}` });
});

app.get('/v1/jobs/:id', (req, res) => {
  const jobRecord = db.jobs.get(req.params.id);
  if (!jobRecord) return res.status(404).json({ error: 'Job not found' });
  return res.status(200).json(jobRecord);
});

// Worker Setup
const worker = new Worker('ai-tasks', async (job) => {
  const { jobId, prompt } = job.data;
  updateJobInDB(jobId, { status: 'processing' });
  const aiResult = await callGeminiWithRetry(prompt);
  updateJobInDB(jobId, { status: 'completed', result: aiResult });
  return aiResult;
}, { connection: redisConnection });

// Helper Functions
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function callGeminiWithRetry(prompt, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const result = await model.generateContent(prompt);
            return result.response.text();
        } catch (error) {
            if (i < retries - 1) await delay(3000);
            else throw error;
        }
    }
}

function updateJobInDB(jobId, fields) {
  const current = db.jobs.get(jobId) || {};
  db.jobs.set(jobId, { ...current, ...fields, updatedAt: new Date().toISOString() });
}

app.listen(PORT, () => {
  console.log(`🚀 API Server running on http://localhost:${PORT}`);
});