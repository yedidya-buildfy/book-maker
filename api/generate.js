import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import Jimp from 'jimp';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Enhanced logging
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
  console.log(logMessage);
  if (data) {
    console.log('Data:', JSON.stringify(data, null, 2));
  }
}

// Job management system
const jobs = new Map();

function createJob(id, title) {
  const job = {
    id,
    title,
    status: 'started',
    progress: 0,
    currentPhase: 'Starting...',
    totalSteps: 0,
    completedSteps: 0,
    startTime: Date.now(),
    error: null,
    result: null
  };
  jobs.set(id, job);
  log('info', 'Job created', { jobId: id, title });
  return job;
}

function updateJob(id, updates) {
  const job = jobs.get(id);
  if (job) {
    Object.assign(job, updates);
    log('debug', 'Job updated', { jobId: id, ...updates });
  }
}

function completeJob(id, result) {
  const job = jobs.get(id);
  if (job) {
    job.status = 'completed';
    job.progress = 100;
    job.result = result;
    job.endTime = Date.now();
    log('info', 'Job completed', { jobId: id, duration: job.endTime - job.startTime });
  }
}

function failJob(id, error) {
  const job = jobs.get(id);
  if (job) {
    job.status = 'failed';
    job.error = error.message || String(error);
    job.endTime = Date.now();
    log('error', 'Job failed', { jobId: id, error: job.error });
  }
}

