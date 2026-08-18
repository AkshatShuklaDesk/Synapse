// State
let selectedFiles = [];
let results = [];
let isProcessing = false;

// DOM Elements
const jdInput = document.getElementById('job_description');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileListEl = document.getElementById('file-list');
const parseBtn = document.getElementById('parse-btn');
const fileBadge = document.getElementById('file-badge');
const progressSection = document.getElementById('progress-section');
const progressText = document.getElementById('progress-text');
const progressBar = document.getElementById('progress-bar');
const resultsSection = document.getElementById('results-section');
const resultsCount = document.getElementById('results-count');
const resultsBody = document.getElementById('results-body');
const exportBtn = document.getElementById('export-btn');

function initApp() {
    setupDragDrop();
    
    // Inputs listeners for button state
    jdInput.addEventListener('input', updateButtonState);
    
    parseBtn.addEventListener('click', startParsing);
    exportBtn.addEventListener('click', exportCSV);
}

function setupDragDrop() {
    dropZone.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', (e) => {
        handleFileSelect(Array.from(e.target.files));
        fileInput.value = ''; // reset
    });
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
    });
    
    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = Array.from(dt.files);
        handleFileSelect(files);
    }, false);
}

function handleFileSelect(files) {
    const validFiles = files.filter(f => f.name.toLowerCase().endsWith('.pdf') || f.name.toLowerCase().endsWith('.docx'));
    
    if (validFiles.length !== files.length) {
        showError('Only .pdf and .docx files are allowed.');
    }
    
    selectedFiles = [...selectedFiles, ...validFiles];
    renderFileList();
    updateButtonState();
}

// Ensure function is exposed globally for onclick handlers in innerHTML
window.removeFile = function(index) {
    selectedFiles.splice(index, 1);
    renderFileList();
    updateButtonState();
};

function renderFileList() {
    fileListEl.innerHTML = '';
    selectedFiles.forEach((file, index) => {
        const div = document.createElement('div');
        div.className = 'file-item';
        div.innerHTML = `
            <span class="file-name" title="${file.name}">${file.name}</span>
            <button class="remove-btn" onclick="window.removeFile(${index})">&times;</button>
        `;
        fileListEl.appendChild(div);
    });
    
    if (selectedFiles.length > 0) {
        fileBadge.style.display = 'inline-block';
        fileBadge.textContent = selectedFiles.length;
    } else {
        fileBadge.style.display = 'none';
    }
}

function updateButtonState() {
    const hasJD = jdInput.value.trim().length > 0;
    const hasFiles = selectedFiles.length > 0;
    parseBtn.disabled = !(hasJD && hasFiles) || isProcessing;
}

async function startParsing() {
    if (parseBtn.disabled) return;
    
    resetUI();
    isProcessing = true;
    updateButtonState();
    jdInput.disabled = true;
    dropZone.style.pointerEvents = 'none';
    
    progressSection.style.display = 'block';
    progressText.textContent = 'Starting parsing...';
    progressBar.style.width = '0%';
    
    const formData = new FormData();
    formData.append('job_description', jdInput.value);
    selectedFiles.forEach(file => formData.append('files', file));
    
    try {
        await connectSSE(formData);
    } catch (err) {
        showError('An error occurred during parsing: ' + err.message);
        isProcessing = false;
        jdInput.disabled = false;
        dropZone.style.pointerEvents = 'auto';
        updateButtonState();
    }
}

async function connectSSE(formData) {
    const response = await fetch('/api/parse-stream', {
        method: 'POST',
        body: formData
    });
    
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        let lines = buffer.split('\n');
        buffer = lines.pop(); // keep the last partial line in buffer
        
        for (let line of lines) {
            if (line.startsWith('data: ')) {
                const dataStr = line.slice(6).trim();
                if (dataStr) {
                    try {
                        const data = JSON.parse(dataStr);
                        handleSSEEvent(data);
                    } catch (e) {
                        console.error('Error parsing SSE data', e, dataStr);
                    }
                }
            }
        }
    }
}

