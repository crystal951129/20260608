let capture;
let handpose;
let predictions = [];
let isModelReady = false;

// 數學遊戲變數
let numA, numB, targetAnswer;
let operationSymbol = "+"; // 記錄目前的運算符號
let score = 0;
let highScore = 0;
let gameMode = "SIMPLE"; // SIMPLE (10以內), HARD (11-55)
let detectedCount = 0;
let detectionHistory = []; // 用於穩定偵測結果 (防止跳動)
let problemHistory = []; // 儲存答對的歷史題目
let correctTimer = 0; // 用於確認穩定比出正確答案
let gameState = "START"; // START, PLAYING, END

// 計時器變數
let gameDuration = 30; // 遊戲總時間 (秒)
let timerStartTime; // 遊戲開始時的毫秒數
let timeRemaining; // 剩餘時間 (秒)

// 效能與佈局優化變數
let videoW, videoH, videoX, videoY;
let mirrorOffset;
let captureLoaded = false;

let btnSimple, btnHard, btnReset, btnDownload; // 改為全域變數方便管理

function setup() {
  // 建立全螢幕畫布
  createCanvas(windowWidth, windowHeight);
  
  // 擷取攝影機影像
  capture = createCapture(VIDEO);
  capture.size(640, 480); // 強制設定解析度，增加偵測穩定度
  // 隱藏預設在畫布下方的 HTML 影片元件
  capture.hide();

  // 初始化佈局變數
  updateLayout();

  // 使用新版 ml5.handPose 初始化
  // 因為 draw() 裡面已經用了 scale(-1, 1) 做鏡像，所以這裡要設為 false
  handpose = ml5.handPose(capture, { flipped: false }, () => {
    console.log("手勢偵測模型已就緒！");
    // 確保攝影機寬度正確後再開始偵測
    let checkCapture = setInterval(() => {
      if (capture.width > 0) {
        isModelReady = true;
        handpose.detectStart(capture, gotHands);
        clearInterval(checkCapture);
      }
    }, 100);
  });

  // 建立截圖按鈕
  btnDownload = createButton('下載截圖');
  btnDownload.position(20, 20);
  btnDownload.mousePressed(takeScreenshot);
  btnDownload.attribute('translate', 'no'); // 禁止瀏覽器翻譯此按鈕

  // 建立清除紀錄按鈕
  btnReset = createButton('清除紀錄');
  btnReset.position(100, 20); // 放在下載按鈕旁邊
  btnReset.mousePressed(resetHighScore);
  btnReset.attribute('translate', 'no'); // 禁止瀏覽器翻譯此按鈕

  // 建立模式選擇按鈕
  btnSimple = createButton('簡單模式');
  btnSimple.position(20, 60);
  btnSimple.mousePressed(() => startGame("SIMPLE"));
  btnSimple.attribute('translate', 'no');

  btnHard = createButton('困難模式');
  btnHard.position(20, 180); // 往下移，留空間給簡單模式的說明
  btnHard.mousePressed(() => startGame("HARD"));
  btnHard.attribute('translate', 'no');

  // 初始化時間
  timeRemaining = gameDuration;

  // 讀取最高分紀錄
  highScore = parseInt(localStorage.getItem('mathHighScore')) || 0;
}

// 處理偵測結果的回呼函式
function gotHands(results) {
  predictions = results;
}

function startGame(mode) {
  gameMode = mode;
  gameState = "PLAYING";
  score = 0;
  timerStartTime = millis(); // 記錄遊戲開始時間
  generateProblem(); // 生成第一題
}
function draw() {
  // 設定畫布背景顏色為 669bbc
  background('#669bbc');
  
  // 檢查攝影機是否準備好，更新一次佈局
  if (!captureLoaded && capture.width > 0) {
    updateLayout();
    captureLoaded = true;
  }

  handleTimer();

  // 處理影像左右顛倒 (水平鏡像) 並繪製到畫面上
  push();
  translate(mirrorOffset, videoY); // 使用快取的位移值
  scale(-1, 1);            // 水平翻轉
  
  // 繪製攝影機影像
  image(capture, 0, 0, videoW, videoH);

  // 如果偵測到手勢，繪製手部節點
  if (predictions.length > 0) {
    drawKeypoints(videoW, videoH);
    analyzeFingers();
  }
  pop();

  // 顯示教學狀態資訊
  drawUI(videoX, videoY, videoW, videoH);
  
  // 檢查答案邏輯
  if (gameState === "PLAYING" && isModelReady && predictions.length > 0 && detectedCount === targetAnswer && targetAnswer !== undefined) {
    correctTimer++;
    if (correctTimer > 30) { // 持續約 0.5 秒正確則進下一題
      score++;
      problemHistory.unshift(`${numA} ${operationSymbol} ${numB} = ${targetAnswer}`);
      if (problemHistory.length > 5) problemHistory.pop(); // 只保留最近 5 題
      generateProblem();
    }
  } else {
    correctTimer = 0;
  }
}

