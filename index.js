import express from 'express';
import 'dotenv/config'; // .env file se environment variables load karne ke liye
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenAI } from '@google/genai';

const app = express();
app.use(express.json());

// Public folder se assets aur index.html serve karein
app.use(express.static('public'));

const PORT = 3000;
const REDIS_URL = 'redis://127.0.0.1:6379';

// Gemini API Setup (Strictly reads ONLY from your .env file)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Mock Database
const db = {
  jobs: new Map(),             
  processedRequests: new Set() 
};

// Redis & Queue Setup
const redisConnection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const aiQueue = new Queue('ai-tasks', { connection: redisConnection });

// API Endpoints
app.post('/v1/analyze', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Body mein prompt likhna zaroori hai!' });
  }

  const jobId = uuidv4(); 
  db.jobs.set(jobId, {
    id: jobId,
    status: 'pending',
    result: null,
    error: null,
    createdAt: new Date().toISOString()
  });

  await aiQueue.add(
    'process-ai-call',
    { jobId, prompt },
    {
      jobId: jobId,
      attempts: 3, 
      backoff: { type: 'exponential', delay: 2000 }
    }
  );

  console.log(`[API] Accepted Job ${jobId}. Queue mein daal diya gaya hai.`);

  return res.status(202).json({
    status: 'Accepted',
    message: 'Aapka kaam background mein shuru ho gaya hai.',
    jobId,
    pollUrl: `http://localhost:${PORT}/v1/jobs/${jobId}`
  });
});

app.get('/v1/jobs/:id', (req, res) => {
  const jobId = req.params.id;
  const jobRecord = db.jobs.get(jobId);
  if (!jobRecord) {
    return res.status(404).json({ error: 'Job nahi mili!' });
  }
  return res.status(200).json(jobRecord);
});

// Worker Setup
const worker = new Worker('ai-tasks', async (job) => {
  const { jobId, prompt } = job.data;
  console.log(`[Worker] Job ${jobId} par kaam shuru kiya. Prompt: "${prompt}"`);

  updateJobInDB(jobId, { status: 'processing' });

  if (db.processedRequests.has(jobId)) {
    return db.jobs.get(jobId).result;
  }

  const aiResult = await simulateSlowAICall(prompt, job.attemptsMade);
  db.processedRequests.add(jobId);
  updateJobInDB(jobId, { status: 'completed', result: aiResult });

  console.log(`[Worker] Job ${jobId} successfully complete ho gayi!`);
  return aiResult;
}, { connection: redisConnection });

worker.on('failed', (job, err) => {
  const { jobId } = job.data;
  updateJobInDB(jobId, { 
    status: 'failed', 
    error: `Attempt ${job.attemptsMade} fail hui: ${err.message}` 
  });
  console.warn(`[Worker] Job ${jobId} failed on attempt ${job.attemptsMade}. Reason: ${err.message}`);
});

async function simulateSlowAICall(prompt, attemptNumber) {
  try {
    console.log(`[Gemini] Model ko request bhej rahe hain...`);
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    throw new Error(`Gemini AI Call failed: ${error.message}`);
  }
}

function updateJobInDB(jobId, fieldsToUpdate) {
  const current = db.jobs.get(jobId) || {};
  db.jobs.set(jobId, { ...current, ...fieldsToUpdate, updatedAt: new Date().toISOString() });
}

app.listen(PORT, () => {
  console.log(`🚀 API Server running on http://localhost:${PORT}`);
  console.log(`⚙️  Worker background mein jobs ka wait kar raha hai...`);
});