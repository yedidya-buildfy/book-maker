import 'dotenv/config';
import fs from 'fs';

async function testOpenAIImageGeneration() {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  
  console.log('🧪 Testing OpenAI Image Generation API');
  console.log('='.repeat(50));
  
  // Check if API key is configured
  if (!OPENAI_API_KEY || OPENAI_API_KEY === 'undefined') {
    console.error('❌ OPENAI_API_KEY not found in environment variables');
    console.log('Please make sure your .env file contains a valid OPENAI_API_KEY');
    return;
  }
  
  console.log('✅ OpenAI API Key found:', OPENAI_API_KEY.substring(0, 20) + '...');
  
  const testPrompt = "A friendly cartoon cat reading a book in a cozy library, children's book illustration style";
  
  console.log('\n📝 Test Prompt:', testPrompt);
  console.log('\n🚀 Starting image generation...');
  
  try {
    const startTime = Date.now();
    
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: testPrompt,
        size: '1024x1024',
        quality: 'standard',
        n: 1
      })
    });
    
    const responseTime = Date.now() - startTime;
    console.log(`⏱️  Response received in ${responseTime}ms`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ API Error (${response.status}):`, errorText);
      
      if (response.status === 401) {
        console.log('\n💡 This suggests your API key is invalid or expired');
        console.log('   Please check your OpenAI account and generate a new key');
      } else if (response.status === 429) {
        console.log('\n💡 This suggests you hit a rate limit');
        console.log('   Please wait a moment and try again');
      } else if (response.status === 402) {
        console.log('\n💡 This suggests insufficient credits/quota');
        console.log('   Please check your OpenAI billing and usage');
      }
      return;
    }
    
    const data = await response.json();
    const imageUrl = data.data?.[0]?.url;
    
    if (!imageUrl) {
      console.error('❌ No image URL returned from API');
      console.log('Response data:', JSON.stringify(data, null, 2));
      return;
    }
    
    console.log('✅ Image generated successfully!');
    console.log('🔗 Image URL:', imageUrl);
    
    // Download and save the image locally for verification
    console.log('\n📥 Downloading image...');
    const imageResponse = await fetch(imageUrl);
    
    if (!imageResponse.ok) {
      console.error('❌ Failed to download image from URL');
      return;
    }
    
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    const filename = `test-image-${Date.now()}.png`;
    fs.writeFileSync(filename, imageBuffer);
    
    console.log(`✅ Image saved as: ${filename}`);
    console.log(`📊 Image size: ${imageBuffer.length} bytes`);
    console.log(`⏱️  Total time: ${Date.now() - startTime}ms`);
    
    console.log('\n🎉 OpenAI Image Generation API test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    
    if (error.message.includes('fetch')) {
      console.log('\n💡 This might be a network connectivity issue');
    } else if (error.message.includes('timeout')) {
      console.log('\n💡 The request timed out - image generation can take time');
    }
  }
}

// Run the test
testOpenAIImageGeneration().catch(console.error);