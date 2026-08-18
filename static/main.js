const workspace = document.querySelector('.workspace');
const resultsView = document.getElementById('results-view');
const jdInput = document.getElementById('jd-input');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileList = document.getElementById('file-list');
const fileCount = document.getElementById('file-count');
const parseBtn = document.getElementById('parse-btn');
const statusContainer = document.getElementById('status-container');
const statusText = document.getElementById('status-text');
const progressFill = document.getElementById('progress-fill');
const resultsTbody = document.getElementById('results-tbody');
const backBtn = document.getElementById('back-btn');
const exportCsvBtn = document.getElementById('export-csv');
const modalExportCsvBtn = document.getElementById('modal-export-csv');

let uploadedFiles = [];
let candidatesData = [];

// --- View Navigation ---
const navLinks = document.querySelectorAll('.nav-pill .nav-link');
const views = {
  'Parser': document.getElementById('parser-view'),
  'History': document.getElementById('history-view'),
  'Settings': document.getElementById('settings-view')
};

navLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const targetView = e.target.innerText.trim();
    
    // Update active class on nav
    navLinks.forEach(l => l.classList.remove('active'));
    e.target.classList.add('active');

    // Hide all views (including results-view if active)
    Object.values(views).forEach(view => {
       if (view) view.classList.add('hidden');
    });
    if (resultsView) resultsView.classList.add('hidden');
    exportCsvBtn.style.display = 'none';

    // Show target view
    if (views[targetView]) {
       views[targetView].classList.remove('hidden');
       
       // Trigger reflow to restart entry animations
       views[targetView].style.animation = 'none';
       void views[targetView].offsetWidth; 
       views[targetView].style.animation = null;
    }
  });
});

// --- Drag & Drop ---
dropZone.addEventListener('click', () => fileInput.click());

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, preventDefaults, false);
});
function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }

['dragenter', 'dragover'].forEach(eventName => {
  dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
});
['dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
});

dropZone.addEventListener('drop', (e) => {
  handleFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', (e) => {
  handleFiles(e.target.files);
});

function handleFiles(files) {
  Array.from(files).forEach(file => {
    // Check for duplicates
    if (!uploadedFiles.some(f => f.name === file.name)) {
      uploadedFiles.push(file);
      renderFileList();
    }
  });
}

function removeFile(index) {
  uploadedFiles.splice(index, 1);
  renderFileList();
}