// 動態計算佈局，避免每幀重複運算
function updateLayout() {
  let maxW = windowWidth * 0.5;
  let maxH = windowHeight * 0.5;
  videoW = maxW;
  videoH = maxH;

  if (capture.width > 0 && capture.height > 0) {
    let cameraAspect = capture.width / capture.height;
    let containerAspect = maxW / maxH;
    if (cameraAspect > containerAspect) {
      videoH = maxW / cameraAspect;
    } else {
      videoW = maxH * cameraAspect;
    }
  }
  videoX = (windowWidth - videoW) / 2;
  videoY = (windowHeight - videoH) / 2;
  mirrorOffset = videoX + videoW;
}

function handleTimer() {
  if (gameState === "PLAYING") {
    let elapsed = (millis() - timerStartTime) / 1000;
    timeRemaining = gameDuration - elapsed;
    if (timeRemaining <= 0) {
      gameState = "END";
      timeRemaining = 0;
      if (score > highScore) {
        highScore = score;
        localStorage.setItem('mathHighScore', highScore);
      }
    }
  }
}

// 繪製手部關鍵點的函式
function drawKeypoints(vw, vh) {
  if (capture.width === 0 || capture.height === 0) return; 

  for (let i = 0; i < predictions.length; i++) {
    let hand = predictions[i];
    for (let j = 0; j < hand.keypoints.length; j++) {
      let keypoint = hand.keypoints[j];

      // 修正座標映射：ml5 v1 的座標通常是相對於攝影機輸入解析度的像素值
      // 我們需要將其轉換為相對於顯示區域 (vw, vh) 的比例
      let mappedX = (keypoint.x / capture.width) * vw;
      let mappedY = (keypoint.y / capture.height) * vh;
      fill(0, 255, 0);
      noStroke();
      ellipse(mappedX, mappedY, 10, 10);
    }
  }
}

// 分析伸出的手指數量
function analyzeFingers() {
  if (capture.width === 0 || capture.height === 0) return;

  let tens = 0;
  let units = 0;
  let sumAll = 0; // 新增：儲存所有手指的總和
  
  // 遍歷所有偵測到的手掌，加總手指頭數量
  for (let i = 0; i < predictions.length; i++) {
    let handData = predictions[i];
    let points = handData.keypoints;
    let wrist = points[0]; // 手腕點位
    let count = 0;

    // 改用距離判斷：若指尖到手腕的距離 > 關節到手腕的距離，代表手指伸直
    // 這種方式不受手掌旋轉角度影響 (更穩定)
    if (dist(points[8].x, points[8].y, wrist.x, wrist.y) > dist(points[6].x, points[6].y, wrist.x, wrist.y) * 1.1) count++;   // 食指
    if (dist(points[12].x, points[12].y, wrist.x, wrist.y) > dist(points[10].x, points[10].y, wrist.x, wrist.y) * 1.1) count++; // 中指
    if (dist(points[16].x, points[16].y, wrist.x, wrist.y) > dist(points[14].x, points[14].y, wrist.x, wrist.y) * 1.1) count++; // 無名指
    if (dist(points[20].x, points[20].y, wrist.x, wrist.y) > dist(points[18].x, points[18].y, wrist.x, wrist.y) * 1.1) count++; // 小指
    
    // 大拇指判定：改用大拇指尖到小指根部 (17) 的距離判斷
    if (dist(points[4].x, points[4].y, points[17].x, points[17].y) > dist(points[5].x, points[5].y, points[17].x, points[17].y) * 1.2) {
      count++;
    }

    sumAll += count; // 無論位置，先計算總手指數
    // 根據手在畫面上的位置決定權重 (畫布已鏡像，需對應模型座標)
    // wrist.x > 320 代表在畫面左側 (十位數)
    // wrist.x < 320 代表在畫面右側 (個位數)
    if (wrist.x > capture.width / 2) {
      tens += count;
    } else {
      units += count;
    }
  }
  
  // 自動切換偵測邏輯：
  // 如果題目答案小於 10，使用簡單加總 (sumAll)
  // 如果題目答案 >= 10，使用進位制 (tens*10 + units)
  let total = (targetAnswer < 10) ? sumAll : (tens * 10 + units);

  // 平滑化處理：取最近 5 幀出現次數最多的數字
  detectionHistory.push(total);
  if (detectionHistory.length > 5) detectionHistory.shift();
  
  let counts = {};
  let maxFreq = 0;
  let mostFrequent = total;
  for (let n of detectionHistory) {
    counts[n] = (counts[n] || 0) + 1;
    if (counts[n] > maxFreq) {
      maxFreq = counts[n];
      mostFrequent = n;
    }
  }
  detectedCount = mostFrequent;
}

