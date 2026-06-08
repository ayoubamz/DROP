const socket = io();

const MAX_TEXT_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_FILES_TOTAL_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_FILES_COUNT = 6;

let currentRoomCode = null;
let selectedFiles = [];
let dragAndDropReady = false;

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
const filesCounterLabel = document.getElementById('files-counter-label');

function createRoom() {
    socket.emit('create-room');
}

function joinRoom() {
    const code = roomInput.value.trim();
    if (!/^\d{4}$/.test(code)) {
        alert('Please enter a valid 4-digit room code.');
        return;
    }

    socket.emit('join-room', code);
}

function switchToShareScreen() {
    startScreen.classList.add('hidden');
    shareScreen.classList.remove('hidden');
    setupDragAndDrop();
}

async function handleInstantFileSelection(event) {
    const entryList = Array.from(event.target.webkitEntries || []);

    if (entryList.length > 0) {
        const collectedFiles = await collectFilesFromEntries(entryList);
        if (collectedFiles.length > 0) {
            addFilesToQueue(collectedFiles);
        }
    } else {
        const selected = Array.from(fileInput.files || []);
        if (selected.length > 0) {
            addFilesToQueue(selected);
        }
    }

    fileInput.value = '';
}

function readDirectoryEntries(directoryEntry) {
    return new Promise((resolve, reject) => {
        const reader = directoryEntry.createReader();
        reader.readEntries((entries) => resolve(entries), reject);
    });
}

function readEntryAsFile(entry) {
    return new Promise((resolve, reject) => {
        entry.file((file) => resolve(file), reject);
    });
}

async function collectFilesFromEntries(entries) {
    const collectedFiles = [];

    for (const entry of entries) {
        if (entry.isFile) {
            collectedFiles.push(await readEntryAsFile(entry));
            continue;
        }

        if (entry.isDirectory) {
            const childEntries = await readDirectoryEntries(entry);
            collectedFiles.push(...await collectFilesFromEntries(childEntries));
        }
    }

    return collectedFiles;
}

async function collectFilesFromItems(items) {
    const entries = Array.from(items || [])
        .map((item) => item.webkitGetAsEntry && item.webkitGetAsEntry())
        .filter(Boolean);

    return collectFilesFromEntries(entries);
}


function setupDragAndDrop() {
    if (!dropZone || dragAndDropReady) return;

    dragAndDropReady = true;

    ['dragenter', 'dragover'].forEach((eventName) => {
        dropZone.addEventListener(eventName, (event) => {
            event.preventDefault();
            event.stopPropagation();
            dropZone.classList.add('drag-over');
        });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
        dropZone.addEventListener(eventName, (event) => {
            event.preventDefault();
            event.stopPropagation();
            dropZone.classList.remove('drag-over');
        });
    });

    dropZone.addEventListener('drop', async (event) => {
        const items = event.dataTransfer && event.dataTransfer.items;

        if (items && items.length > 0) {
            const files = await collectFilesFromItems(items);
            if (files.length > 0) {
                addFilesToQueue(files);
            }
            return;
        }

        const files = event.dataTransfer && event.dataTransfer.files;
        if (files && files.length > 0) {
            addFilesToQueue(Array.from(files));
        }
    });
}

function addFilesToQueue(files) {
    fileError.classList.add('hidden');
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
        const isDuplicate = selectedFiles.some((existingFile) => (
            existingFile.name === file.name &&
            existingFile.size === file.size &&
            existingFile.lastModified === file.lastModified
        ));

        if (!isDuplicate) selectedFiles.push(file);
    });

    updateFilesListUI();
}

function updateFilesListUI() {
    selectedFilesList.textContent = '';

    if (selectedFiles.length > 0) {
        filesCounterLabel.textContent = `(Current: ${selectedFiles.length} / max: ${MAX_FILES_COUNT})`;
        filesCounterLabel.style.color = selectedFiles.length > MAX_FILES_COUNT ? '#ff2e63' : '#00adb5';
    } else {
        filesCounterLabel.textContent = `(max: ${MAX_FILES_COUNT} files at a time)`;
        filesCounterLabel.style.color = '#00adb5';
    }

    if (selectedFiles.length === 0) {
        selectedFilesList.classList.add('hidden');
        uploadBtn.style.display = 'none';
        fileError.classList.add('hidden');
        return;
    }

    selectedFilesList.classList.remove('hidden');

    const totalSize = selectedFiles.reduce((sum, file) => sum + file.size, 0);

    selectedFiles.forEach((file, index) => {
        const item = document.createElement('div');
        const fileDetails = document.createElement('span');
        const removeButton = document.createElement('button');
        const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);

        item.className = 'file-item';
        fileDetails.textContent = `📄 ${index + 1}. ${file.name} (${sizeInMB} MB)`;

        removeButton.type = 'button';
        removeButton.className = 'remove-file-button';
        removeButton.textContent = '✕';
        removeButton.title = `Remove ${file.name}`;
        removeButton.setAttribute('aria-label', `Remove ${file.name}`);
        removeButton.addEventListener('click', (event) => {
            event.stopPropagation();
            removeFileFromQueue(index);
        });

        item.append(fileDetails, removeButton);
        selectedFilesList.appendChild(item);
    });

    if (selectedFiles.length > MAX_FILES_COUNT) {
        fileError.textContent = `⚠️ Limit exceeded! Max ${MAX_FILES_COUNT} files. Please remove ${selectedFiles.length - MAX_FILES_COUNT} file(s).`;
        fileError.classList.remove('hidden');
    } else if (totalSize > MAX_FILES_TOTAL_SIZE) {
        fileError.textContent = `⚠️ Total size (${(totalSize / (1024 * 1024)).toFixed(2)} MB) exceeds 20MB limit!`;
        fileError.classList.remove('hidden');
    } else {
        fileError.classList.add('hidden');
    }

    const isCountValid = selectedFiles.length >= 1 && selectedFiles.length <= MAX_FILES_COUNT;
    const isSizeValid = totalSize <= MAX_FILES_TOTAL_SIZE;
    uploadBtn.style.display = isCountValid && isSizeValid ? 'block' : 'none';
}

