// ====================================================================
// CHILDREN'S BOOK GENERATOR SERVER
// Serverless-optimized for Vercel with proper error handling
// ====================================================================

import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import Jimp from 'jimp';
import admin from 'firebase-admin';
import crypto from 'crypto';
import { createFallbackImage, createSetupGuideImage } from './fallback-images.js';

// ====================================================================
// CONFIGURATION & INITIALIZATION
// ====================================================================

const app = express();
const PORT = process.env.PORT || 8080;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Firebase Storage
let bucket = null;
let firebaseConfigured = false;

// Job storage (in-memory for serverless)
const jobs = new Map();

// ====================================================================
// LOGGING UTILITY
// ====================================================================

function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
  console.log(logMessage);
  if (data) {
    console.log('Data:', JSON.stringify(data, null, 2));
  }
}

// ====================================================================
// FIREBASE INITIALIZATION
// ====================================================================

function initializeFirebase() {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;
    const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
    
    if (!projectId || !clientEmail || !privateKey || !storageBucket) {
      log('info', 'Firebase environment variables not found', {
        hasProjectId: !!projectId,
        hasClientEmail: !!clientEmail,
        hasPrivateKey: !!privateKey,
        hasStorageBucket: !!storageBucket
      });
      return false;
    }
    
    const serviceAccount = {
      type: 'service_account',
      project_id: projectId,
      private_key: privateKey.replace(/\\n/g, '\n'),
      client_email: clientEmail
    };
    
    const bucketName = storageBucket.includes('://') ? 
      storageBucket.split('/').pop().replace('.firebasestorage.app/files', '.appspot.com') :
      storageBucket;
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: bucketName
    });
    
    bucket = admin.storage().bucket();
    firebaseConfigured = true;
    
    log('info', '✅ Firebase Storage initialized successfully', { bucketName });
    return true;
    
  } catch (error) {
    log('error', 'Failed to initialize Firebase', { error: error.message });
    return false;
  }
}

// Initialize Firebase
firebaseConfigured = initializeFirebase();

if (!firebaseConfigured) {
  log('warn', '📋 Firebase not configured - PDFs will be returned as direct downloads');
}

// ====================================================================
// MIDDLEWARE SETUP
// ====================================================================

app.use(express.json({ limit: '40mb' }));
app.use('/output', express.static('output'));
app.use(express.static('public'));

