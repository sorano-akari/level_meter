const canvas = document.getElementById('audio-visualizer');
const ctx = canvas.getContext('2d');
const fileSelectButton = document.getElementById('file-select-button');
const togglePlayButton = document.getElementById('toggle-play-button');
const audioInput = document.getElementById('audio-file');
const toggleModeButton = document.getElementById('toggle-mode-button');
const toggleLabelButton = document.getElementById('toggle-label-button');
const colorSelect = document.getElementById('color-select');
const toggleChromaButton = document.getElementById('toggle-chroma-button');

// ★★★ 追加要素 ★★★
const progressBarContainer = document.getElementById('progress-bar-container');
const progressBar = document.getElementById('progress-bar');
const playhead = document.getElementById('playhead');
const rewindButton = document.getElementById('rewind-button');


// グローバルなオーディオ関連の変数
let audioContext;
let analyser;
let source;
let audioBuffer;
let dataArray;
let bufferLength;
let isPlaying = false;
let startTime = 0;
let pauseTime = 0; 
let currentPlayTime = 0; 
let progressInterval; 

// 表示設定変数
let displayMode = 'detail';     
let showLabels = true;          
let colorMode = 'muffet';       
let chromaKeyMode = false;      
const TARGET_GROUP_BANDS = 20; 
const VERTICAL_STEPS = 20;      

// 定数
const MIN_FREQ = 0; 
const MAX_FREQ_DRAW = 22050; 

function resizeCanvas() {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();


// --- UIイベントリスナー --- 

fileSelectButton.addEventListener('click', () => {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    audioInput.click();
});

audioInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    fileSelectButton.textContent = '🎶 DECODING...';
    
    const reader = new FileReader();
    reader.onload = (event) => {
        audioContext.decodeAudioData(event.target.result, (buffer) => {
            audioBuffer = buffer;
            setupAnalyser();
            fileSelectButton.textContent = '🎵 LOADED';
            togglePlayButton.disabled = false;
            toggleModeButton.disabled = false;
            toggleLabelButton.disabled = false; 
            colorSelect.disabled = false;      
            toggleChromaButton.disabled = false; 
            rewindButton.disabled = false; 
            
            pauseTime = 0;
            currentPlayTime = 0;
            updateProgress(0); 
            draw();
        }, (e) => {
            console.error('Audio decoding failed:', e);
            fileSelectButton.textContent = '❌ DECODE FAILED';
        });
    };
    reader.readAsArrayBuffer(file);
});

togglePlayButton.addEventListener('click', () => {
    if (isPlaying) {
        pauseAudio();
    } else {
        playAudio();
    }
});

rewindButton.addEventListener('click', () => {
    if (!audioBuffer) return;
    
    if (isPlaying) {
        source.stop();
        isPlaying = false;
        clearInterval(progressInterval);
    }
    pauseTime = 0;
    currentPlayTime = 0;
    togglePlayButton.textContent = '▶️ PLAY';
    updateProgress(0);
});

progressBarContainer.addEventListener('click', (e) => {
    if (!audioBuffer) return;

    const rect = progressBarContainer.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const duration = audioBuffer.duration;
    
    const seekRatio = clickX / rect.width;
    const seekTime = duration * seekRatio;

    seek(seekTime);
});

toggleModeButton.addEventListener('click', () => {
    if (displayMode === 'detail') {
        displayMode = 'group';
        toggleModeButton.textContent = `⚙️ モード: グループ (${TARGET_GROUP_BANDS}本)`;
    } else {
        displayMode = 'detail';
        toggleModeButton.textContent = '🔍 モード: 詳細 (FFTビン)';
    }
});

toggleLabelButton.addEventListener('click', () => {
    showLabels = !showLabels;
    toggleLabelButton.textContent = showLabels ? '📊 目盛り: ON' : '🔕 目盛り: OFF';
});

colorSelect.addEventListener('change', (e) => {
    colorMode = e.target.value;
});

toggleChromaButton.addEventListener('click', () => {
    chromaKeyMode = !chromaKeyMode;
    toggleChromaButton.textContent = chromaKeyMode ? '💚 背景: クロマキー ON' : '⚫ 背景: ダーク OFF';
});


// --- AudioContext/Analyser Setup ---

function setupAnalyser() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 4096; 
    analyser.smoothingTimeConstant = 0.85; 
    analyser.minDecibels = -90; 
    analyser.maxDecibels = -0;  
    
    bufferLength = analyser.frequencyBinCount; 
    dataArray = new Uint8Array(bufferLength);
}

