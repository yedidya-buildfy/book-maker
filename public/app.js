const els = {
  bookTitle: document.getElementById('bookTitle'),
  story: document.getElementById('story'),
  numImages: document.getElementById('numImages'),
  artStyle: document.getElementById('artStyle'),
  customStyleLabel: document.getElementById('customStyleLabel'),
  customStyleInput: document.getElementById('customStyleInput'),
  charContainer: document.getElementById('charContainer'),
  addCharBtn: document.getElementById('addCharBtn'),
  generateBtn: document.getElementById('generateBtn'),
  generateFromScratchBtn: document.getElementById('generateFromScratchBtn'),
  status: document.getElementById('status'),
  loader: document.getElementById('loader'),
  loaderText: document.getElementById('loaderText'),
  result: document.getElementById('result'),
  installBtn: document.getElementById('installBtn'),
  libraryList: document.getElementById('libraryList'),
  emptyLibrary: document.getElementById('emptyLibrary')
};

function addCharacterCard(data){
  const id = crypto.randomUUID();
  const card = document.createElement('div');
  card.className = 'char-card';
  card.dataset.id = id;
  card.innerHTML = `
    <div class="row">
      <img alt="preview" src="${data?.image||''}" />
      <div class="meta">
        <label>Name <input class="ch-name" placeholder="Character name" value="${data?.name||''}"></label>
        <label>Age <input class="ch-age" placeholder="e.g., 7 years old" value="${data?.age||''}"></label>
        <label>Description <input class="ch-desc" placeholder="e.g., Jewish, curious, loves books" value="${data?.description||''}"></label>
        <label>Role <input class="ch-role" placeholder="e.g., main character, friend, teacher" value="${data?.role||''}"></label>
        <input class="ch-file" type="file" accept="image/*">
      </div>
      <div><button class="secondary ch-remove">Remove</button></div>
    </div>
  `;
  els.charContainer.appendChild(card);

  const file = card.querySelector('.ch-file');
  const img = card.querySelector('img');
  file.addEventListener('change', async (e)=>{
    const f = e.target.files[0]; if(!f) return;
    const b64 = await fileToDataURL(f); img.src = b64;
  });
  card.querySelector('.ch-remove').addEventListener('click', ()=> card.remove());
}

