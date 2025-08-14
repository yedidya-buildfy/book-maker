import 'dotenv/config';

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
}
