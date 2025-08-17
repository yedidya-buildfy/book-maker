import jimp from 'jimp';
import fs from 'fs';
import path from 'path';

// Create fallback images when OpenAI isn't available
export async function createFallbackImage(title, description, size = 1024) {
  try {
    // Create a simple colored background image with text
    const image = new jimp(size, size, getColorForTitle(title));
    
    // Load a font
    const font = await jimp.loadFont(jimp.FONT_SANS_32_WHITE);
    
    // Add title text
    const titleLines = wrapText(title, 25);
    let yOffset = size * 0.2;
    
    titleLines.forEach(line => {
      const textWidth = jimp.measureText(font, line);
      const x = (size - textWidth) / 2;
      image.print(font, x, yOffset, line);
      yOffset += 50;
    });
    
    // Add description text with smaller font
    const smallFont = await jimp.loadFont(jimp.FONT_SANS_16_WHITE);
    const descLines = wrapText(description, 40);
    yOffset += 50;
    
    descLines.slice(0, 8).forEach(line => { // Limit to 8 lines
      const textWidth = jimp.measureText(smallFont, line);
      const x = (size - textWidth) / 2;
      image.print(smallFont, x, yOffset, line);
      yOffset += 25;
    });
    
    // Add a simple frame
    image.scan(0, 0, size, size, function (x, y, idx) {
      if (x < 10 || x > size - 10 || y < 10 || y > size - 10) {
        this.bitmap.data[idx + 0] = 255; // Red
        this.bitmap.data[idx + 1] = 255; // Green  
        this.bitmap.data[idx + 2] = 255; // Blue
        this.bitmap.data[idx + 3] = 255; // Alpha
      }
    });
    
    // Convert to buffer
    const buffer = await image.getBufferAsync(jimp.MIME_PNG);
    return buffer;
    
  } catch (error) {
    console.error('Failed to create fallback image:', error);
    // Return a simple solid color image as last resort
    const simpleImage = new jimp(size, size, 0x4285F4FF);
    return await simpleImage.getBufferAsync(jimp.MIME_PNG);
  }
}

function getColorForTitle(title) {
  // Generate a color based on the title
  const colors = [
    0x4285F4FF, // Google Blue
    0x34A853FF, // Google Green
    0xFBBC04FF, // Google Yellow
    0xEA4335FF, // Google Red
    0x9C27B0FF, // Purple
    0xFF5722FF, // Orange
    0x795548FF, // Brown
    0x607D8BFF  // Blue Grey
  ];
  
  const hash = title.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

function wrapText(text, maxLength) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  
  words.forEach(word => {
    if ((currentLine + word).length <= maxLength) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  });
  
  if (currentLine) lines.push(currentLine);
  return lines;
}

export async function createSetupGuideImage() {
  const size = 1024;
  const image = new jimp(size, size, 0x2196F3FF); // Blue background
  
  const titleFont = await jimp.loadFont(jimp.FONT_SANS_32_WHITE);
  const bodyFont = await jimp.loadFont(jimp.FONT_SANS_16_WHITE);
  
  // Title
  const title = "OpenAI Setup Required";
  const titleWidth = jimp.measureText(titleFont, title);
  image.print(titleFont, (size - titleWidth) / 2, 200, title);
  
  // Instructions
  const instructions = [
    "To generate images, you need:",
    "1. Valid OpenAI API key",
    "2. Billing setup with credits",
    "3. DALL-E access enabled",
    "",
    "Visit platform.openai.com",
    "Update your .env file",
    "Then restart the app"
  ];
  
  let yPos = 300;
  instructions.forEach(line => {
    const textWidth = jimp.measureText(bodyFont, line);
    image.print(bodyFont, (size - textWidth) / 2, yPos, line);
    yPos += 30;
  });
  
  return await image.getBufferAsync(jimp.MIME_PNG);
}