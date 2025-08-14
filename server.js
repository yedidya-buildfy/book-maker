import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import Jimp from 'jimp';

const app = express();
const PORT = process.env.PORT || 8080;
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

if(!OPENAI_API_KEY){
  log('error', 'Missing OPENAI_API_KEY in .env');
  process.exit(1);
}

log('info', `Server starting on port ${PORT}`);
log('info', 'OpenAI API Key configured: ' + (OPENAI_API_KEY ? 'Yes' : 'No'));

app.use(express.json({limit: '40mb'}));

// Static file serving with proper MIME types
app.use('/output', express.static('output'));

// Only use static middleware in development (not on Vercel)
if (process.env.NODE_ENV !== 'production') {
  app.use(express.static('client', {
    setHeaders: (res, path) => {
      if (path.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css');
      } else if (path.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript');
      } else if (path.endsWith('.webmanifest')) {
        res.setHeader('Content-Type', 'application/manifest+json');
      } else if (path.endsWith('.ico')) {
        res.setHeader('Content-Type', 'image/x-icon');
      } else if (path.endsWith('.png')) {
        res.setHeader('Content-Type', 'image/png');
      }
    }
  }));
}

// Explicitly serve static files (needed for Vercel)
app.get('/app.js', (req, res) => {
  log('debug', 'Serving app.js');
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(process.cwd(), 'client', 'app.js'), (err) => {
    if (err) {
      log('error', 'Failed to serve app.js', { error: err.message });
      res.status(404).send('File not found');
    }
  });
});

app.get('/style.css', (req, res) => {
  log('debug', 'Serving style.css');
  res.setHeader('Content-Type', 'text/css');
  res.sendFile(path.join(process.cwd(), 'client', 'style.css'), (err) => {
    if (err) {
      log('error', 'Failed to serve style.css', { error: err.message });
      res.status(404).send('File not found');
    }
  });
});

app.get('/favicon.ico', (req, res) => {
  log('debug', 'Serving favicon.ico');
  res.setHeader('Content-Type', 'image/x-icon');
  res.sendFile(path.join(process.cwd(), 'client', 'favicon.ico'), (err) => {
    if (err) {
      log('error', 'Failed to serve favicon.ico', { error: err.message });
      res.status(404).send('File not found');
    }
  });
});

app.get('/favicon-16x16.png', (req, res) => {
  log('debug', 'Serving favicon-16x16.png');
  res.setHeader('Content-Type', 'image/png');
  res.sendFile(path.join(process.cwd(), 'client', 'favicon-16x16.png'), (err) => {
    if (err) {
      log('error', 'Failed to serve favicon-16x16.png', { error: err.message });
      res.status(404).send('File not found');
    }
  });
});

app.get('/favicon-32x32.png', (req, res) => {
  log('debug', 'Serving favicon-32x32.png');
  res.setHeader('Content-Type', 'image/png');
  res.sendFile(path.join(process.cwd(), 'client', 'favicon-32x32.png'), (err) => {
    if (err) {
      log('error', 'Failed to serve favicon-32x32.png', { error: err.message });
      res.status(404).send('File not found');
    }
  });
});

app.get('/assets/icons/icon-192.png', (req, res) => {
  res.setHeader('Content-Type', 'image/png');
  res.sendFile(path.join(process.cwd(), 'client', 'assets', 'icons', 'icon-192.png'));
});

app.get('/assets/icons/icon-512.png', (req, res) => {
  res.setHeader('Content-Type', 'image/png');
  res.sendFile(path.join(process.cwd(), 'client', 'assets', 'icons', 'icon-512.png'));
});

// Explicit route handlers
app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'client', 'index.html'));
});

app.get('/manifest.webmanifest', (req, res) => {
  log('debug', 'Serving manifest.webmanifest');
  res.setHeader('Content-Type', 'application/manifest+json');
  res.sendFile(path.join(process.cwd(), 'client', 'manifest.webmanifest'), (err) => {
    if (err) {
      log('error', 'Failed to serve manifest.webmanifest', { error: err.message });
      res.status(404).send('File not found');
    }
  });
});