function fileToDataURL(file){
  return new Promise((res, rej)=>{
    const r = new FileReader();
    r.onload = ()=>res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// Helper functions for random generation
function getRandomArtStyle() {
  const styles = ['Watercolor', 'Oil Painting', 'Digital Art', 'Cartoon', 'Sketchy', 'Realistic'];
  return styles[Math.floor(Math.random() * styles.length)];
}

function getRandomCharacter() {
  const names = ['Emma', 'Liam', 'Sophia', 'Noah', 'Olivia', 'Ava', 'Isabella', 'Mason', 'Mia', 'Ethan', 'Jacob', 'Madison', 'David', 'Sarah', 'Michael', 'Lily'];
  const ages = ['3 years old', '4 years old', '5 years old', '6 years old', '7 years old', '8 years old', '9 years old'];
  const personalities = [
    'curious and brave', 'kind and helpful', 'funny and energetic', 'smart and creative',
    'gentle and caring', 'adventurous and bold', 'friendly and loyal', 'imaginative and artistic',
    'thoughtful and wise', 'playful and silly', 'determined and strong', 'cheerful and optimistic'
  ];
  const cultures = ['', 'Jewish'];
  const interests = ['loves books', 'loves animals', 'loves art', 'loves music', 'loves sports', 'loves science', 'loves cooking', 'loves nature'];
  const roles = ['main character', 'best friend', 'helpful sibling', 'wise grandparent', 'fun teacher', 'loyal pet', 'magical helper'];
  
  const culture = cultures[Math.floor(Math.random() * cultures.length)];
  const personality = personalities[Math.floor(Math.random() * personalities.length)];
  const interest = interests[Math.floor(Math.random() * interests.length)];
  
  const description = [culture, personality, interest].filter(Boolean).join(', ');
  
  return {
    name: names[Math.floor(Math.random() * names.length)],
    age: ages[Math.floor(Math.random() * ages.length)],
    description: description,
    role: roles[Math.floor(Math.random() * roles.length)]
  };
}

function clearAllCharacters() {
  const characterCards = els.charContainer.querySelectorAll('.char-card');
  characterCards.forEach(card => card.remove());
}

// start with one character row
addCharacterCard({ 
  name: 'David', 
  age: '7 years old',
  description: 'Jewish, curious, loves adventures',
  role: 'main character' 
});
els.addCharBtn.addEventListener('click', ()=> addCharacterCard());

// Handle custom style input visibility
els.artStyle.addEventListener('change', ()=> {
  if (els.artStyle.value === 'Custom') {
    els.customStyleLabel.style.display = 'block';
    els.customStyleInput.focus();
  } else {
    els.customStyleLabel.style.display = 'none';
  }
});

function gather(){
  const characters = [...document.querySelectorAll('.char-card')].map(c=> {
    const img = c.querySelector('img');
    const imgSrc = img.src || '';
    // Only include image if it's a valid data URL (base64) or actual image, not just the base URL
    const hasValidImage = imgSrc && imgSrc !== window.location.origin + '/' && imgSrc.startsWith('data:image/');
    
    return {
      name: c.querySelector('.ch-name').value.trim(),
      age: c.querySelector('.ch-age').value.trim(),
      description: c.querySelector('.ch-desc').value.trim(),
      role: c.querySelector('.ch-role').value.trim(),
      image: hasValidImage ? imgSrc : ''
    };
  });
  
  let artStyle = els.artStyle.value || 'Watercolor';
  if (artStyle === 'Custom') {
    artStyle = els.customStyleInput.value.trim() || 'Watercolor';
  }
  
  return {
    title: els.bookTitle.value.trim() || 'Untitled Book',
    story: els.story.value.trim(),
    numImages: parseInt(els.numImages.value||'9', 10),
    artStyle: artStyle,
    characters
  };
}

function setLoading(on, msg){
  els.loader.hidden = !on;
  els.loaderText.textContent = msg || (on ? 'Working...' : '');
}

els.generateFromScratchBtn.addEventListener('click', async ()=>{
  try{
    els.generateFromScratchBtn.disabled = true;
    els.status.textContent = '';
    setLoading(true, 'Generating story idea...');

    const res = await fetch('/api/generate-story-idea', {
      method:'POST',
      headers:{'Content-Type':'application/json'}
    });
    if(!res.ok){ throw new Error(await res.text()); }
    const storyIdea = await res.json();
    
    // Fill in the form fields
    els.bookTitle.value = storyIdea.title || '';
    els.story.value = storyIdea.story || '';
    els.numImages.value = storyIdea.numImages || 6;
    
    // Randomize art style
    const randomStyle = getRandomArtStyle();
    els.artStyle.value = randomStyle;
    
    // Clear existing characters and generate random ones
    clearAllCharacters();
    
    // Generate 1-3 random characters
    const numCharacters = Math.floor(Math.random() * 3) + 1; // 1-3 characters
    for (let i = 0; i < numCharacters; i++) {
      addCharacterCard(getRandomCharacter());
    }
    
    setLoading(false, '');
    els.status.textContent = `Story generated! ${numCharacters} random character${numCharacters > 1 ? 's' : ''} created with ${randomStyle} art style.`;
  }catch(err){
    console.error(err);
    setLoading(false, '');
    els.status.textContent = 'Error generating story idea: '+err.message;
  }finally{
    els.generateFromScratchBtn.disabled = false;
  }
});

els.generateBtn.addEventListener('click', async ()=>{
  try{
    els.generateBtn.disabled = true;
    els.status.textContent = '';
    els.result.innerHTML = '';
    setLoading(true, 'Starting generation...');

    const payload = gather();
    const res = await fetch('/api/generate', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    if(!res.ok){ throw new Error(await res.text()); }
    const data = await res.json();
    
    // Start polling for job progress
    if (data.jobId) {
      await pollJobProgress(data.jobId);
    } else {
      throw new Error('No job ID received');
    }
  }catch(err){
    console.error(err);
    setLoading(false, '');
    els.status.textContent = 'Error: '+err.message;
    console.error('Full error:', err);
    els.generateBtn.disabled = false;
  }
});

async function pollJobProgress(jobId) {
  try {
    const res = await fetch(`/api/job/${jobId}`);
    if (!res.ok) { throw new Error('Failed to get job status'); }
    const job = await res.json();
    
    // Update UI with current progress
    if (job.currentPhase) {
      setLoading(true, job.currentPhase);
    }
    
    if (job.status === 'completed') {
      setLoading(false, 'Done!');
      if (job.result && job.result.pdf) {
        const pdf = job.result.pdf;
        let pdfUrl = '';
        
        if (pdf.type === 'url') {
          // Firebase Storage URL - direct link
          pdfUrl = pdf.url;
          els.result.innerHTML = `<a href="${pdf.url}" target="_blank">View PDF</a> | <a href="${pdf.url}" download="${pdf.filename}">Download PDF</a>`;
        } else if (pdf.type === 'download') {
          // Base64 data - create blob URL
          const pdfBlob = new Blob([Uint8Array.from(atob(pdf.data), c => c.charCodeAt(0))], {type: 'application/pdf'});
          pdfUrl = URL.createObjectURL(pdfBlob);
          els.result.innerHTML = `<a href="${pdfUrl}" target="_blank">View PDF</a> | <a href="${pdfUrl}" download="${pdf.filename}">Download PDF</a>`;
        }
        
        // Save to library
        const bookData = gather();
        saveToLibrary(bookData, pdfUrl, pdf.filename);
      }
      els.generateBtn.disabled = false;
      els.status.textContent = 'Book generated successfully!';
    } else if (job.status === 'failed') {
      setLoading(false, '');
      els.status.textContent = 'Error: ' + (job.error || 'Generation failed');
      els.generateBtn.disabled = false;
    } else {
      // Still in progress, poll again
      setTimeout(() => pollJobProgress(jobId), 2000); // Poll every 2 seconds
    }
  } catch (err) {
    console.error('Polling error:', err);
    setLoading(false, '');
    els.status.textContent = 'Error checking progress: ' + err.message;
    els.generateBtn.disabled = false;
  }
}

// Library functions
function saveToLibrary(bookData, pdfUrl, filename = null) {
  try {
    const library = getLibrary();
    const bookEntry = {
      id: Date.now().toString(),
      title: bookData.title,
      story: bookData.story,
      artStyle: bookData.artStyle,
      numImages: bookData.numImages,
      characterCount: bookData.characters.length,
      pdfUrl: pdfUrl,
      filename: filename || (bookData.title + '.pdf'),
      createdAt: new Date().toISOString()
    };
    
    library.unshift(bookEntry); // Add to beginning
    
    // Keep only last 50 books to avoid localStorage limits
    if (library.length > 50) {
      library.splice(50);
    }
    
    localStorage.setItem('bookLibrary', JSON.stringify(library));
    console.log('Book saved to library:', bookEntry.title);
  } catch (error) {
    console.error('Failed to save book to library:', error);
  }
}

function getLibrary() {
  try {
    const stored = localStorage.getItem('bookLibrary');
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Failed to load library:', error);
    return [];
  }
}

function deleteFromLibrary(bookId) {
  try {
    const library = getLibrary();
    const filteredLibrary = library.filter(book => book.id !== bookId);
    localStorage.setItem('bookLibrary', JSON.stringify(filteredLibrary));
    showLibrary(); // Refresh the display
  } catch (error) {
    console.error('Failed to delete book from library:', error);
  }
}

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

function showLibrary() {
  const library = getLibrary();
  
  if (library.length === 0) {
    els.libraryList.style.display = 'none';
    els.emptyLibrary.hidden = false;
  } else {
    els.libraryList.style.display = 'grid';
    els.emptyLibrary.hidden = true;
    
    els.libraryList.innerHTML = library.map(book => `
      <div class="library-item">
        <div class="library-item-info">
          <div class="library-item-title">${book.title}</div>
          <div class="library-item-meta">
            ${book.artStyle} style • ${book.numImages} images • ${book.characterCount} characters<br>
            Created: ${formatDate(book.createdAt)}
          </div>
        </div>
        <div class="library-item-actions">
          <button onclick="window.open('${book.pdfUrl}', '_blank')" class="secondary">View PDF</button>
          <button onclick="deleteFromLibrary('${book.id}')" style="background: #ff4757; color: white;">Delete</button>
        </div>
      </div>
    `).join('');
  }
}

// Load library on page load
showLibrary();

// PWA install
let deferredPrompt=null;
window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault(); deferredPrompt=e; els.installBtn.style.display='inline-block';
});
els.installBtn.addEventListener('click', async ()=>{
  if(deferredPrompt){ deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; els.installBtn.style.display='none'; }
});
if('serviceWorker' in navigator){ window.addEventListener('load', ()=> navigator.serviceWorker.register('service-worker.js')); }
console.log("App ready.");
