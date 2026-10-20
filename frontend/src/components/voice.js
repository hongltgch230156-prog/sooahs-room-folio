// =====================================================================
// voice.js  -  đặt cạnh ChatbotUI.js
//  - VoiceRecorder : ghi âm mic (MediaRecorder), tự dừng khi người dùng ngừng nói
//  - createVoiceApi: gọi /api/stt và /api/tts ở backend
// =====================================================================

export class VoiceRecorder {
  constructor({
    maxDurationMs = 30000,   // tối đa 30s mỗi lượt nói
    minVoicedMs = 350,       // tổng thời gian "có tiếng nói" tối thiểu; ít hơn => coi như CHƯA NÓI GÌ
    silenceMs = 1100,        // im lặng 1.1s sau khi đã nói => tự dừng
    noSpeechMs = 7000,       // chờ 7s mà chưa nói gì => tự dừng
    speechThreshold = 0.02,  // ngưỡng tối thiểu (RMS 0..1). Ngưỡng thật = max(giá trị này, nền ồn x 2.5)
    onLevel = null,          // (0..1) => hiệu ứng nút mic
    onAutoStop = null,       // gọi khi hết giờ / im lặng đủ lâu / không ai nói
  } = {}) {
    Object.assign(this, { maxDurationMs, minVoicedMs, silenceMs, noSpeechMs, speechThreshold, onLevel, onAutoStop });
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
    this.audioCtx = null;
    this.analyser = null;
    this.rafId = 0;
    this.maxTimer = 0;
    this.startedAt = 0;
    this.voicedMs = 0;       // tổng thời gian có tiếng nói đo được
    this.canMeasure = false; // false nếu trình duyệt không có AudioContext
    this.autoStopped = false;
  }

  static isSupported() {
    return Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
  }

  // Chrome/Firefox: audio/webm (opus). Safari: audio/mp4. Wizper đọc được cả hai.
  static pickMimeType() {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
    return candidates.find((type) => MediaRecorder.isTypeSupported?.(type)) || "";
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });

    const mimeType = VoiceRecorder.pickMimeType();
    this.chunks = [];
    this.voicedMs = 0;
    this.autoStopped = false;
    this.recorder = new MediaRecorder(this.stream, {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: 32000, // giọng nói không cần cao => file nhỏ, upload nhanh hơn
    });
    this.recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) this.chunks.push(event.data);
    };
    this.recorder.start();
    this.startedAt = performance.now();

    this.maxTimer = setTimeout(() => this.triggerAutoStop(), this.maxDurationMs);
    this.monitorLevel();
  }

  triggerAutoStop() {
    if (this.autoStopped) return;
    this.autoStopped = true;
    this.onAutoStop?.();
  }

  // Đo âm lượng để: (1) hiệu ứng nút mic, (2) biết khi nào bạn nói xong,
  // (3) biết có tiếng nói THẬT hay chỉ là tiếng ồn/im lặng (nguồn gốc của lỗi "Thank you")
  monitorLevel() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return; // không đo được => chỉ dừng bằng tay / hết maxDuration

    this.canMeasure = true;
    this.audioCtx = new AudioContextClass();
    const source = this.audioCtx.createMediaStreamSource(this.stream);
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 512;
    source.connect(this.analyser);

    const samples = new Uint8Array(this.analyser.fftSize);
    const begin = performance.now();
    const calibrateUntil = begin + 300; // 0.3s đầu: đo tiếng ồn nền của phòng
    let floorSum = 0;
    let floorCount = 0;
    let threshold = this.speechThreshold;
    let heardSpeech = false;
    let silenceSince = 0;
    let last = begin;

    const tick = () => {
      if (!this.analyser) return;
      this.analyser.getByteTimeDomainData(samples);

      let sum = 0;
      for (const value of samples) {
        const centered = (value - 128) / 128;
        sum += centered * centered;
      }
      const rms = Math.sqrt(sum / samples.length);
      const now = performance.now();
      const dt = now - last;
      last = now;
      this.onLevel?.(Math.min(1, rms * 4));

      if (now < calibrateUntil) {
        floorSum += rms;
        floorCount += 1;
        if (floorCount > 0) {
          const floor = Math.min(0.012, floorSum / floorCount); // chặn trần để không nuốt mất giọng nói
          threshold = Math.max(this.speechThreshold, floor * 2.5);
        }
      } else if (rms > threshold) {
        this.voicedMs += dt;
        silenceSince = 0;
        if (this.voicedMs >= 250) heardSpeech = true; // vài tiếng "tạch" của chuột không tính
      } else if (heardSpeech) {
        if (!silenceSince) silenceSince = now;
        if (now - silenceSince > this.silenceMs) {
          this.triggerAutoStop();
          return;
        }
      } else if (now - begin > this.noSpeechMs) {
        this.triggerAutoStop(); // không ai nói gì
        return;
      }
      this.rafId = requestAnimationFrame(tick);
    };
    tick();
  }

  // Dừng ghi. Trả về { blob, voicedMs, durationMs } hoặc null nếu CHƯA NÓI GÌ (quá ngắn / không có tiếng)
  stop() {
    return new Promise((resolve) => {
      const recorder = this.recorder;
      if (!recorder || recorder.state === "inactive") {
        this.cleanup();
        resolve(null);
        return;
      }
      recorder.onstop = () => {
        const durationMs = performance.now() - this.startedAt;
        const voicedMs = this.voicedMs;
        const measured = this.canMeasure;
        const blob = new Blob(this.chunks, { type: recorder.mimeType || "audio/webm" });
        this.cleanup();
        if (durationMs < 600 || (measured && voicedMs < this.minVoicedMs)) {
          resolve(null); // không gửi lên server => không bị Whisper "ảo giác" ra Thank you
          return;
        }
        resolve({
          blob,
          voicedMs: measured ? Math.round(voicedMs) : null,
          durationMs: Math.round(durationMs),
        });
      };
      recorder.stop();
    });
  }

  // Huỷ, bỏ dữ liệu
  cancel() {
    if (this.recorder && this.recorder.state !== "inactive") {
      this.recorder.onstop = null;
      this.recorder.stop();
    }
    this.cleanup();
  }

  // QUAN TRỌNG: phải tắt track thì icon "đang dùng mic" của trình duyệt mới biến mất
  cleanup() {
    clearTimeout(this.maxTimer);
    cancelAnimationFrame(this.rafId);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.audioCtx?.close().catch(() => {});
    this.stream = null;
    this.recorder = null;
    this.audioCtx = null;
    this.analyser = null;
  }
}