// Catch-all route for other static files
app.get('*', (req, res) => {
  log('debug', 'Catch-all route hit', { path: req.path });
  
  // Try to serve from client directory
  const filePath = path.join(process.cwd(), 'client', req.path);
  if (fs.existsSync(filePath)) {
    log('debug', 'Serving file from client directory', { path: req.path });
    res.sendFile(filePath);
  } else {
    log('warn', 'File not found', { path: req.path });
    res.status(404).send('File not found');
  }
});

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

// ---- OpenAI helpers ----
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

// ---- Utility ----
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

// ---- Pipeline ----
app.get('/api/job/:jobId', (req, res) => {
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
});

app.post('/api/generate-story-idea', async (req, res) => {
  log('info', 'PHASE START: Story idea generation');
  
  try {
    const prompt = [
      {role: 'system', content: 'You are a creative children\'s book author who creates engaging, age-appropriate stories for kids aged 3-8. Generate book ideas that are wholesome, educational, and fun.'},
      {role: 'user', content: `Create a children's book concept with the following requirements:
- Target age: 3-8 years old
- Story should be short and engaging
- 4-8 pages of content (plus covers)
- Include a catchy title
- Brief story outline (2-4 sentences)
- Suggest number of pages between 4-8

Respond in JSON format with exactly these fields:
{
  "title": "Book title here",
  "story": "Brief story outline here",
  "numImages": 6
}

Make it creative, educational, and fun for children!`}
    ];

    log('info', 'Calling OpenAI for story idea generation');
    const response = await openAIChat(prompt, 'gpt-3.5-turbo');
    log('debug', 'Raw story idea response', { responseLength: response.length, preview: response.substring(0, 200) });
    
    let storyIdea;
    try {
      storyIdea = JSON.parse(response);
      log('info', 'PHASE END: Story idea generation (parsed JSON)', storyIdea);
    } catch (e) {
      log('warn', 'Failed to parse JSON, trying to extract', { error: e.message });
      const match = response.match(/\{[\s\S]*\}/);
      if (match) {
        storyIdea = JSON.parse(match[0]);
        log('info', 'PHASE END: Story idea generation (extracted JSON)', storyIdea);
      } else {
        log('error', 'No valid JSON found in response', { response });
        throw new Error('Failed to generate valid story idea');
      }
    }

    // Ensure numImages is within range
    if (!storyIdea.numImages || storyIdea.numImages < 4 || storyIdea.numImages > 8) {
      const oldValue = storyIdea.numImages;
      storyIdea.numImages = Math.floor(Math.random() * 5) + 4; // 4-8
      log('info', 'Adjusted numImages to valid range', { from: oldValue, to: storyIdea.numImages });
    }

    log('info', 'Story idea generation completed successfully', storyIdea);
    res.json(storyIdea);
  } catch (err) {
    log('error', 'Story idea generation failed', { error: err.message, stack: err.stack });
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/generate', async (req, res) => {
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
});

async function generateBookAsync(jobId, { title, story, numImages, artStyle, characters }) {
  try {

    // 1) Character analyses (image->text): only for characters with images
    const charactersWithImages = characters.filter(ch => ch.image && ch.image.trim());
    updateJob(jobId, { currentPhase: `Analyzing ${charactersWithImages.length} characters with images...`, completedSteps: 0 });
    log('info', 'PHASE START: Character analysis', { jobId, totalCharacters: characters.length, charactersWithImages: charactersWithImages.length });
    
    const analyses = [];
    if (charactersWithImages.length > 0) {
      for(let i = 0; i < charactersWithImages.length; i++){
        const ch = charactersWithImages[i];
        log('info', `Analyzing character ${i + 1}: ${ch.name || 'Unnamed'}`, { hasImage: true, role: ch.role });
        
        const content = [
          {role:'system', content:`You are a character bible creator for children's books. Create ULTRA-DETAILED character descriptions for absolute visual consistency across all images.

CRITICAL: Provide EXACT specifications for:
- Age: specific age (e.g. "exactly 7 years old")  
- Face: precise facial features, eye color, nose shape, mouth, expression
- Hair: exact color, texture, length, style (be very specific)
- Clothing: detailed outfit description including colors, patterns, accessories
- Body: height, build, posture, distinctive features
- Personality traits: reflected in posture and expression
- Color palette: list exact colors used (hex codes if possible)

This character MUST look identical in every single image. Be extremely detailed and specific.`},
          {role:'user', content: [
            {"type":"text","text":`Character name: ${ch.name||'Unknown'}\nRole: ${ch.role||''}\n\nCreate an ultra-detailed character bible entry that will ensure perfect visual consistency across all illustrations. Include every visual detail needed for an artist to draw this character identically every time.`},
            {"type":"image_url","image_url":{"url": ch.image }}
          ]}
        ];
        
        try {
          const analysis = await openAIChat(content, 'gpt-4o'); // Always use gpt-4o for image analysis
          analyses.push({ name: ch.name, role: ch.role, analysis });
          log('info', `Character analysis completed for ${ch.name}`, { analysisLength: analysis.length });
        } catch (error) {
          log('error', `Character analysis failed for ${ch.name}`, { error: error.message });
          throw error;
        }
      }
    } else {
      log('info', 'No characters with images found, skipping character analysis');
    }
    updateJob(jobId, { completedSteps: 1, currentPhase: 'Planning book structure...' });
    log('info', 'PHASE END: Character analysis', { characterCount: analyses.length, jobId });

    // 2) Planning (JSON): gpt-4o
    const totalImages = numImages + 2; // story images + front cover + back cover
    log('info', 'PHASE START: Book planning');
    const characterInfo = analyses.length > 0 
      ? `Characters with detailed bibles: ${analyses.map(a=>`${a.name} - ${a.analysis.substring(0,200)}...`).join('; ')}`
      : `Characters from story: ${characters.map(c => `${c.name} (${c.role})`).join(', ') || 'Create characters from story context'}`;

    const planningPrompt = [
      {role:'system', content:"You are a children's book art director. Create a JSON plan with image descriptions. Output valid JSON only."},
      {role:'user', content:`Create a JSON plan for ${totalImages} images:
- Image 1: Front cover (flat 2D artwork, not book mockup)
- Images 2-${numImages + 1}: Story scenes (${numImages} total)
- Image ${totalImages}: Back cover (flat 2D artwork, not book mockup)

Book: "${title}"
Story: ${story || 'Create scenes from title'}
Art Style: ${artStyle}
${characterInfo}

Return JSON: {"images": [{"page":1, "title":"scene name", "description":"detailed scene", "characters":["name1"], "environment":"setting"}]}

Make ${totalImages} image objects with engaging scenes that tell the story.`}
    ];
    
    log('info', 'Calling OpenAI for book planning');
    const planText = await openAIChat(planningPrompt, 'gpt-3.5-turbo');
    log('debug', 'Raw planning response', { responseLength: planText.length, preview: planText.substring(0, 300) });
    
    let plan;
    try{ 
      plan = JSON.parse(planText);
      updateJob(jobId, { completedSteps: 2, currentPhase: 'Starting image generation...' });
      log('info', 'PHASE END: Book planning (parsed JSON)', { 
        imageCount: plan.images?.length || 0,
        expectedCount: totalImages,
        jobId
      });
    }
    catch(e){
      log('warn', 'Failed to parse planning JSON, trying to extract', { error: e.message });
      const m = planText.match(/\{[\s\S]*\}$/);
      if(m) {
        try {
          plan = JSON.parse(m[0]);
          log('info', 'PHASE END: Book planning (extracted JSON)', { 
            imageCount: plan.images?.length || 0,
            expectedCount: totalImages
          });
        } catch (extractError) {
          log('error', 'Extracted text was not valid JSON', { extractError: extractError.message, extractedTextPreview: m[0].substring(0, 200) });
          throw new Error('Failed to generate valid book plan');
        }
      }
      else {
        log('error', 'No valid JSON found in planning response', { response: planText });
        throw new Error('Failed to generate valid book plan');
      }
    }
    
    // Validate plan structure
    if (!plan.images || !Array.isArray(plan.images)) {
      log('error', 'Plan validation failed - no images array', plan);
      throw new Error('Plan must contain an "images" array');
    }
    
    // Flexible image count handling - adjust to what AI generated
    const actualImages = plan.images.length;
    if (actualImages !== totalImages) {
      log('warn', 'AI generated different image count than expected, adjusting', { 
        expectedImages: totalImages, 
        actualImages: actualImages
      });
      // Update job total steps to match actual images
      updateJob(jobId, { 
        totalSteps: actualImages + 3 // character analysis + planning + actual images + PDF
      });
    }
    
    log('info', 'Plan validation passed', { 
      expectedImages: totalImages,
      actualImages: actualImages,
      jobId
    });

    // 3) Generate images and build PDF simultaneously
    log('info', 'PHASE START: Image generation and PDF creation');
    const runId = Date.now().toString(36);
    const outDir = path.join('output', runId);
    fs.mkdirSync(outDir, { recursive: true });
    log('info', `Created output directory: ${outDir}`);

    const charImages = characters.filter(c => c.image).map(c => c.image);
    log('info', `Creating character board from ${charImages.length} character images`);
    const board = await makeCharacterBoard(charImages);
    if (board) {
      fs.writeFileSync(path.join(outDir, 'characters-board.png'), board);
      log('info', 'Character board saved');
    }

    const charSummary = analyses.length > 0 
      ? analyses.map(a => `${a.name}: ${a.analysis}`).join('\n')
      : characters.map(c => `${c.name}: ${c.role}`).join('\n');
    const hasCharacterBoard = !!board;

    function scenePrompt(imageObj, imageIndex) {
      const isFirstImage = imageIndex === 0;
      const isLastImage = imageIndex === plan.images.length - 1;
      
      // Determine if this is a cover
      const isCover = isFirstImage || isLastImage;
      const coverType = isFirstImage ? 'FRONT COVER ARTWORK' : (isLastImage ? 'BACK COVER ARTWORK' : '');
      
      const prompt = [
        // Main description - emphasize SINGLE SCENE
        isCover ? `${coverType} (flat 2D illustration, full-bleed portrait)` : `SINGLE SCENE: ${imageObj.title || 'Story Scene'}`,
        `Scene: ${imageObj.description || ''}`,
        
        // Character references  
        imageObj.characters && imageObj.characters.length > 0 ? `Characters: ${imageObj.characters.join(', ')}` : '',
        hasCharacterBoard ? `Reference: match faces, hair, clothing and palette from the attached character board (internal)` : '',
        analyses.length > 0 ? `Character Bible:\n${charSummary}` : `Character Info:\n${charSummary}`,
        
        // Visual specifications
        `Environment: ${imageObj.environment || ''}`,
        `Lighting: ${imageObj.lighting || 'warm, consistent lighting'}`,
        `Composition: ${imageObj.composition || ''}`,
        `Color Palette: ${imageObj.palette || ''} (maintain consistency across all images)`,
        `Props: ${imageObj.props || ''}`,
        `Continuity: ${imageObj.continuity || ''}`,
        
        // Style specifications
        `Art Style: ${artStyle} - maintain absolute consistency`,
        imageObj.style_notes ? `Style Notes: ${imageObj.style_notes}` : '',
        
        // Quality and constraints
        `Quality: professional children's book illustration, consistent art style, warm cozy lighting, soft textures, gentle outlines, child-safe`,
        
        // Critical constraints
        `CRITICAL CONSTRAINTS:`,
        `- Show ONLY ONE SCENE, not multiple scenes or montages`,
        `- NEVER include any text, letters, or words in the illustration`,
        `- Maintain perfect character consistency using character bible`,
        `- Keep lighting and color palette consistent with other images`,
        isCover ? `- This is ${coverType.toLowerCase()}, NOT a photo of a book or book mockup` : '',
        isCover ? `- Flat 2D illustration only, full-bleed portrait format` : '',
        `- ${artStyle} style maintained throughout`,
        
        // Negative prompts
        `AVOID: text, letters, words, signatures, watermarks, book mockups, 3D book renders, photo of book${isCover ? ', book covers with visible spines or thickness' : ''}, multiple scenes, scene montages, comic panels`,
        
        // Strong style enforcement at the end
        `Make all as one scene, style: ${artStyle}`
      ].filter(Boolean).join('\n');
      
      log('debug', `Generated scene prompt for ${isCover ? coverType : 'story scene'} ${imageObj.page}`, { 
        title: imageObj.title, 
        promptLength: prompt.length,
        isCover,
        hasCharacterBoard
      });
      return prompt;
    }

    // Create PDF filename from book title (sanitize for filesystem)
    const sanitizedTitle = title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').substring(0, 50);
    const pdfFilename = sanitizedTitle ? `${sanitizedTitle}.pdf` : 'book.pdf';
    const pdfPath = path.join(outDir, pdfFilename);
    const doc = new PDFDocument({ autoFirstPage: false });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);
    const A4 = { w: 595.28, h: 841.89 };

    function addFull(imagePath) {
      log('debug', `Adding page to PDF: ${path.basename(imagePath)}`);
      doc.addPage({ size: 'A4', margin: 0 });
      doc.image(imagePath, 0, 0, { width: A4.w, height: A4.h });
    }

    // Generate all images with limited concurrency
    const CONCURRENCY_LIMIT = 3; // Generate max 3 images simultaneously
    log('info', `PHASE START: Generating ${plan.images.length} images with concurrency ${CONCURRENCY_LIMIT}`, { jobId });
    
    async function generateSingleImage(imageObj, imageIndex) {
      const imageNum = imageIndex + 1;
      
      // Update progress for this image
      updateJob(jobId, { 
        completedSteps: 2 + imageIndex,
        currentPhase: `Generating image ${imageNum}/${plan.images.length}: ${imageObj.title || 'Untitled'}...`,
        progress: Math.round(((2 + imageIndex) / (plan.images.length + 3)) * 100)
      });
      
      log('info', `Starting generation of image ${imageNum}/${plan.images.length}: ${imageObj.title || 'Untitled'}`, { jobId });
      const buf = await openAIImage(scenePrompt(imageObj, imageIndex));
      const imagePath = path.join(outDir, `image-${String(imageNum).padStart(2,'0')}.png`);
      fs.writeFileSync(imagePath, buf);
      log('info', `Image ${imageNum} generated successfully`, { jobId });
      
      return { imagePath, imageIndex };
    }
    
    // Process images with limited concurrency
    const imageResults = [];
    for (let i = 0; i < plan.images.length; i += CONCURRENCY_LIMIT) {
      const batch = plan.images.slice(i, i + CONCURRENCY_LIMIT);
      const batchPromises = batch.map((imageObj, batchIndex) => 
        generateSingleImage(imageObj, i + batchIndex)
      );
      
      log('info', `Processing batch ${Math.floor(i/CONCURRENCY_LIMIT) + 1} with ${batch.length} images`, { jobId });
      const batchResults = await Promise.all(batchPromises);
      imageResults.push(...batchResults);
      
      log('info', `Batch ${Math.floor(i/CONCURRENCY_LIMIT) + 1} completed`, { jobId });
    }
    
    // Add all images to PDF in correct order
    log('info', 'Adding all images to PDF in correct order', { jobId });
    imageResults
      .sort((a, b) => a.imageIndex - b.imageIndex)
      .forEach(({ imagePath }) => addFull(imagePath));
    log('info', 'PHASE END: All images generated and added to PDF', { jobId });

    // Finalize the PDF
    updateJob(jobId, { 
      completedSteps: plan.images.length + 2, 
      currentPhase: 'Finalizing PDF...', 
      progress: 95 
    });
    log('info', 'PHASE START: Finalizing PDF', { jobId });
    doc.end();
    
    // Wait for PDF to finish writing
    await new Promise(r=>stream.on('finish', r));
    log('info', 'PHASE END: PDF finalized and written to disk', { pdfPath, jobId });

    const result = { pdfUrl: `/output/${runId}/${pdfFilename}`, runId };
    completeJob(jobId, result);
    log('info', 'Book generation completed successfully', { result, jobId });
    
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

app.listen(PORT, ()=> {
  log('info', `Server running at http://localhost:${PORT}`);
  log('info', 'Available endpoints:');
  log('info', '  POST /api/generate-story-idea - Generate story from scratch');
  log('info', '  POST /api/generate - Generate complete book');
  log('info', '  GET /output/* - Serve generated files');
  log('info', 'Server ready to accept requests');
});
