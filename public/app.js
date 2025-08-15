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
        <label>Role <input class="ch-role" placeholder="e.g., curious 3-year-old boy" value="${data?.role||''}"></label>
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

// start with one character row
addCharacterCard({ name:'David', role:'curious 3-year-old boy' });
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
    
    setLoading(false, '');
    els.status.textContent = 'Story idea generated! You can modify the details and add characters.';
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
      if (job.result && job.result.pdfUrl) {
        els.result.innerHTML = `<a href="${job.result.pdfUrl}" download>Download PDF</a>`;
        
        // Save to library
        const bookData = gather();
        saveToLibrary(bookData, job.result.pdfUrl);
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
function saveToLibrary(bookData, pdfUrl) {
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