// OpenAI helpers
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function openAIChat(messages, model = 'gpt-3.5-turbo', maxRetries = 3){
  const startTime = Date.now();
  log('info', `Starting OpenAI Chat request`, { model, messageCount: messages.length });
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const requestBody = { model, messages, temperature: 0.8 };
      log('debug', `Chat request attempt ${attempt}/${maxRetries}`, requestBody);
      
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method:'POST',
        headers:{'Authorization':`Bearer ${OPENAI_API_KEY}`,'Content-Type':'application/json'},
        body: JSON.stringify(requestBody)
      });
      
      const responseTime = Date.now() - startTime;
      log('info', `OpenAI Chat response received in ${responseTime}ms`, { status: res.status, attempt });
      
      if(!res.ok){ 
        const errorText = await res.text();
        const errorData = JSON.parse(errorText);
        
        // Check if it's a rate limit error
        if (res.status === 429 || errorData.error?.code === 'rate_limit_exceeded') {
          const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff
          log('warn', `Rate limit hit, retrying in ${waitTime}ms`, { attempt, status: res.status });
          
          if (attempt < maxRetries) {
            await sleep(waitTime);
            continue; // Retry
          }
        }
        
        log('error', 'OpenAI Chat API error', { status: res.status, error: errorText, attempt });
        throw new Error('OpenAI Chat error: ' + errorText); 
      }
      
      const data = await res.json();
      log('debug', 'Chat response data', { 
        hasChoices: !!data.choices, 
        choiceCount: data.choices?.length || 0,
        usage: data.usage,
        attempt
      });
      
      const content = data.choices?.[0]?.message?.content || '';
      log('info', `OpenAI Chat completed successfully`, { 
        responseLength: content.length,
        tokensUsed: data.usage?.total_tokens || 'unknown',
        totalTime: Date.now() - startTime,
        attempt
      });
      
      return content;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      log('error', `OpenAI Chat attempt ${attempt} failed after ${responseTime}ms`, { error: error.message });
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Wait before retrying
      const waitTime = Math.pow(2, attempt) * 1000;
      log('info', `Waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
      await sleep(waitTime);
    }
  }
}

async function openAIImage(prompt, size='1024x1024', maxRetries = 3){
  const startTime = Date.now();
  log('info', `Starting DALL-E image generation`, { promptLength: prompt.length, size });
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const requestBody = { 
        model: 'dall-e-3', 
        prompt: prompt.substring(0, 4000), // DALL-E 3 has prompt limits
        size,
        quality: 'standard',
        n: 1
      };
      log('debug', `Image generation attempt ${attempt}/${maxRetries}`, { model: requestBody.model, size, promptPreview: prompt.substring(0, 100) + '...' });
      
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method:'POST',
        headers:{'Authorization':`Bearer ${OPENAI_API_KEY}`,'Content-Type':'application/json'},
        body: JSON.stringify(requestBody)
      });
      
      const responseTime = Date.now() - startTime;
      log('info', `DALL-E response received in ${responseTime}ms`, { status: res.status, attempt });
      
      if(!res.ok){ 
        const errorText = await res.text();
        const errorData = JSON.parse(errorText);
        
        // Check if it's a rate limit error
        if (res.status === 429 || errorData.error?.code === 'rate_limit_exceeded') {
          const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff
          log('warn', `DALL-E rate limit hit, retrying in ${waitTime}ms`, { attempt, status: res.status });
          
          if (attempt < maxRetries) {
            await sleep(waitTime);
            continue; // Retry
          }
        }
        
        log('error', 'DALL-E API error', { status: res.status, error: errorText, attempt });
        throw new Error('OpenAI Image error: ' + errorText); 
      }
      
      const data = await res.json();
      const imageUrl = data.data?.[0]?.url;
      log('debug', 'Image generation response', { hasUrl: !!imageUrl, dataCount: data.data?.length || 0, attempt });
      
      if(!imageUrl) {
        log('error', 'Image generation returned no URL', data);
        throw new Error('Image generation returned empty data.');
      }
      
      // Fetch the image from the URL and return as buffer
      log('info', 'Fetching generated image from URL');
      const imageRes = await fetch(imageUrl);
      if(!imageRes.ok) {
        log('error', 'Failed to fetch image from URL', { status: imageRes.status, url: imageUrl });
        throw new Error('Failed to fetch generated image.');
      }
      
      const arrayBuffer = await imageRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      log('info', `Image generation completed successfully`, { 
        bufferSize: buffer.length,
        totalTime: Date.now() - startTime,
        attempt
      });
      
      return buffer;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      log('error', `Image generation attempt ${attempt} failed after ${responseTime}ms`, { error: error.message });
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Wait before retrying
      const waitTime = Math.pow(2, attempt) * 1000;
      log('info', `Waiting ${waitTime}ms before image retry ${attempt + 1}/${maxRetries}`);
      await sleep(waitTime);
    }
  }
}

// Utility
async function makeCharacterBoard(imagesB64){
  if(!imagesB64 || imagesB64.length===0) return null;
  const imgs = [];
  for(const b64 of imagesB64){
    try{
      const img = await Jimp.read(Buffer.from((b64.split(',')[1]||b64), 'base64'));
      imgs.push(img.cover(400, 400));
    }catch(e){ /* skip */ }
  }
  if(imgs.length===0) return null;
  const cols = Math.min(3, imgs.length);
  const rows = Math.ceil(imgs.length/cols);
  const cell = 420, pad = 10;
  const w = cols*cell + (cols+1)*pad;
  const h = rows*cell + (rows+1)*pad;
  const board = new Jimp(w, h, 0xffffffff);
  imgs.forEach((im, i)=>{
    const r = Math.floor(i/cols), c = i%cols;
    const x = pad + c*(cell+pad), y = pad + r*(cell+pad);
    board.composite(im, x, y);
  });
  return await board.getBufferAsync(Jimp.MIME_PNG);
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // Handle job status requests
    const { jobId } = req.query;
    const job = jobs.get(jobId);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Clean up completed/failed jobs older than 1 hour
    const oneHour = 60 * 60 * 1000;
    if ((job.status === 'completed' || job.status === 'failed') && 
        job.endTime && (Date.now() - job.endTime > oneHour)) {
      jobs.delete(jobId);
      return res.status(404).json({ error: 'Job expired' });
    }
    
    return res.json(job);
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const jobId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  
  try{
    const { title, story, numImages, artStyle, characters } = req.body || {};
    log('debug', 'Request payload', { title, story, numImages, artStyle, characterCount: characters?.length });
    
    if(!title || !numImages || !Array.isArray(characters)){
      log('error', 'Missing required fields', { hasTitle: !!title, hasNumImages: !!numImages, hasCharacters: Array.isArray(characters) });
      return res.status(400).json({error:'Missing required fields: title, numImages, characters[]'});
    }
    
    const selectedStyle = artStyle || 'Watercolor';
    const totalImages = numImages + 2; // story images + covers
    
    // Create job and return immediately
    const job = createJob(jobId, title);
    updateJob(jobId, {
      totalSteps: totalImages + 3, // character analysis + planning + images + PDF
      currentPhase: 'Analyzing characters...'
    });
    
    // Return job ID immediately
    res.json({ jobId, status: 'started' });
    
    // Start generation in background
    generateBookAsync(jobId, { title, story, numImages, artStyle: selectedStyle, characters });
    
  } catch(err) {
    failJob(jobId, err);
    log('error', 'Book generation setup failed', { error: err.message, jobId });
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
}

// This would be the full generateBookAsync function - truncated for brevity
// You would need to copy the full function from your server.js
async function generateBookAsync(jobId, { title, story, numImages, artStyle, characters }) {
  try {
    // Simplified version - you'd need to copy the full implementation from server.js
    updateJob(jobId, { currentPhase: 'Generation started...', progress: 10 });
    
    // For now, just complete the job after a delay to test
    setTimeout(() => {
      completeJob(jobId, { message: 'Generation complete (placeholder)' });
    }, 5000);
    
  } catch(err){
    failJob(jobId, err);
    log('error', 'Book generation failed', { 
      error: err.message, 
      stack: err.stack,
      timestamp: new Date().toISOString(),
      jobId
    });
  }
}