function generateProblem() {
  let op = floor(random(4)); // 0: 加, 1: 減, 2: 乘, 3: 除
  let isHard = (gameMode === "HARD");
  let found = false;

  while (!found) {
    if (op === 0) { // 加法
      operationSymbol = "+";
      targetAnswer = isHard ? floor(random(11, 56)) : floor(random(1, 11));
      numA = floor(random(0, targetAnswer + 1));
      numB = targetAnswer - numA;
    } else if (op === 1) { // 減法
      operationSymbol = "-";
      numA = isHard ? floor(random(11, 56)) : floor(random(1, 11));
      numB = floor(random(0, numA + 1));
      targetAnswer = numA - numB;
    } else if (op === 2) { // 乘法
      operationSymbol = "×";
      targetAnswer = isHard ? floor(random(11, 56)) : floor(random(1, 11));
      let factors = [];
      for (let i = 1; i <= targetAnswer; i++) {
        if (targetAnswer % i === 0) factors.push(i);
      }
      numA = factors[floor(random(factors.length))];
      numB = targetAnswer / numA;
    } else { // 除法
      operationSymbol = "÷";
      targetAnswer = isHard ? floor(random(11, 56)) : floor(random(1, 11));
      numB = floor(random(1, 6));
      numA = targetAnswer * numB;
    }

    // 關鍵驗證：如果是困難模式，確保十位與個位都不超過 5
    if (!isHard) {
      found = true;
    } else {
      let t = floor(targetAnswer / 10);
      let u = targetAnswer % 10;
      if (t <= 5 && u <= 5) found = true;
    }
  }
  correctTimer = 0;
}

function drawUI(x, y, vw, vh) {
  textAlign(CENTER);
  fill(255);
  
  // 顯示題目
  if (gameState === "START") {
    textAlign(LEFT); // 改為左對齊，方便放在按鈕下方
    
    // 簡單模式說明
    fill(255);
    textSize(16);
    // 對齊簡單模式按鈕 (y=60)
    text("【簡單模式：答案 10 以內】", 20, 105);
    text("• 請伸出單手或雙手，手指數量直接加總。", 20, 125);
    text("• 例如：一手比 3、另一手比 5，即代表 8。", 20, 145);

    // 困難模式說明
    // 對齊困難模式按鈕 (y=180)
    text("【困難模式：答案 11 到 55】", 20, 225);
    text("• 左手比十位，右手比個位 (每手最高 5)。", 20, 245);
    text("• 例如：左手比 2，右手比 3，即代表 23。", 20, 265);

    // 將標題和最高分紀錄也改為靠左對齊，避開中間的影片區域
    textAlign(LEFT);
    textSize(36);
    fill(255);
    text("AI 手勢數學遊戲", 20, 330);
    fill('#ffd166');
    text(`最高分紀錄: ${highScore}`, 20, 380);

  } else if (gameState === "PLAYING") {
    textSize(48);
    fill('#ffd166');
    text(`${numA} ${operationSymbol} ${numB} = ?`, width / 2, y - 50);
    
    textSize(18);
    fill(255);
    let hint = (gameMode === "SIMPLE") ? "(請比出總數)" : "(左手十位、右手個位，上限55)";
    let statusText = isModelReady ? (predictions.length > 0 ? `目前偵測到：${detectedCount} ${hint}` : "🔍 請伸出手指進行答題") : "⌛ 模型載入中...";
    text(statusText, width / 2, y + vh + 40);
    
    // 顯示分數
    textSize(24);
    text(`得分: ${score}`, width / 2, y + vh + 80);

    // 顯示倒數計時
    textSize(32);
    fill('#ff6b6b');
    text(`時間: ${ceil(timeRemaining)}s`, width / 2, y - 100);

    // 顯示歷史紀錄 (靠左對齊，避開中間影像)
    textAlign(LEFT);
    textSize(16);
    fill(255);
    text("歷史紀錄 (History):", 20, height - 120);
    for (let i = 0; i < problemHistory.length; i++) {
      fill(255, 255 - (i * 40)); // 越舊的越透明
      text(`✅ ${problemHistory[i]}`, 20, height - 90 + (i * 25));
    }

    // 答對時的進度條提示
    if (correctTimer > 0) {
      fill(0, 255, 0);
      rect(x, y + vh + 10, map(correctTimer, 0, 30, 0, vw), 5);
    }
  } else if (gameState === "END") {
    textAlign(LEFT); // 結束畫面也移到左側
    textSize(48);
    fill('#ffd166');
    text("遊戲結束！", 20, 330);
    textSize(36);
    fill(255);
    text(`最終得分: ${score}`, 20, 380);
    textSize(28);
    text(`最高分紀錄: ${highScore}`, 20, 430);
    textSize(24);
    text("請點擊左側按鈕重新開始", 20, 480);
  }
}

function takeScreenshot() {
  // 下載目前的畫布，檔名為 screenshot.png
  saveCanvas('screenshot', 'png');
}

function resetHighScore() {
  highScore = 0;
  problemHistory = []; // 同時清空歷史清單
  localStorage.removeItem('mathHighScore');
}

let startRestartBtn; // 已替換為模式按鈕

function windowResized() {
  // 當視窗大小改變時，重新調整畫布大小
  resizeCanvas(windowWidth, windowHeight);
  updateLayout();
}