function renderFileList() {
  fileList.innerHTML = '';
  uploadedFiles.forEach((file, index) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span><i class="fa-solid fa-file-lines" style="margin-right: 8px;"></i> ${file.name}</span>
      <i class="fa-solid fa-xmark remove-file" onclick="removeFile(${index})"></i>
    `;
    fileList.appendChild(li);
  });
  fileCount.innerText = uploadedFiles.length;
}


// --- API Interaction ---
parseBtn.addEventListener('click', async () => {
  const jdText = jdInput.value.trim();
  const apiKey = localStorage.getItem('synapse_api_key') || '';
  const strictness = localStorage.getItem('synapse_strictness') || 'standard';

  if (!jdText) return alert("Please provide a Job Description.");
  if (uploadedFiles.length === 0) return alert("Please upload at least one resume.");
  
  if (!apiKey) {
    // Switch to Settings view instead of floating an alert
    const settingsTab = Array.from(document.querySelectorAll('.nav-pill .nav-link')).find(el => el.innerText.trim() === 'Settings');
    if (settingsTab) settingsTab.click();
    
    const settingsError = document.getElementById('settings-error');
    if (settingsError) {
      settingsError.classList.remove('hidden');
    }
    return;
  }

  // Prepare UI
  parseBtn.disabled = true;
  statusContainer.classList.remove('hidden');
  statusText.innerText = "Initializing...";
  progressFill.style.width = "5%";
  candidatesData = [];
  resultsTbody.innerHTML = '';

  const formData = new FormData();
  formData.append('job_description', jdText);
  formData.append('api_key', apiKey);
  formData.append('strictness', strictness);
  
  uploadedFiles.forEach(file => {
    formData.append('files', file);
  });

  try {
    const response = await fetch('/api/parse-stream', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) throw new Error("Network response was not ok");

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop(); // keep incomplete chunk

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.replace('data: ', '').trim();
          if (dataStr) {
            const data = JSON.parse(dataStr);
            handleStreamData(data);
          }
        }
      }
    }
  } catch (error) {
    statusText.innerText = "Error: " + error.message;
    progressFill.style.background = "var(--red-neon)";
    parseBtn.disabled = false;
  }
});

function handleStreamData(data) {
  if (data.status === 'parsing_jd') {
    statusText.innerText = "Analyzing Job Description...";
    progressFill.style.width = "15%";
  } 
  else if (data.status === 'processing') {
    const progress = 15 + ((data.current - 1) / data.total) * 80;
    progressFill.style.width = progress + "%";
    statusText.innerText = `Processing ${data.file_name} (${data.current}/${data.total})...`;
  }
  else if (data.status === 'result') {
    candidatesData.push(data.candidate);
  }
  else if (data.status === 'error') {
    console.error(data.message);
  }
  else if (data.status === 'complete') {
    progressFill.style.width = "100%";
    statusText.innerText = "Complete!";
    candidatesData = data.results; // Ensure we use the sorted results
    setTimeout(() => {
      showResults();
    }, 500);
  }
}

// --- Results View ---
function showResults() {
  workspace.classList.add('hidden');
  resultsView.classList.remove('hidden');
  exportCsvBtn.style.display = 'flex';
  
  // Render Table
  resultsTbody.innerHTML = '';
  candidatesData.forEach(c => {
    const tr = document.createElement('tr');
    
    // Determine row class based on verdict/score
    let rowClass = 'verdict-weak';
    let rawVerdict = (c.verdict || "").toLowerCase();
    
    if (rawVerdict.includes('strong') || rawVerdict.includes('good') || c.score >= 75) {
      rowClass = 'verdict-strong';
    } else if (rawVerdict.includes('partial') || (c.score >= 50 && c.score < 75)) {
      rowClass = 'verdict-partial';
    }

    tr.className = rowClass;
    
    const verdictLabel = rawVerdict.includes('strong') || c.score >= 75 ? 'Strong Match' :
                         rawVerdict.includes('partial') || (c.score >= 50 && c.score < 75) ? 'Partial Match' : 'Weak Match';

    tr.innerHTML = `
      <td>#${c.rank}</td>
      <td><strong>${c.name}</strong></td>
      <td>
        <div class="contact-info">
          <span><i class="fa-solid fa-phone"></i> ${c.phone || 'N/A'}</span>
          <span><i class="fa-solid fa-envelope"></i> ${c.email || 'N/A'}</span>
        </div>
      </td>
      <td>${c.experience_met || c.experience_score + '/100'}</td>
      <td><span class="verdict-pill">${verdictLabel}</span></td>
      <td class="score-cell">${c.score}%</td>
    `;
    resultsTbody.appendChild(tr);
  });
}

backBtn.addEventListener('click', () => {
  resultsView.classList.add('hidden');
  workspace.classList.remove('hidden');
  exportCsvBtn.style.display = 'none';
  parseBtn.disabled = false;
  statusContainer.classList.add('hidden');
  progressFill.style.width = "0%";
});

// --- CSV Export ---
function exportToCsv() {
  if (candidatesData.length === 0) return;

  // "in .csv there should be only column for rank, name, phone number, email and verdict experience also"
  const headers = ['Rank', 'Name', 'Phone Number', 'Email', 'Verdict', 'Experience', 'Score'];
  
  const csvRows = [];
  csvRows.push(headers.join(','));

  candidatesData.forEach(c => {
    let rawVerdict = (c.verdict || "").toLowerCase();
    const verdictLabel = rawVerdict.includes('strong') || c.score >= 75 ? 'Strong Match' :
                         rawVerdict.includes('partial') || (c.score >= 50 && c.score < 75) ? 'Partial Match' : 'Weak Match';
                         
    const values = [
      c.rank,
      `"${c.name || ''}"`,
      `"${c.phone || ''}"`,
      `"${c.email || ''}"`,
      `"${verdictLabel}"`,
      `"${c.experience_met || ''}"`,
      c.score
    ];
    csvRows.push(values.join(','));
  });

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('hidden', '');
  a.setAttribute('href', url);
  a.setAttribute('download', 'synapse_resume_matches.csv');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

exportCsvBtn.addEventListener('click', (e) => { e.preventDefault(); exportToCsv(); });
modalExportCsvBtn.addEventListener('click', exportToCsv);

// Mobile Menu toggling (from previous logic)
const burger = document.querySelector('.burger');
if (burger) {
  burger.addEventListener('click', () => {
    const expanded = burger.getAttribute('aria-expanded') === 'true';
    burger.setAttribute('aria-expanded', !expanded);
    // mobile menu toggling handled here if overlay/menu exist
  });
}

// --- Settings Management ---
const apiKeyInput = document.getElementById('api-key-input');
const strictnessInput = document.getElementById('strictness-input');
const saveSettingsBtn = document.getElementById('save-settings-btn');

// Load settings on startup
if (apiKeyInput) {
  apiKeyInput.value = localStorage.getItem('synapse_api_key') || '';
}
if (strictnessInput) {
  strictnessInput.value = localStorage.getItem('synapse_strictness') || 'standard';
}

if (saveSettingsBtn) {
  saveSettingsBtn.addEventListener('click', () => {
    localStorage.setItem('synapse_api_key', apiKeyInput.value.trim());
    localStorage.setItem('synapse_strictness', strictnessInput.value);
    
    // Hide error banner if it was shown
    const settingsError = document.getElementById('settings-error');
    if (settingsError) {
      settingsError.classList.add('hidden');
    }
    
    // UI feedback
    const originalText = saveSettingsBtn.innerHTML;
    saveSettingsBtn.innerHTML = '<i class="fa-solid fa-check"></i> Saved!';
    setTimeout(() => {
      saveSettingsBtn.innerHTML = originalText;
    }, 2000);
  });
}