// Global error handler
app.use((err, req, res, next) => {
  log('error', 'Global error handler', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ====================================================================
// JOB MANAGEMENT SYSTEM
// ====================================================================

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

function getJob(jobId) {
  return jobs.get(jobId);
}

// ====================================================================
// UTILITY FUNCTIONS
// ====================================================================

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function makeTimeout(promise, timeoutMs, errorMessage) {
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
  );
  return Promise.race([promise, timeoutPromise]);
}

// ====================================================================
// API CLIENT FUNCTIONS
// ====================================================================

// OpenAI Chat API
async function openAIChat(messages, model = 'gpt-4o-mini', maxRetries = 3) {
  const startTime = Date.now();
  log('info', `Starting OpenAI Chat request`, { model, messageCount: messages.length });
  
  const timeoutMs = model.includes('gpt-4o') ? 60000 : 30000;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const requestBody = { model, messages, temperature: 0.8 };
      log('debug', `Chat request attempt ${attempt}/${maxRetries}`, { model });
      
      const fetchPromise = fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      
      const res = await makeTimeout(fetchPromise, timeoutMs, `Request timeout after ${timeoutMs}ms`);
      
      const responseTime = Date.now() - startTime;
      log('info', `OpenAI Chat response received in ${responseTime}ms`, { status: res.status, attempt });
      
      if (!res.ok) { 
        const errorText = await res.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { error: { message: errorText } };
        }
        
        if (res.status === 429 || errorData.error?.code === 'rate_limit_exceeded') {
          const waitTime = Math.pow(2, attempt) * 1000;
          log('warn', `Rate limit hit, retrying in ${waitTime}ms`, { attempt, status: res.status });
          
          if (attempt < maxRetries) {
            await sleep(waitTime);
            continue;
          }
        }
        
        log('error', 'OpenAI Chat API error', { status: res.status, error: errorText, attempt });
        throw new Error('OpenAI Chat error: ' + errorText); 
      }
      
      const data = await res.json();
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
      
      const waitTime = Math.pow(2, attempt) * 1000;
      log('info', `Waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
      await sleep(waitTime);
    }
  }
}

// OpenAI Image Generation
async function openAIImage(prompt, size = '1024x1024', maxRetries = 3, fallbackInfo = null) {
  const startTime = Date.now();
  log('info', `Starting image generation`, { promptLength: prompt.length, size, hasFallbackInfo: !!fallbackInfo });
  
  if (!OPENAI_API_KEY || OPENAI_API_KEY === 'undefined') {
    log('warn', 'OpenAI API key not configured, using fallback image generation');
    return await generateFallbackImage(fallbackInfo, size);
  }
  
  const timeoutMs = 120000; // 2 minutes for DALL-E
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const requestBody = { 
        model: 'dall-e-3', 
        prompt: prompt.substring(0, 4000),
        size,
        quality: 'standard',
        n: 1
      };
      
      log('debug', `DALL-E attempt ${attempt}/${maxRetries}`, { model: requestBody.model, size });
      
      const fetchPromise = fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      
      const res = await makeTimeout(fetchPromise, timeoutMs, `Image generation timeout after ${timeoutMs}ms`);
      
      const responseTime = Date.now() - startTime;
      log('info', `DALL-E response received in ${responseTime}ms`, { status: res.status, attempt });
      
      if (!res.ok) { 
        const errorText = await res.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { error: { message: errorText } };
        }
        
        // Handle specific error types
        if (res.status === 401 || errorData.error?.code === 'invalid_api_key') {
          log('error', 'OpenAI API key is invalid, using fallback image generation');
          if (attempt === 1 && (!fallbackInfo || fallbackInfo.title === 'Front Cover')) {
            return await createSetupGuideImage();
          }
          return await generateFallbackImage(fallbackInfo, size);
        }
        
        if (res.status === 429 || errorData.error?.code === 'rate_limit_exceeded') {
          const waitTime = Math.pow(2, attempt) * 1000;
          log('warn', `DALL-E rate limit hit, retrying in ${waitTime}ms`, { attempt, status: res.status });
          
          if (attempt < maxRetries) {
            await sleep(waitTime);
            continue;
          }
        }
        
        if (res.status === 402 || errorData.error?.code === 'insufficient_quota' || 
            errorData.error?.message?.includes('quota') || errorData.error?.message?.includes('billing')) {
          log('error', 'OpenAI account has insufficient credits, using fallback image generation');
          return await generateFallbackImage(fallbackInfo, size);
        }
        
        log('error', 'DALL-E API error', { status: res.status, error: errorText, attempt });
        
        if (attempt === maxRetries) {
          log('warn', 'All DALL-E attempts failed, using fallback image generation');
          return await generateFallbackImage(fallbackInfo, size);
        }
        
        throw new Error('OpenAI Image error: ' + errorText); 
      }
      
      const data = await res.json();
      const imageUrl = data.data?.[0]?.url;
      
      if (!imageUrl) {
        log('error', 'Image generation returned no URL', data);
        throw new Error('Image generation returned empty data.');
      }
      
      // Fetch the image from the URL
      log('info', 'Fetching generated image from URL');
      const imageRes = await fetch(imageUrl);
      if (!imageRes.ok) {
        log('error', 'Failed to fetch image from URL', { status: imageRes.status, url: imageUrl });
        throw new Error('Failed to fetch generated image.');
      }
      
      const arrayBuffer = await imageRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      log('info', `✅ DALL-E image generation completed successfully`, { 
        bufferSize: buffer.length,
        totalTime: Date.now() - startTime,
        attempt
      });
      
      return buffer;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      log('error', `Image generation attempt ${attempt} failed after ${responseTime}ms`, { error: error.message });
      
      if (attempt === maxRetries) {
        log('warn', 'All image generation attempts failed, using fallback');
        return await generateFallbackImage(fallbackInfo, size);
      }
      
      const waitTime = Math.pow(2, attempt) * 1000;
      log('info', `Waiting ${waitTime}ms before image retry ${attempt + 1}/${maxRetries}`);
      await sleep(waitTime);
    }
  }
}

// Gemini API
async function geminiChat(prompt, maxRetries = 3) {
  const startTime = Date.now();
  log('info', `Starting Gemini API request`, { promptLength: prompt.length });
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const requestBody = {
        contents: [{
          parts: [{ text: prompt }]
        }]
      };
      
      log('debug', `Gemini request attempt ${attempt}/${maxRetries}`);
      
      const fetchPromise = fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      
      const res = await makeTimeout(fetchPromise, 30000, 'Gemini request timeout after 30s');
      
      const responseTime = Date.now() - startTime;
      log('info', `Gemini response received in ${responseTime}ms`, { status: res.status, attempt });
      
      if (!res.ok) {
        const errorText = await res.text();
        log('error', 'Gemini API error', { status: res.status, error: errorText, attempt });
        
        if (attempt === maxRetries) {
          throw new Error('Gemini API error: ' + errorText);
        }
        continue;
      }
      
      const data = await res.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      log('info', `Gemini request completed successfully`, { 
        responseLength: content.length,
        totalTime: Date.now() - startTime,
        attempt
      });
      
      return content;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      log('error', `Gemini attempt ${attempt} failed after ${responseTime}ms`, { error: error.message });
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      const waitTime = Math.pow(2, attempt) * 1000;
      log('info', `Waiting ${waitTime}ms before Gemini retry ${attempt + 1}/${maxRetries}`);
      await sleep(waitTime);
    }
  }
}

// Fallback image generation
async function generateFallbackImage(fallbackInfo, size = '1024x1024') {
  try {
    const [width, height] = size.split('x').map(Number);
    const imageSize = Math.max(width, height);
    
    if (!fallbackInfo) {
      log('info', 'Creating generic fallback image');
      return await createFallbackImage('Story Scene', 'A beautiful scene from a children\'s story', imageSize);
    }
    
    log('info', `Creating fallback image for: ${fallbackInfo.title}`, { description: fallbackInfo.description?.substring(0, 100) });
    return await createFallbackImage(
      fallbackInfo.title || 'Story Scene',
      fallbackInfo.description || 'A scene from a children\'s story',
      imageSize
    );
  } catch (error) {
    log('error', 'Fallback image generation failed', { error: error.message });
    // Return a simple colored buffer as last resort
    const image = new Jimp(1024, 1024, 0x4285F4FF);
    return await image.getBufferAsync(Jimp.MIME_PNG);
  }
}

// ====================================================================
// PDF AND STORAGE FUNCTIONS
// ====================================================================

async function createPDF(plan, imageBuffers, runId) {
  try {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'portrait',
      margins: { top: 50, bottom: 50, left: 50, right: 50 }
    });
    
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    
    // Add title page
    doc.fontSize(24).text(plan.title || 'Children\'s Book', { align: 'center' });
    doc.moveDown(2);
    
    // Add images
    for (let i = 0; i < imageBuffers.length; i++) {
      if (i > 0) doc.addPage();
      
      const image = imageBuffers[i];
      const img = await Jimp.read(image);
      const resized = img.resize(500, 500, Jimp.RESIZE_BEZIER);
      const buffer = await resized.getBufferAsync(Jimp.MIME_JPEG);
      
      doc.image(buffer, { fit: [400, 400], align: 'center' });
      doc.moveDown();
      
      if (plan.images && plan.images[i]) {
        doc.fontSize(14).text(plan.images[i].title || `Page ${i + 1}`, { align: 'center' });
      }
    }
    
    doc.end();
    
    return Buffer.concat(chunks);
  } catch (error) {
    log('error', 'PDF creation failed', { error: error.message });
    throw error;
  }
}

async function uploadToStorage(buffer, path) {
  if (!firebaseConfigured || !bucket) {
    return buffer.toString('base64');
  }
  
  try {
    const file = bucket.file(path);
    await file.save(buffer, {
      metadata: {
        contentType: 'application/pdf',
        metadata: {
          firebaseStorageDownloadTokens: crypto.randomUUID()
        }
      }
    });
    
    await file.makePublic();
    return `https://storage.googleapis.com/${bucket.name}/${path}`;
  } catch (error) {
    log('error', 'Storage upload failed, returning base64', { error: error.message });
    return buffer.toString('base64');
  }
}

// ====================================================================
// CHARACTER AND PLANNING FUNCTIONS
// ====================================================================

function createStructuredCharacterAnalysis(character) {
  const desc = (character.description || '').toLowerCase();
  const isChild = (character.age && parseInt(character.age) < 18) || desc.includes('child') || desc.includes('kid');
  const isJewish = desc.includes('jewish') || character.name?.includes('David') || character.name?.includes('Sarah');
  
  return {
    name: character.name || 'Character',
    age: character.age || (isChild ? 'Child (6-8 years)' : 'Young person'),
    physicalAppearance: {
      height: isChild ? 'Child-appropriate height' : 'Average height for age',
      faceShape: 'Round, friendly face with warm features',
      eyeColor: 'Warm, expressive eyes',
      hairColor: 'Natural hair color',
      hairStyle: isChild ? 'Neat, child-friendly hairstyle' : 'Simple, neat hairstyle',
      skinTone: 'Warm, healthy skin tone',
      distinctiveFeatures: character.description || 'Friendly, approachable appearance'
    },
    clothing: {
      typicalOutfit: isChild ? 'Casual, comfortable children\'s clothing' : 'Simple, age-appropriate attire',
      colors: ['blue', 'yellow', 'green'],
      accessories: 'Simple, child-safe accessories'
    },
    personality: {
      traits: ['friendly', 'curious', 'kind', 'helpful'],
      expressions: 'Warm, engaging smile and bright eyes',
      posture: 'Open, confident and welcoming'
    },
    culturalBackground: isJewish ? 'Jewish background' : 'Universal, inclusive background',
    role: character.role || 'Supporting character'
  };
}

function createStructuredBookPlan(title, story, numImages, artStyle, characters) {
  const images = [];
  const totalImages = numImages + 2; // story + covers
  const mainCharacter = characters.find(c => c.role?.toLowerCase().includes('main')) || characters[0] || { name: 'Character' };
  
  // Front Cover
  images.push({
    page: 1,
    title: `${title} - Front Cover`,
    description: `Front cover illustration featuring ${mainCharacter.name} in the ${artStyle} style. ${mainCharacter.description || 'A friendly character'} stands prominently in the scene that represents the story theme. Warm, inviting colors and child-friendly composition.`,
    characters: [mainCharacter.name],
    environment: "Story setting that represents the main theme",
    mood: "Welcoming, engaging",
    composition: `${mainCharacter.name} prominently featured, eye-catching title placement`
  });
  
  // Story Pages
  for (let i = 2; i <= numImages + 1; i++) {
    const pageNum = i - 1;
    const isEarly = pageNum <= numImages / 3;
    const isMiddle = pageNum > numImages / 3 && pageNum <= (2 * numImages / 3);
    
    let mood, environment, sceneTitle;
    if (isEarly) {
      mood = "Curious, beginning adventure";
      environment = "Starting location, safe and familiar";
      sceneTitle = `${title} - Beginning the Journey`;
    } else if (isMiddle) {
      mood = "Adventurous, discovering";
      environment = "Main adventure setting";
      sceneTitle = `${title} - The Adventure Unfolds`;
    } else {
      mood = "Triumphant, learning";
      environment = "Resolution setting";
      sceneTitle = `${title} - Resolution`;
    }
    
    images.push({
      page: i,
      title: `${sceneTitle} - Page ${pageNum}`,
      description: `${artStyle} illustration showing ${mainCharacter.name} in the story. ${story ? story.substring(0, 150) : 'The character experiences growth and adventure'}. Scene depicts character development and story progression appropriate for children ages 3-8.`,
      characters: [mainCharacter.name],
      environment,
      mood,
      composition: `${mainCharacter.name} in engaging scene composition, child-friendly perspective`
    });
  }
  
  // Back Cover
  images.push({
    page: totalImages,
    title: `${title} - Back Cover`,
    description: `Back cover illustration in ${artStyle} style showing a peaceful conclusion to the story. ${mainCharacter.name} appears content and happy, having completed their journey. Gentle, satisfying conclusion that appeals to children.`,
    characters: [mainCharacter.name],
    environment: "Peaceful, concluding setting",
    mood: "Satisfied, peaceful",
    composition: "Calm, reassuring final scene"
  });
  
  return { images };
}

// ====================================================================
// API ENDPOINTS
// ====================================================================

// Job status endpoint
app.get('/api/job/:jobId', (req, res) => {
  try {
    const jobId = req.params.jobId;
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
    
    res.json(job);
  } catch (error) {
    log('error', 'Job status endpoint error', { error: error.message });
    res.status(500).json({ error: 'Failed to get job status' });
  }
});

// Story idea generation endpoint
app.post('/api/generate-story-idea', async (req, res) => {
  try {
    log('info', 'PHASE START: Story idea generation');
    
    const prompt = `You are a creative children's book author who creates engaging, age-appropriate stories for kids aged 3-8. Generate book ideas that are wholesome, educational, and fun.

I need you to create a children's book concept with the following requirements:
- Target age: 3-8 years old
- Story should be short and engaging  
- 4-8 pages of content (plus covers)
- Include a catchy title
- Brief story outline (2-4 sentences)
- Suggest number of pages between 4-8

IMPORTANT: Respond with pure JSON only. Do not use markdown code blocks or any other formatting. Just return the raw JSON object.

Respond in JSON format with exactly these fields:
{
  "title": "Book title here",
  "story": "Brief story outline here", 
  "numImages": 6
}

Make it creative, educational, and fun for children!`;

    log('info', 'Calling Gemini for story idea generation (fallback to OpenAI if needed)');
    let response;
    try {
      response = await geminiChat(prompt);
    } catch (error) {
      log('warn', 'Gemini failed, falling back to OpenAI', { error: error.message });
      const openAIPrompt = [
        { role: 'system', content: 'You are a creative children\'s book author.' },
        { role: 'user', content: prompt }
      ];
      response = await openAIChat(openAIPrompt, 'gpt-4o-mini');
    }
    
    log('debug', 'Raw story idea response', { responseLength: response.length });
    
    let storyIdea;
    try {
      storyIdea = JSON.parse(response);
      log('info', 'PHASE END: Story idea generation (parsed JSON)', storyIdea);
    } catch (e) {
      log('warn', 'Failed to parse JSON, trying to extract', { error: e.message });
      
      // Try to extract from markdown code blocks
      let jsonText = response;
      const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1].trim();
      } else {
        const match = response.match(/\{[\s\S]*\}/);
        if (match) {
          jsonText = match[0];
        }
      }
      
      if (jsonText) {
        storyIdea = JSON.parse(jsonText);
        log('info', 'PHASE END: Story idea generation (extracted JSON)', storyIdea);
      } else {
        log('error', 'No valid JSON found in response', { response });
        throw new Error('Failed to generate valid story idea');
      }
    }

    // Randomize numImages for variety (2-8 images)
    storyIdea.numImages = Math.floor(Math.random() * 7) + 2;
    
    log('info', 'Story idea generation completed successfully', storyIdea);
    res.json(storyIdea);
  } catch (err) {
    log('error', 'Story idea generation failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// Individual image generation endpoint
app.post('/api/generate-image', async (req, res) => {
  try {
    const { jobId, imageIndex } = req.body;
    
    if (!jobId || typeof imageIndex !== 'number') {
      return res.status(400).json({ error: 'Missing jobId or imageIndex' });
    }
    
    const job = getJob(jobId);
    if (!job || !job.plan) {
      return res.status(404).json({ error: 'Job not found or plan missing' });
    }
    
    const imageObj = job.plan.images[imageIndex];
    if (!imageObj) {
      return res.status(404).json({ error: 'Image not found in plan' });
    }
    
    const imageNum = imageIndex + 1;
    log('info', `Starting individual image generation ${imageNum}/${job.plan.images.length}`, { jobId, imageIndex });
    
    // Return immediately to avoid timeout
    res.json({ status: 'generating', imageIndex, imageNum });
    
    // Generate image in background
    try {
      updateJob(jobId, {
        currentPhase: `Generating image ${imageNum}/${job.plan.images.length}: ${imageObj.title || 'Untitled'}...`,
        currentImageIndex: imageIndex
      });
      
      console.log(`🖼️ GENERATING: Image ${imageNum}/${job.plan.images.length} - ${imageObj.title} | Job: ${jobId}`);
      
      // Create prompt for image generation
      const prompt = `Children's book illustration in ${job.artStyle || 'Watercolor'} style: ${imageObj.description}. Characters: ${imageObj.characters?.join(', ') || 'main character'}. Environment: ${imageObj.environment}. Mood: ${imageObj.mood}. Child-friendly, warm colors, professional illustration quality. NO text or words in image.`;
      
      const buf = await openAIImage(prompt, '1024x1024', 2, imageObj);
      
      // Store image data in job
      const imageData = buf.toString('base64');
      updateJob(jobId, {
        [`image_${imageIndex}`]: imageData,
        generatedImages: (job.generatedImages || 0) + 1
      });
      
      console.log(`✅ GENERATED: Image ${imageNum}/${job.plan.images.length} | Job: ${jobId}`);
      
      // Check if all images are complete
      const updatedJob = getJob(jobId);
      if (updatedJob.generatedImages >= updatedJob.totalImages) {
        updateJob(jobId, {
          currentPhase: 'All images complete - Building PDF...',
          completedSteps: updatedJob.totalImages + 2
        });
        console.log(`🎉 ALL IMAGES COMPLETE: Starting PDF generation | Job: ${jobId}`);
        
        // Trigger PDF generation
        setTimeout(async () => {
          try {
            const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `http://localhost:${PORT}`;
            const pdfResponse = await fetch(`${baseUrl}/api/generate-pdf`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jobId })
            });
            if (!pdfResponse.ok) {
              log('error', 'PDF generation request failed', { status: pdfResponse.status });
            }
          } catch (error) {
            log('error', 'PDF generation trigger failed', { error: error.message });
          }
        }, 1000);
      }
      
    } catch (error) {
      log('error', `Image generation failed for ${imageNum}`, { error: error.message, jobId });
      updateJob(jobId, {
        currentPhase: `Image ${imageNum} failed - ${error.message}`,
        error: error.message
      });
    }
    
  } catch (err) {
    log('error', 'Image generation endpoint error', { error: err.message });
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

// PDF generation endpoint
app.post('/api/generate-pdf', async (req, res) => {
  try {
    const { jobId } = req.body;
    
    if (!jobId) {
      return res.status(400).json({ error: 'Missing jobId' });
    }
    
    const job = getJob(jobId);
    if (!job || !job.plan) {
      return res.status(404).json({ error: 'Job not found or plan missing' });
    }
    
    log('info', 'Starting PDF generation', { jobId });
    
    // Return immediately to avoid timeout
    res.json({ status: 'generating pdf' });
    
    // Generate PDF in background
    try {
      updateJob(jobId, {
        currentPhase: 'Finalizing PDF - Creating document layout...',
        completedSteps: job.totalImages + 2
      });
      
      console.log(`📄 GENERATING: PDF for ${job.plan.title} | Job: ${jobId}`);
      
      // Collect all generated images
      const imageDataList = [];
      for (let i = 0; i < job.totalImages; i++) {
        const imageData = job[`image_${i}`];
        if (imageData) {
          imageDataList.push(Buffer.from(imageData, 'base64'));
        }
      }
      
      if (imageDataList.length !== job.totalImages) {
        throw new Error(`Missing images: found ${imageDataList.length} of ${job.totalImages}`);
      }
      
      // Generate PDF
      const pdfBuffer = await createPDF(job.plan, imageDataList, job.runId);
      
      // Upload to storage
      const pdfFilename = `${job.runId}-${job.plan.title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      const pdfUrl = await uploadToStorage(pdfBuffer, `books/${pdfFilename}`);
      
      // Complete the job
      updateJob(jobId, {
        status: 'completed',
        currentPhase: 'PDF generation complete!',
        completedSteps: job.totalImages + 3,
        result: {
          pdf: {
            type: 'url',
            url: pdfUrl,
            filename: pdfFilename
          }
        }
      });
      
      console.log(`🎉 PDF COMPLETE: ${pdfFilename} | Job: ${jobId}`);
      log('info', 'PDF generation completed successfully', { jobId, filename: pdfFilename });
      
    } catch (error) {
      log('error', 'PDF generation failed', { error: error.message, jobId });
      updateJob(jobId, {
        status: 'failed',
        error: error.message,
        currentPhase: 'PDF generation failed - ' + error.message
      });
    }
    
  } catch (err) {
    log('error', 'PDF generation endpoint error', { error: err.message });
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

// Main book generation endpoint
app.post('/api/generate', async (req, res) => {
  const jobId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  
  try {
    const { title, story, numImages, artStyle, characters } = req.body || {};
    log('debug', 'Request payload', { title, story, numImages, artStyle, characterCount: characters?.length });
    
    if (!title || !numImages || !Array.isArray(characters)) {
      log('error', 'Missing required fields', { hasTitle: !!title, hasNumImages: !!numImages, hasCharacters: Array.isArray(characters) });
      return res.status(400).json({ error: 'Missing required fields: title, numImages, characters[]' });
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
    
  } catch (err) {
    failJob(jobId, err);
    log('error', 'Book generation setup failed', { error: err.message, jobId });
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

// ====================================================================
// BACKGROUND PROCESSING
// ====================================================================

async function generateBookAsync(jobId, { title, story, numImages, artStyle, characters }) {
  try {
    // 1) Character Analysis (Serverless-optimized)
    const charactersWithInfo = characters.filter(ch => 
      (ch.name && ch.name.trim()) || 
      (ch.description && ch.description.trim()) || 
      (ch.age && ch.age.trim()) ||
      (ch.role && ch.role.trim())
    );
    
    updateJob(jobId, { currentPhase: `Analyzing ${charactersWithInfo.length} characters...`, completedSteps: 0 });
    log('info', 'PHASE START: Character analysis', { jobId, totalCharacters: characters.length, charactersWithInfo: charactersWithInfo.length });
    
    const analyses = [];
    if (charactersWithInfo.length > 0) {
      const maxCharacters = Math.min(charactersWithInfo.length, 3);
      log('info', `Processing ${maxCharacters} characters (serverless mode - structured analysis)`, { requested: charactersWithInfo.length, processing: maxCharacters });
      console.log(`🚀 FAST ANALYSIS: Processing ${maxCharacters} characters with structured analysis`);
      
      charactersWithInfo.slice(0, maxCharacters).forEach((ch, index) => {
        const characterName = ch.name || `Character ${index + 1}`;
        console.log(`⚡ INSTANT: ${characterName} | Using structured analysis`);
        
        const analysis = createStructuredCharacterAnalysis(ch);
        analyses.push(analysis);
        
        console.log(`✅ SUCCESS: ${characterName} | Analysis completed instantly`);
      });
      
      console.log(`🎯 COMPLETED: Character analysis finished | ${analyses.length}/${maxCharacters} characters processed`);
    } else {
      log('info', 'No characters with information found, skipping character analysis');
      console.log(`ℹ️  SKIPPED: No characters with information found`);
    }
    
    updateJob(jobId, { completedSteps: 1, currentPhase: 'Planning book structure...' });
    log('info', 'PHASE END: Character analysis', { characterCount: analyses.length, jobId });
    console.log(`🔄 TRANSITION: Analyzing characters → Plan JSON | Job: ${jobId} | Completed: ${analyses.length} characters`);

    // 2) Book Planning (Serverless-optimized)
    const totalImages = numImages + 2;
    log('info', 'PHASE START: Book planning');
    
    log('info', 'Using structured book planning (serverless optimized)');
    console.log(`📋 FAST PLANNING: Creating structured book plan for ${totalImages} images`);
    
    const plan = createStructuredBookPlan(title, story, numImages, artStyle, characters);
    console.log(`✅ PLANNED: Book structure created instantly with ${plan.images.length} images`);
    
    updateJob(jobId, { completedSteps: 2, currentPhase: 'Starting image generation...' });
    log('info', 'PHASE END: Book planning', { imageCount: plan.images?.length || 0, expectedCount: totalImages, jobId });
    console.log(`🔄 TRANSITION: Plan JSON → Create cover + pages | Job: ${jobId} | Images planned: ${plan.images?.length || 0}`);
    
    // Validate plan structure
    if (!plan.images || !Array.isArray(plan.images)) {
      log('error', 'Plan validation failed - no images array', plan);
      throw new Error('Plan must contain an "images" array');
    }
    
    // 3) Prepare for Image Generation
    log('info', 'PHASE START: Preparing for image generation');
    const runId = Date.now().toString(36);
    
    updateJob(jobId, { 
      completedSteps: 2, 
      currentPhase: 'Ready for image generation...',
      plan: plan,
      runId: runId,
      totalImages: plan.images.length,
      generatedImages: 0,
      artStyle: artStyle
    });
    
    console.log(`🚀 TRIGGERING: Starting individual image generation | Job: ${jobId}`);
    
    updateJob(jobId, {
      completedSteps: 2,
      currentPhase: `Generating image 1/${plan.images.length}: ${plan.images[0]?.title || 'Untitled'}...`,
      progress: Math.round((2 / (plan.images.length + 3)) * 100),
      currentImageIndex: 0
    });
    
    log('info', 'PHASE END: Background processing setup complete', { jobId });
    console.log(`🎯 SETUP COMPLETE: Job ready for image generation | Job: ${jobId}`);
    
  } catch (err) {
    failJob(jobId, err);
    log('error', 'Book generation failed', { 
      error: err.message, 
      stack: err.stack,
      timestamp: new Date().toISOString(),
      jobId
    });
  }
}

// ====================================================================
// SERVER STARTUP
// ====================================================================

// Validation
if (!OPENAI_API_KEY) {
  log('error', 'Missing OPENAI_API_KEY in environment variables');
}

if (!GEMINI_API_KEY) {
  log('error', 'Missing GEMINI_API_KEY in environment variables');
}

log('info', `Server starting on port ${PORT}`);
log('info', 'OpenAI API Key configured: ' + (OPENAI_API_KEY ? 'Yes' : 'No'));
log('info', 'Gemini API Key configured: ' + (GEMINI_API_KEY ? 'Yes' : 'No'));

// Start server (local development only)
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    log('info', `Server running at http://localhost:${PORT}`);
    log('info', 'Available endpoints:');
    log('info', '  POST /api/generate-story-idea - Generate story from scratch');
    log('info', '  POST /api/generate - Generate complete book');
    log('info', '  POST /api/generate-image - Generate individual image');
    log('info', '  POST /api/generate-pdf - Generate PDF');
    log('info', '  GET /api/job/:jobId - Get job status');
    log('info', 'Server ready to accept requests');
  });
}

// Export for Vercel serverless
export default app;