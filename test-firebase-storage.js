import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';
import crypto from 'crypto';

// Enhanced logging function
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
  console.log(logMessage);
  if (data) {
    console.log('Data:', JSON.stringify(data, null, 2));
  }
}

// Initialize Firebase Admin
let bucket = null;
let firebaseConfigured = false;

function initializeFirebase() {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;
    const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
    
    if (!projectId || !clientEmail || !privateKey || !storageBucket) {
      log('error', 'Firebase environment variables not found', {
        hasProjectId: !!projectId,
        hasClientEmail: !!clientEmail,
        hasPrivateKey: !!privateKey,
        hasStorageBucket: !!storageBucket
      });
      return false;
    }
    
    // Create service account object from environment variables
    const serviceAccount = {
      type: 'service_account',
      project_id: projectId,
      private_key: privateKey.replace(/\\n/g, '\n'), // Handle escaped newlines
      client_email: clientEmail
    };
    
    // Validate storage bucket format
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

// Upload PDF to Firebase Storage
async function uploadPDFToStorage(pdfBuffer, filename) {
  if (!firebaseConfigured || !bucket) {
    throw new Error('Firebase not configured properly');
  }

  try {
    const file = bucket.file(`test-uploads/${Date.now()}-${filename}`);
    const downloadToken = crypto.randomUUID();
    
    await file.save(pdfBuffer, {
      metadata: {
        contentType: 'application/pdf',
        metadata: {
          firebaseStorageDownloadTokens: downloadToken
        }
      }
    });

    // Make file publicly readable
    await file.makePublic();

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${file.name}`;
    log('info', 'PDF uploaded to Firebase Storage', { filename, url: publicUrl });
    
    return {
      success: true,
      url: publicUrl,
      filename: filename,
      path: file.name,
      downloadToken
    };
  } catch (error) {
    log('error', 'Failed to upload to Firebase Storage', { error: error.message });
    throw error;
  }
}

// Download PDF from Firebase Storage
async function downloadPDFFromStorage(filePath) {
  if (!firebaseConfigured || !bucket) {
    throw new Error('Firebase not configured properly');
  }

  try {
    const file = bucket.file(filePath);
    
    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      throw new Error(`File does not exist: ${filePath}`);
    }
    
    // Get file metadata
    const [metadata] = await file.getMetadata();
    log('info', 'File metadata retrieved', { 
      name: metadata.name,
      size: metadata.size,
      contentType: metadata.contentType,
      created: metadata.timeCreated
    });
    
    // Download file content
    const [fileBuffer] = await file.download();
    
    log('info', 'PDF downloaded from Firebase Storage', { 
      filePath,
      downloadedSize: fileBuffer.length
    });
    
    return {
      success: true,
      buffer: fileBuffer,
      metadata: metadata
    };
  } catch (error) {
    log('error', 'Failed to download from Firebase Storage', { error: error.message });
    throw error;
  }
}

// Main test function
async function testFirebaseStorage() {
  log('info', '🧪 Starting Firebase Storage Test');
  
  // Test PDF file path
  const pdfPath = '/Users/yedidya/Desktop/childbook-pwa-server2/שובר מעמ ונוס.pdf';
  
  try {
    // Initialize Firebase
    log('info', 'Step 1: Initializing Firebase...');
    if (!initializeFirebase()) {
      throw new Error('Failed to initialize Firebase. Check your configuration.');
    }
    
    // Check if test PDF exists
    log('info', 'Step 2: Checking if test PDF exists...');
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`Test PDF file not found: ${pdfPath}`);
    }
    
    // Read the PDF file
    log('info', 'Step 3: Reading PDF file...');
    const pdfBuffer = fs.readFileSync(pdfPath);
    const filename = path.basename(pdfPath);
    log('info', 'PDF file read successfully', { 
      filename,
      size: pdfBuffer.length,
      sizeKB: Math.round(pdfBuffer.length / 1024)
    });
    
    // Test 1: Upload PDF to Storage
    log('info', 'Step 4: Testing PDF upload...');
    const uploadResult = await uploadPDFToStorage(pdfBuffer, filename);
    log('info', '✅ Upload test passed', uploadResult);
    
    // Test 2: Download PDF from Storage
    log('info', 'Step 5: Testing PDF download...');
    const downloadResult = await downloadPDFFromStorage(uploadResult.path);
    log('info', '✅ Download test passed', { 
      originalSize: pdfBuffer.length,
      downloadedSize: downloadResult.buffer.length,
      sizesMatch: pdfBuffer.length === downloadResult.buffer.length
    });
    
    // Test 3: Verify content integrity
    log('info', 'Step 6: Verifying content integrity...');
    const originalHash = crypto.createHash('md5').update(pdfBuffer).digest('hex');
    const downloadedHash = crypto.createHash('md5').update(downloadResult.buffer).digest('hex');
    const contentMatches = originalHash === downloadedHash;
    
    log('info', '✅ Content integrity test completed', {
      originalHash,
      downloadedHash,
      contentMatches
    });
    
    if (!contentMatches) {
      throw new Error('Content integrity check failed: uploaded and downloaded files differ');
    }
    
    // Test 4: Save downloaded file for verification
    log('info', 'Step 7: Saving downloaded file for verification...');
    const downloadedPath = `/tmp/downloaded-${Date.now()}-${filename}`;
    fs.writeFileSync(downloadedPath, downloadResult.buffer);
    log('info', '✅ Downloaded file saved', { path: downloadedPath });
    
    // Test 5: Public URL accessibility (optional)
    log('info', 'Step 8: Testing public URL accessibility...');
    try {
      const response = await fetch(uploadResult.url);
      if (response.ok) {
        const fetchedBuffer = Buffer.from(await response.arrayBuffer());
        const fetchedHash = crypto.createHash('md5').update(fetchedBuffer).digest('hex');
        const urlAccessible = fetchedHash === originalHash;
        
        log('info', '✅ Public URL test completed', {
          urlAccessible,
          fetchedSize: fetchedBuffer.length,
          url: uploadResult.url
        });
      } else {
        log('warn', 'Public URL not accessible', { status: response.status });
      }
    } catch (urlError) {
      log('warn', 'Could not test public URL', { error: urlError.message });
    }
    
    // Cleanup: Remove test file from storage
    log('info', 'Step 9: Cleaning up test file...');
    try {
      const file = bucket.file(uploadResult.path);
      await file.delete();
      log('info', '✅ Test file cleaned up from storage');
    } catch (cleanupError) {
      log('warn', 'Could not clean up test file', { error: cleanupError.message });
    }
    
    // Final summary
    log('info', '🎉 ALL TESTS PASSED! Firebase Storage is working correctly');
    log('info', 'Test Summary:', {
      uploadSuccessful: true,
      downloadSuccessful: true,
      contentIntegrityVerified: true,
      originalFileSize: pdfBuffer.length,
      testFileName: filename
    });
    
  } catch (error) {
    log('error', '❌ Test failed', { 
      error: error.message,
      stack: error.stack
    });
    
    if (!firebaseConfigured) {
      log('info', '📋 Firebase Setup Guide:');
      log('info', '1. Go to Firebase Console → Project Settings → Service Accounts');
      log('info', '2. Click "Generate New Private Key" and download the JSON file');
      log('info', '3. Save the JSON file in your project directory');
      log('info', '4. Add to .env: FIREBASE_SERVICE_ACCOUNT_PATH=./your-firebase-file.json');
      log('info', '5. Add to .env: FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app');
    }
    
    process.exit(1);
  }
}

// Run the test
testFirebaseStorage().catch(error => {
  log('error', 'Unhandled test error', { error: error.message });
  process.exit(1);
});