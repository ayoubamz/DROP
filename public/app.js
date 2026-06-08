const socket = io();
let currentRoomCode = null;

// استدعاء عناصر الواجهة
const startScreen = document.getElementById('start-screen');
const shareScreen = document.getElementById('share-screen');
const displayCode = document.getElementById('display-code');
const clipboardArea = document.getElementById('clipboard-area');
const textError = document.getElementById('text-error');
const fileInput = document.getElementById('file-input');
const fileError = document.getElementById('file-error');
const dropZone = document.getElementById('drop-zone');
const selectedFilesList = document.getElementById('selected-files-list');
const uploadBtn = document.getElementById('upload-btn');
const fileDownloadArea = document.getElementById('file-download-area');
const roomInput = document.getElementById('room-input');

// الثوابت والقيود
const MAX_TEXT_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_FILES_TOTAL_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_FILES_COUNT = 6; 

// المخزن التراكمي المستقر في الرام
let ALL_SELECTED_FILES = [];
let dragAndDropReady = false;

fileInput.addEventListener('change', handleInstantFileSelection);
dropZone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        fileInput.click();
    }
});
roomInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        joinRoom();
    }
});

// إدارة اتصال الغرف
function createRoom() { socket.emit('create-room'); }
socket.on('room-created', (code) => { currentRoomCode = code; displayCode.innerText = code; switchToShareScreen(); });
function joinRoom() { const code = document.getElementById('room-input').value; if(code) socket.emit('join-room', code); }
socket.on('joined-success', (code) => { currentRoomCode = code; displayCode.innerText = code; switchToShareScreen(); });

function switchToShareScreen() {
    startScreen.classList.add('hidden');
    shareScreen.classList.remove('hidden');
    
    // 🛡️ تأمين وحماية متصفحات الهواتف من الانهيار الصامت
    try {
        setupDragAndDrop(); 
    } catch (e) {
        console.log("Drag and Drop not supported on this device, skipping smoothly.");
    }
}

// 1. مزامنة النصوص الحية (تأكد أنها ستعود للعمل كالبرق)
clipboardArea.addEventListener('input', () => {
    const text = clipboardArea.value;
    if (new Blob([text]).size > MAX_TEXT_SIZE) { textError.classList.remove('hidden'); return; }
    textError.classList.add('hidden');
    
    if (currentRoomCode) {
        socket.emit('send-data', { roomCode: currentRoomCode, payload: { type: 'text', value: text } });
    }
});

// تحفيز ضغط حقل الملفات برمجياً عند لمس المربع
function triggerFileInput() { fileInput.click(); }

// 2. معالجة اختيار ملفات الهاتف والتصفح التقليدي
function handleInstantFileSelection() {
    if (fileInput.files && fileInput.files.length > 0) {
        addFilesToQueue(fileInput.files);
    }
    fileInput.value = ''; // تصفير للسماح بإعادة الاختيار الفريش
}

// 3. معالجة أحداث السحب والإفلات للحواسب مع فحص الدعم
function setupDragAndDrop() {
    if (!dropZone || dragAndDropReady) return;
    dragAndDropReady = true;

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('drag-over');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('drag-over');
        }, false);
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        if (dt && dt.files) {
            addFilesToQueue(dt.files);
        }
    }, false);
}

// 4. دمج الملفات وفحص منع التكرار
function addFilesToQueue(files) {
    fileError.classList.add('hidden');
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
        const isDuplicate = ALL_SELECTED_FILES.some(f => f.name === files[i].name && f.size === files[i].size);
        if (!isDuplicate) {
            ALL_SELECTED_FILES.push(files[i]);
        }
    }
    updateFilesListUI();
}