function playAudio() {
    if (!audioBuffer) return;
    if (source) { source.disconnect(); }
    source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    
    startTime = audioContext.currentTime;
    source.start(0, pauseTime); 
    
    isPlaying = true;
    togglePlayButton.textContent = '⏸️ PAUSE';
    
    startProgressUpdate(); 
    
    source.onended = () => {
        if (isPlaying) { 
            isPlaying = false;
            pauseTime = 0;
            currentPlayTime = 0;
            togglePlayButton.textContent = '▶️ PLAY';
            updateProgress(0); 
            clearInterval(progressInterval);
        }
    };
}

function pauseAudio() {
    if (!source || !isPlaying) return;
    source.stop();
    pauseTime += audioContext.currentTime - startTime; 
    isPlaying = false;
    togglePlayButton.textContent = '▶️ PLAY';
    
    clearInterval(progressInterval); 
}

function seek(time) {
    pauseTime = time; 
    currentPlayTime = time; 

    if (isPlaying) {
        source.stop();
        playAudio();
    } else {
        updateProgress(currentPlayTime);
    }
}

function updateProgress(currentTime) {
    const duration = audioBuffer ? audioBuffer.duration : 0;
    const ratio = duration > 0 ? currentTime / duration : 0;
    const progressPercent = ratio * 100;

    progressBar.style.width = `${progressPercent}%`;
    playhead.style.left = `${progressPercent}%`;
}

function startProgressUpdate() {
    if (progressInterval) clearInterval(progressInterval); 

    progressInterval = setInterval(() => {
        if (!isPlaying) {
            clearInterval(progressInterval);
            return;
        }

        currentPlayTime = pauseTime + (audioContext.currentTime - startTime);
        
        if (currentPlayTime >= audioBuffer.duration) {
            currentPlayTime = audioBuffer.duration;
        }
        
        updateProgress(currentPlayTime);
        
        if (currentPlayTime >= audioBuffer.duration) {
             clearInterval(progressInterval);
        }
    }, 50); 
}


// --- 描画ループ関数 --- 