// ---------------------------------------------------------------------
// LiveSpeech: nhận diện giọng nói TRỰC TIẾP của trình duyệt (Web Speech API)
//  - chữ hiện ra ngay khi đang nói (onInterim)
//  - tự kết thúc khi bạn ngừng nói => onEnd({ text, error })
// Chạy tốt trên Chrome / Edge / Safari. Firefox & Brave thì không có/bị chặn.
// ---------------------------------------------------------------------
export class LiveSpeech {
  static isSupported() {
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  constructor({ lang = "en-US", onInterim = null, onEnd = null } = {}) {
    this.lang = lang;
    this.onInterim = onInterim;
    this.onEnd = onEnd;
    this.recognition = null;
    this.cancelled = false;
  }

  start() {
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionClass();
    this.recognition = recognition;
    recognition.lang = this.lang;
    recognition.interimResults = true;   // trả chữ tạm thời liên tục
    recognition.continuous = false;      // tự kết thúc khi ngừng nói
    recognition.maxAlternatives = 1;

    let finalText = "";
    let lastText = "";
    let error = null;

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interim += result[0].transcript;
      }
      lastText = (finalText + interim).trim();
      this.onInterim?.(lastText);
    };

    recognition.onerror = (event) => { error = event.error; };

    recognition.onend = () => {
      this.recognition = null;
      if (this.cancelled) return;
      // Có lúc trình duyệt kết thúc mà chưa kịp đánh dấu final => dùng chữ cuối cùng nhận được
      this.onEnd?.({ text: (finalText.trim() || lastText), error });
    };

    recognition.start();
  }

  // Bấm dừng sớm: trình duyệt vẫn trả kết quả cho phần đã nói, rồi gọi onEnd
  stop() { this.recognition?.stop(); }

  // Huỷ hẳn, không gọi onEnd
  cancel() {
    this.cancelled = true;
    this.recognition?.abort();
    this.recognition = null;
  }
}

// ---------------------------------------------------------------------
// Client gọi backend. Backend của bạn có requireAuth nên cần gửi token:
// truyền vào getHeaders() đúng cách bạn đang gắn token cho /api/chat.
// ---------------------------------------------------------------------
export function createVoiceApi({ baseUrl = "", getHeaders = () => ({}), language = null } = {}) {
  // language: "en" | "vi" | ... ; null = tự nhận diện (chậm hơn chút)

  // lang: "en" | "vi" ... (ngôn ngữ người dùng đang chọn). Bỏ trống => dùng giá trị mặc định ở trên
  async function transcribe(blob, lang, meta = {}) {
    const form = new FormData();
    const extension = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
    form.append("audio", blob, `voice.${extension}`);
    const useLanguage = lang === undefined ? language : lang;
    if (useLanguage) form.append("language", useLanguage);  // null/trống => Wizper tự nhận diện
    if (Number.isFinite(meta.voicedMs)) form.append("voicedMs", String(meta.voicedMs));
    if (Number.isFinite(meta.durationMs)) form.append("durationMs", String(meta.durationMs));

    // KHÔNG tự set Content-Type: trình duyệt sẽ tự thêm boundary cho multipart
    const response = await fetch(`${baseUrl}/api/stt`, {
      method: "POST",
      headers: getHeaders(),
      body: form,
      signal: AbortSignal.timeout?.(25000), // tránh treo vô hạn
    });
    if (!response.ok) throw new Error(`STT failed (${response.status})`);
    const data = await response.json();
    return data.text || "";
  }

  async function synthesize(text, characterId, lang = "en") {
    const response = await fetch(`${baseUrl}/api/tts`, {
      method: "POST",
      headers: { ...getHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ text, characterId, language: lang }),
      signal: AbortSignal.timeout?.(25000),
    });
    if (!response.ok) throw new Error(`TTS failed (${response.status})`);
    const data = await response.json();
    return data.audioUrl || null;
  }

  return { transcribe, synthesize };
}