function removeFileFromQueue(index) {
    selectedFiles.splice(index, 1);
    updateFilesListUI();
}

function sendFiles() {
    const totalSize = selectedFiles.reduce((sum, file) => sum + file.size, 0);
    const isCountValid = selectedFiles.length >= 1 && selectedFiles.length <= MAX_FILES_COUNT;
    const isSizeValid = totalSize <= MAX_FILES_TOTAL_SIZE;

    if (!currentRoomCode || !isCountValid || !isSizeValid) return;

    let uploadedCount = 0;
    const filesPayloadArray = [];
    uploadBtn.style.display = 'none';

    selectedFiles.forEach((file) => {
        const reader = new FileReader();

        reader.onload = (event) => {
            filesPayloadArray.push({
                name: file.name,
                bytes: event.target.result
            });

            uploadedCount += 1;
            if (uploadedCount === selectedFiles.length) {
                socket.emit('send-data', {
                    roomCode: currentRoomCode,
                    payload: { type: 'multiple-files', files: filesPayloadArray }
                });

                selectedFiles = [];
                fileInput.value = '';
                updateFilesListUI();
            }
        };

        reader.onerror = () => {
            fileError.textContent = `⚠️ Could not read ${file.name}. Please try again.`;
            fileError.classList.remove('hidden');
            updateFilesListUI();
        };

        reader.readAsDataURL(file);
    });
}

async function showReceivedFiles(files) {
    const downloadBox = document.createElement('div');
    const title = document.createElement('p');

    downloadBox.className = 'download-box';
    title.className = 'download-title';
    title.textContent = `📦 Received Files (${files.length} items):`;
    downloadBox.appendChild(title);

    for (const [index, file] of files.entries()) {
        const row = document.createElement('div');
        const link = document.createElement('a');

        row.className = 'download-row';
        link.rel = 'noopener noreferrer';
        link.download = file.name || `download-${index + 1}`;
        link.textContent = `⬇️ Download ${index + 1}. ${file.name || 'file'}`;

        try {
            const blob = await fetch(file.bytes).then((response) => response.blob());
            const objectUrl = URL.createObjectURL(blob);
            link.href = objectUrl;

            link.addEventListener('click', () => {
                setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
            }, { once: true });
        } catch (error) {
            link.href = file.bytes || '';
            link.title = 'Download may be unavailable in this browser';
        }

        row.appendChild(link);
        downloadBox.appendChild(row);
    }

    fileDownloadArea.textContent = '';
    fileDownloadArea.appendChild(downloadBox);
}

function destroyRoom() {
    if (currentRoomCode) socket.emit('destroy-room', currentRoomCode);
}

fileInput.addEventListener('change', handleInstantFileSelection);

dropZone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        fileInput.click();
    }
});

roomInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') joinRoom();
});

clipboardArea.addEventListener('input', () => {
    const text = clipboardArea.value;

    if (new Blob([text]).size > MAX_TEXT_SIZE) {
        textError.classList.remove('hidden');
        return;
    }

    textError.classList.add('hidden');

    if (currentRoomCode) {
        socket.emit('send-data', {
            roomCode: currentRoomCode,
            payload: { type: 'text', value: text }
        });
    }
});

socket.on('room-created', (code) => {
    currentRoomCode = code;
    displayCode.textContent = code;
    switchToShareScreen();
});

socket.on('joined-success', (code) => {
    currentRoomCode = code;
    displayCode.textContent = code;
    switchToShareScreen();
});

socket.on('receive-data', (payload) => {
    if (!payload || typeof payload !== 'object') return;

    if (payload.type === 'text') {
        clipboardArea.value = payload.value || '';
    } else if (payload.type === 'multiple-files' && Array.isArray(payload.files)) {
        showReceivedFiles(payload.files);
    }
});

socket.on('room-destroyed', () => {
    alert('Room destroyed!');
    window.location.reload();
});

socket.on('error-msg', (msg) => alert(msg));