function draw() {
    requestAnimationFrame(draw);

    // 1. 背景色の描画
    ctx.fillStyle = chromaKeyMode ? '#00FF00' : '#1e001e'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!analyser) return;

    analyser.getByteFrequencyData(dataArray);

    // --- グラフの描画領域と枠の設定 ---
    const topMargin = 60;   
    const bottomMargin = 100; 
    const sideMarginLeft = 180;   
    const sideMarginRight = 100;   
    
    const lineWidthAdjustment = 4; 

    let displayWidth = canvas.width - sideMarginLeft - sideMarginRight;
    displayWidth -= lineWidthAdjustment; 
    
    const graphHeight = canvas.height - topMargin - bottomMargin;
    
    const startX = sideMarginLeft + lineWidthAdjustment / 2; 
    const startY = topMargin + lineWidthAdjustment / 2;       
    
    const endX = startX + displayWidth; 
    const endY = startY + graphHeight;  
    
    // 2. 外枠の描画
    ctx.strokeStyle = '#00FFFF'; 
    ctx.lineWidth = lineWidthAdjustment; 
    ctx.strokeRect(startX, startY, displayWidth, graphHeight);
    
    // 3. フォントとスタイルの設定
    ctx.font = 'bold 18px sans-serif'; 
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';

    // 4. 縦軸（Amplitude / dB）の目盛線とラベルの描画 (★単位削除済み★)
    const dbRange = analyser.maxDecibels - analyser.minDecibels; 
    const dbSteps = [0, 20, 40, 60, 80]; 
    ctx.textAlign = 'right';

    dbSteps.forEach(db => {
        const ratio = db / dbRange; 
        const y = endY - graphHeight * (1 - ratio); 
        
        if (showLabels) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'; 
            ctx.lineWidth = 1;
            if (db > 0 && db < dbRange) {
                ctx.beginPath();
                ctx.moveTo(startX, y);
                ctx.lineTo(endX, y); 
                ctx.stroke();
            }
            ctx.fillStyle = 'white'; 
            // 修正: 単位 ' dB' を削除
            ctx.fillText(`-${db}`, sideMarginLeft - 10, y + 6); 
        }
    });
    
    ctx.fillStyle = 'white'; 
    // 修正: 単位 ' dB' を削除
    ctx.fillText(`-0`, sideMarginLeft - 10, startY + 6); 
    // 修正: 単位 ' dB' を削除
    ctx.fillText(`-90`, sideMarginLeft - 10, endY + 6); 
    
    if (showLabels) {
        const titleX = sideMarginLeft / 2; 
        ctx.textAlign = 'center';
        ctx.save();
        ctx.translate(titleX, startY + graphHeight / 2); 
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('AMPLITUDE (dB)', 0, 0); 
        ctx.restore();
    }
    
    
    // 5. 横軸（Frequency / 周波数）の描画ロジック (棒グラフ本体)
    let numBarsToDraw;
    let groupSize;

    if (displayMode === 'detail') {
        numBarsToDraw = Math.min(bufferLength, Math.floor(displayWidth));
        groupSize = Math.floor(bufferLength / numBarsToDraw);
        groupSize = Math.max(1, groupSize); 
    } else {
        numBarsToDraw = TARGET_GROUP_BANDS; 
        groupSize = Math.floor(bufferLength / numBarsToDraw);
        groupSize = Math.max(1, groupSize); 
    }
    
    const fixedDrawWidth = displayWidth / numBarsToDraw; 
    const barWidth = fixedDrawWidth * 0.8; 

    const stepHeight = graphHeight / VERTICAL_STEPS;

    for (let i = 0; i < numBarsToDraw; i++) {
        
        const barCenterRatio = (i + 0.5) / numBarsToDraw;
        const barCenter = startX + displayWidth * barCenterRatio;
        const barX = barCenter - barWidth / 2; 
        
        
        let data;
        const startIndex = i * groupSize;
        const endIndex = (i === numBarsToDraw - 1) ? bufferLength : startIndex + groupSize; 
        
        let maxData = 0;
        for (let j = startIndex; j < endIndex; j++) {
            if (dataArray[j] > maxData) {
                maxData = dataArray[j];
            }
        }
        data = maxData; 

        const continuousBarHeight = graphHeight * (data / 255); 
        let quantizedSteps = Math.round(continuousBarHeight / stepHeight);
        
        let currentBarWidth = barWidth;
        
        if (i === numBarsToDraw - 1) {
             const barRightEdge = barX + barWidth;
             if (barRightEdge > endX) {
                 currentBarWidth = Math.max(0, endX - barX);
             } else if (barRightEdge < endX) {
                 currentBarWidth = Math.min(barWidth + (endX - barRightEdge), fixedDrawWidth * 0.95);
             }
        }


        if (colorMode === 'hifi') {
            const colors = [
                { steps: 2,  color: '#FF0000' }, 
                { steps: 3,  color: '#FFFF00' }, 
                { steps: 15, color: '#00FF00' }  
            ];
            
            let currentY = endY; 
            let stepsRemaining = quantizedSteps;
            
            for (const section of colors.reverse()) { 
                const maxStepsForSection = section.steps;
                const stepsToDraw = Math.min(stepsRemaining, maxStepsForSection);
                
                if (stepsToDraw > 0) {
                    ctx.fillStyle = section.color;
                    
                    for (let step = 0; step < stepsToDraw; step++) {
                        const blockY = currentY - (step + 1) * stepHeight;
                        
                        ctx.fillRect(barX, blockY, currentBarWidth, stepHeight * 0.9);
                    }
                    
                    currentY -= stepsToDraw * stepHeight; 
                    stepsRemaining -= stepsToDraw;
                }
                
                if (stepsRemaining <= 0) break;
            }
            
        } else {
            let barColor;
            
            if (colorMode === 'muffet') {
                const ratio = i / numBarsToDraw; 
                barColor = `rgb(${Math.floor(102 + 153 * ratio)}, ${Math.floor(100 * ratio)}, ${Math.floor(102 + 48 * ratio)})`;
            } else if (colorMode === 'mono') {
                barColor = 'rgb(50, 200, 255)';
            }
            
            ctx.fillStyle = barColor; 
            const finalBarHeight = quantizedSteps * stepHeight;
            
            ctx.fillRect(barX, endY - finalBarHeight, currentBarWidth, finalBarHeight);
        }
    }
    
    // 6. 横軸の目盛りテキストとタイトルの描画 (★単位削除済み★)
    const sampleRate = audioContext ? audioContext.sampleRate : 44100;
    const maxFreq = sampleRate / 2; 

    ctx.textAlign = 'center';
    
    const freqLabels = [0, 5000, 10000, 15000, maxFreq]; 
    
    freqLabels.forEach(freq => {
        const ratio = freq / maxFreq; 
        
        const xPos = startX + displayWidth * ratio; 
        
        if (ratio >= 0 && ratio <= 1) {
            let label;
            if (freq >= 1000) {
                // 修正: 単位 ' kHz' を削除
                label = (freq / 1000).toFixed(1).replace('.0', ''); 
            } else {
                // 修正: 単位 ' Hz' を削除
                label = freq.toString();
            }
            
            if (ratio === 1) {
                ctx.textAlign = 'right';
            } else if (ratio === 0) {
                ctx.textAlign = 'left';
            } else {
                ctx.textAlign = 'center';
            }
            
            ctx.fillText(label, xPos, endY + 30); 
        }
    });

    ctx.textAlign = 'right';
    // タイトルには単位を維持
    ctx.fillText('FREQUENCY (Hz)', endX, endY + 60); 
}

// 初回描画ループの開始
resizeCanvas();
draw();