// 5. تحديث الواجهة والعداد وحقن زر الـ ❌
function updateFilesListUI() {
    selectedFilesList.innerHTML = ''; 
    const counterLabel = document.getElementById('files-counter-label');
    
    if (ALL_SELECTED_FILES.length > 0) {
        counterLabel.innerText = `(Current: ${ALL_SELECTED_FILES.length} / max: 6)`;
        counterLabel.style.color = (ALL_SELECTED_FILES.length > MAX_FILES_COUNT) ? '#ff2e63' : '#00adb5';
    } else {
        counterLabel.innerText = '(max: 6 files at a time)';
        counterLabel.style.color = '#00adb5';
    }

    if (ALL_SELECTED_FILES.length === 0) {
        selectedFilesList.classList.add('hidden');
        uploadBtn.style.display = 'none';
        fileError.classList.add('hidden');
        return;
    }

    selectedFilesList.classList.remove('hidden');
    let totalSize = 0;

    ALL_SELECTED_FILES.forEach((file, index) => {
        totalSize += file.size;
        const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
        
        const item = document.createElement('div');
        item.className = 'file-item';
        item.innerHTML = `
            <span>📄 ${index + 1}. ${file.name} (${sizeInMB} MB)</span> 
            <span onclick="event.stopPropagation(); removeFileFromQueue(${index});" style="color:#ff2e63; cursor:pointer; font-weight:bold; padding:0 8px;">❌</span>
        `;
        selectedFilesList.appendChild(item);
    });

    const isCountValid = (ALL_SELECTED_FILES.length >= 1 && ALL_SELECTED_FILES.length <= MAX_FILES_COUNT);
    const isSizeValid = (totalSize <= MAX_FILES_TOTAL_SIZE);

    if (ALL_SELECTED_FILES.length > MAX_FILES_COUNT) {
        fileError.innerText = `⚠️ Limit exceeded! Max 6 files. Please remove ${ALL_SELECTED_FILES.length - MAX_FILES_COUNT} file(s).`;
        fileError.classList.remove('hidden');
    } else if (totalSize > MAX_FILES_TOTAL_SIZE) {
        fileError.innerText = `⚠️ Total size (${(totalSize / (1024 * 1024)).toFixed(2)} MB) exceeds 20MB limit!`;
        fileError.classList.remove('hidden');
    } else {
        fileError.classList.add('hidden');
    }

    if (isCountValid && isSizeValid) {
        uploadBtn.style.display = 'block';
    } else {
        uploadBtn.style.display = 'none';
    }
}

// 6. حذف ملف محدد بـ ❌ وعزل الحدث لمنع فتح نافذة الهاتف مجدداً
function removeFileFromQueue(index) {
    ALL_SELECTED_FILES.splice(index, 1);
    updateFilesListUI();
}

// 7. البث الذري الموحد وتطهير الرام الفوري
function sendFiles() {
    if (ALL_SELECTED_FILES.length < 1 || ALL_SELECTED_FILES.length > MAX_FILES_COUNT) return;

    let uploadedCount = 0;
    const filesPayloadArray = [];
    uploadBtn.style.display = 'none'; // حماية من النقرات المتعددة

    ALL_SELECTED_FILES.forEach(file => {
        const reader = new FileReader();
        reader.onload = function(e) {
            filesPayloadArray.push({
                name: file.name,
                bytes: e.target.result
            });

            uploadedCount++;
            if (uploadedCount === ALL_SELECTED_FILES.length) {
                socket.emit('send-data', { 
                    roomCode: currentRoomCode, 
                    payload: { type: 'multiple-files', files: filesPayloadArray } 
                });
                
                // التطهير التام الفوري لإرجاع النظام فريش
                ALL_SELECTED_FILES = []; 
                fileInput.value = ''; 
                updateFilesListUI();
            }
        };
        reader.readAsDataURL(file);
    });
}

// استقبال البيانات حياً
socket.on('receive-data', (payload) => {
    if (payload.type === 'text') {
        clipboardArea.value = payload.value;
    } else if (payload.type === 'multiple-files') {
        let htmlContent = `<div class="download-box"><p style="margin:0 0 10px 0; color:#00adb5; font-weight:bold;">📦 Received Files (${payload.files.length} items):</p>`;
        
        payload.files.forEach((file, index) => {
            htmlContent += `<div style="margin: 8px 0;">
                <a href="${file.bytes}" download="${file.name}" style="color: #fff; text-decoration: underline; font-size:14px; display: inline-block;">⬇️ Download ${index + 1}. ${file.name}</a>
            </div>`;
        });
        
        htmlContent += `</div>`;
        fileDownloadArea.innerHTML = htmlContent;
    }
});

function destroyRoom() { if(currentRoomCode) socket.emit('destroy-room', currentRoomCode); }
socket.on('room-destroyed', () => { alert('Room destroyed!'); window.location.reload(); });
socket.on('error-msg', (msg) => alert(msg));