function handleSSEEvent(data) {
    if (data.status === 'parsing_jd') {
        progressText.textContent = 'Parsing job description...';
        progressBar.style.width = '5%';
    } 
    else if (data.status === 'processing') {
        const percent = 5 + Math.floor((data.current / data.total) * 90);
        progressBar.style.width = `${percent}%`;
        progressText.textContent = `Processing resume ${data.current}/${data.total}: ${data.file_name}`;
    }
    else if (data.status === 'result') {
        results.push(data.candidate);
        if (results.length === 1) {
            resultsSection.style.display = 'block';
        }
        resultsCount.textContent = results.length;
        renderResultRow(data.candidate, true);
    }
    else if (data.status === 'complete') {
        progressBar.style.width = '100%';
        progressText.textContent = 'Processing complete!';
        results = data.results || results; // update with sorted results if provided
        renderAllResults(results);
        
        setTimeout(() => {
            isProcessing = false;
            jdInput.disabled = false;
            dropZone.style.pointerEvents = 'auto';
            updateButtonState();
            progressSection.style.display = 'none';
        }, 1500);
    }
    else if (data.status === 'error') {
        showError(data.message);
        isProcessing = false;
        jdInput.disabled = false;
        dropZone.style.pointerEvents = 'auto';
        updateButtonState();
    }
}

function renderResultRow(candidate, animate) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td>${candidate.rank > 0 ? candidate.rank : '-'}</td>
        <td>
            <div><strong>${candidate.name}</strong></div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${candidate.file_name}</div>
        </td>
        <td class="${getScoreColor(candidate.score)}">${candidate.score.toFixed(1)}</td>
        <td style="font-size: 0.85rem;">
            <div>Skills: <strong class="${getScoreColor(candidate.skills_score)}">${(candidate.skills_score || 0).toFixed(0)}</strong></div>
            <div>Exp: <strong class="${getScoreColor(candidate.experience_score)}">${(candidate.experience_score || 0).toFixed(0)}</strong></div>
        </td>
        <td>
            <div style="margin-bottom: 4px;"><strong>Match:</strong> <div class="skills-container">${formatSkills(candidate.matching_skills, 'match')}</div></div>
            <div style="margin-top: 8px;"><strong>Missing:</strong> <div class="skills-container">${formatSkills(candidate.missing_skills, 'missing')}</div></div>
        </td>
        <td>
            <div style="margin-bottom: 8px;">
                <span class="verdict-badge ${getVerdictClass(candidate.verdict)}">${candidate.verdict}</span>
                <span style="font-size: 0.85rem; margin-left: 10px; color: var(--text-muted);">Exp Met: <strong style="color: ${getExpColor(candidate.experience_met)}">${candidate.experience_met}</strong></span>
            </div>
            <div style="font-size: 0.85rem; color: var(--text-muted); max-width: 300px; line-height: 1.4;">${candidate.justification || ''}</div>
        </td>
    `;
    resultsBody.appendChild(tr);
}

function renderAllResults(resultsArr) {
    resultsBody.innerHTML = '';
    resultsArr.forEach(cand => renderResultRow(cand, false));
}

function getScoreColor(score) {
    if (score >= 75) return 'score-green';
    if (score >= 50) return 'score-yellow';
    return 'score-red';
}

function getVerdictClass(verdict) {
    const v = (verdict || '').toLowerCase();
    if (v.includes('strong') || v.includes('good') || v.includes('excellent')) return 'verdict-green';
    if (v.includes('potential') || v.includes('partial') || v.includes('average')) return 'verdict-yellow';
    return 'verdict-red';
}

function getExpColor(exp) {
    const e = (exp || '').toLowerCase();
    if (e.includes('yes') || e.includes('fully')) return 'var(--success-color)';
    if (e.includes('partial')) return 'var(--warning-color)';
    return 'var(--danger-color)';
}

function formatSkills(skills, type) {
    if (!skills || skills.length === 0) return '-';
    return skills.map(skill => `<span class="skill-tag ${type}">${skill}</span>`).join('');
}

function resetUI() {
    results = [];
    resultsBody.innerHTML = '';
    resultsSection.style.display = 'none';
    resultsCount.textContent = '0';
    progressSection.style.display = 'none';
}

function showError(msg) {
    alert(msg); // simple fallback, can be improved to a toast
}

function exportCSV() {
    if (results.length === 0) return;
    
    const headers = ['Rank', 'Name', 'Phone Number', 'Email', 'Verdict', 'Experience'];
    
    const rows = results.map(r => [
        r.rank,
        r.name,
        r.phone,
        r.email,
        r.verdict,
        r.experience_met
    ]);
    
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(v => `"${(v === null || v === undefined) ? '' : String(v).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().split('T')[0];
    
    link.setAttribute('href', url);
    link.setAttribute('download', `synapse_results_${dateStr}.csv`);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

document.addEventListener('DOMContentLoaded', initApp);
