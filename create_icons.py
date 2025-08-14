#!/usr/bin/env python3
"""
Create favicon and PWA icons based on the lion character design.
This script recreates the cute cartoon lion with orange mane on light blue background.
"""
from PIL import Image, ImageDraw
import os

def create_lion_icon(size):
    """Create a lion icon of specified size"""
    # Create image with light blue background
    img = Image.new('RGBA', (size, size), (135, 206, 206, 255))  # Light blue background
    draw = ImageDraw.Draw(img)
    
    # Scale factors based on size
    scale = size / 512
    
    # Lion design coordinates (scaled)
    center_x, center_y = size // 2, size // 2
    
    # Mane (orange circle)
    mane_radius = int(180 * scale)
    mane_color = (255, 140, 60, 255)  # Orange
    draw.ellipse([center_x - mane_radius, center_y - mane_radius, 
                  center_x + mane_radius, center_y + mane_radius], 
                 fill=mane_color, outline=(139, 69, 19, 255), width=int(8 * scale))
    
    # Face (yellow circle)
    face_radius = int(120 * scale)
    face_color = (255, 220, 100, 255)  # Yellow
    draw.ellipse([center_x - face_radius, center_y - face_radius, 
                  center_x + face_radius, center_y + face_radius], 
                 fill=face_color, outline=(139, 69, 19, 255), width=int(6 * scale))
    
    # Ears
    ear_size = int(40 * scale)
    ear_offset_x = int(70 * scale)
    ear_offset_y = int(80 * scale)
    
    # Left ear
    draw.ellipse([center_x - ear_offset_x - ear_size, center_y - ear_offset_y - ear_size,
                  center_x - ear_offset_x + ear_size, center_y - ear_offset_y + ear_size],
                 fill=face_color, outline=(139, 69, 19, 255), width=int(4 * scale))
    
    # Right ear  
    draw.ellipse([center_x + ear_offset_x - ear_size, center_y - ear_offset_y - ear_size,
                  center_x + ear_offset_x + ear_size, center_y - ear_offset_y + ear_size],
                 fill=face_color, outline=(139, 69, 19, 255), width=int(4 * scale))
    
    # Inner ears
    inner_ear_size = int(20 * scale)
    draw.ellipse([center_x - ear_offset_x - inner_ear_size, center_y - ear_offset_y - inner_ear_size,
                  center_x - ear_offset_x + inner_ear_size, center_y - ear_offset_y + inner_ear_size],
                 fill=(255, 180, 120, 255))
    draw.ellipse([center_x + ear_offset_x - inner_ear_size, center_y - ear_offset_y - inner_ear_size,
                  center_x + ear_offset_x + inner_ear_size, center_y - ear_offset_y + inner_ear_size],
                 fill=(255, 180, 120, 255))
    
    # Eyes
    eye_size = int(25 * scale)
    eye_offset_x = int(35 * scale)
    eye_offset_y = int(20 * scale)
    eye_color = (70, 40, 20, 255)  # Brown
    
    # Left eye
    draw.ellipse([center_x - eye_offset_x - eye_size, center_y - eye_offset_y - eye_size,
                  center_x - eye_offset_x + eye_size, center_y - eye_offset_y + eye_size],
                 fill=eye_color)
    
    # Right eye
    draw.ellipse([center_x + eye_offset_x - eye_size, center_y - eye_offset_y - eye_size,
                  center_x + eye_offset_x + eye_size, center_y - eye_offset_y + eye_size],
                 fill=eye_color)
    
    # Eye highlights
    highlight_size = int(8 * scale)
    highlight_offset = int(8 * scale)
    draw.ellipse([center_x - eye_offset_x - highlight_offset - highlight_size, center_y - eye_offset_y - highlight_offset - highlight_size,
                  center_x - eye_offset_x - highlight_offset + highlight_size, center_y - eye_offset_y - highlight_offset + highlight_size],
                 fill=(255, 255, 255, 255))
    draw.ellipse([center_x + eye_offset_x - highlight_offset - highlight_size, center_y - eye_offset_y - highlight_offset - highlight_size,
                  center_x + eye_offset_x - highlight_offset + highlight_size, center_y - eye_offset_y - highlight_offset + highlight_size],
                 fill=(255, 255, 255, 255))
    
    # Nose
    nose_size = int(15 * scale)
    nose_offset_y = int(10 * scale)
    draw.ellipse([center_x - nose_size, center_y + nose_offset_y - nose_size,
                  center_x + nose_size, center_y + nose_offset_y + nose_size],
                 fill=(139, 69, 19, 255))
    
    # Mouth
    mouth_width = int(6 * scale)
    mouth_offset_y = int(35 * scale)
    draw.arc([center_x - int(30 * scale), center_y + mouth_offset_y - int(20 * scale),
              center_x + int(30 * scale), center_y + mouth_offset_y + int(20 * scale)],
             start=0, end=180, fill=(139, 69, 19, 255), width=mouth_width)
    
    # Whiskers
    whisker_length = int(40 * scale)
    whisker_width = int(3 * scale)
    whisker_offset_y = int(10 * scale)
    
    # Left whiskers
    for i, y_offset in enumerate([-10, 0, 10]):
        y_pos = center_y + whisker_offset_y + int(y_offset * scale)
        draw.line([center_x - face_radius - int(10 * scale), y_pos,
                   center_x - face_radius - whisker_length, y_pos],
                  fill=(139, 69, 19, 255), width=whisker_width)
    
    # Right whiskers  
    for i, y_offset in enumerate([-10, 0, 10]):
        y_pos = center_y + whisker_offset_y + int(y_offset * scale)
        draw.line([center_x + face_radius + int(10 * scale), y_pos,
                   center_x + face_radius + whisker_length, y_pos],
                  fill=(139, 69, 19, 255), width=whisker_width)
    
    return img

def main():
    # Create directories if they don't exist
    os.makedirs('client/assets/icons', exist_ok=True)
    
    # Create different sized icons
    sizes_and_paths = [
        (192, 'client/assets/icons/icon-192.png'),
        (512, 'client/assets/icons/icon-512.png'),
        (32, 'client/favicon-32x32.png'),
        (16, 'client/favicon-16x16.png')
    ]
    
    for size, path in sizes_and_paths:
        print(f"Creating {size}x{size} icon: {path}")
        icon = create_lion_icon(size)
        icon.save(path, 'PNG')
    
    # Create favicon.ico (multi-size ICO file)
    print("Creating favicon.ico")
    icon_16 = create_lion_icon(16)
    icon_32 = create_lion_icon(32)
    
    # Save as ICO with multiple sizes
    icon_32.save('client/favicon.ico', format='ICO', sizes=[(16, 16), (32, 32)])
    
    print("All icons created successfully!")

if __name__ == "__main__":
    main()