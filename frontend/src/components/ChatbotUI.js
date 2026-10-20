import { VoiceRecorder, LiveSpeech } from "./voice.js";

// File wav rỗng, dùng để "mở khoá" autoplay âm thanh (đặc biệt cần cho Safari/iOS)
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

// Ngôn ngữ hỗ trợ. speech = mã cho Web Speech API; code = mã gửi cho Wizper/backend
// Chỉ hỗ trợ tiếng Anh và tiếng Việt (thứ tự = thứ tự hiện trên giao diện)
const LANGS = {
  en: { code: "en", speech: "en-US", label: "EN", name: "English" },
  vi: { code: "vi", speech: "vi-VN", label: "VI", name: "Tiếng Việt" },
};
const LANG_ORDER = ["en", "vi"];

// Giống cleanForSpeech ở backend: dùng khi đọc bằng giọng của trình duyệt
function cleanForSpeech(text) {
  return String(text || "")
    .replace(/\*[^*]*\*/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[`#>_~]/g, " ")
    .replace(/\p{Extended_Pictographic}/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}
const LANG_STORAGE_KEY = "voiceLang";

// Mọi chuỗi hiển thị liên quan đến chat/voice. Thêm ngôn ngữ mới = thêm một khối ở đây.
const I18N = {
  en: {
    greeting: "Hey! I'm your AI buddy. What can I help you with?",
    charHello: (name) => `Hi! I'm ${name}. What's up?`,
    connectFail: "I couldn't connect just now. Please try again.",
    placeholderIdle: "Ask me anything…",
    placeholderRecording: "Listening… tap the mic when you're done",
    placeholderProcessing: "Thinking…",
    placeholderSpeaking: "Speaking… tap the mic to interrupt",
    titleIdle: "Talk to your buddy",
    titleRecording: "Stop and send",
    titleProcessing: "Working on it…",
    titleSpeaking: "Stop speaking",
    titleUnsupported: "Voice chat is not supported by this browser",
    titleNeedHttps: "Voice chat needs HTTPS (or localhost)",
    langGroup: "Speaking language",
    langSwitched_en: "Okay, let's chat in English!",
    langSwitched_vi: "Okay, let's chat in Vietnamese!",
    voiceUnavailable: "Voice chat isn't available in this browser.",
    micDenied: "I can't use your microphone. Please allow mic access in your browser's address bar, then try again.",
    micMissing: "I can't find a microphone on this device.",
    micBusy: "Your microphone seems to be used by another app. Close it and try again.",
    micGeneric: "Something went wrong with the microphone. Please try again.",
    heardNothing: "I didn't hear anything. Tap the mic and try again.",
    couldntHear: "I couldn't hear that clearly. Please try again.",
    didntCatch: "I didn't catch that. Tap the mic and try again.",
    startFail: "I couldn't start listening. Tap the mic to try again.",
    liveUnavailable: "Live listening isn't available right now. Tap the mic again and I'll use another method.",
  },
  vi: {
    greeting: "Chào bạn! Mình là bạn đồng hành AI của bạn. Mình giúp gì được nào?",
    charHello: (name) => `Chào bạn! Mình là ${name}. Có chuyện gì thế?`,
    connectFail: "Mình không kết nối được lúc này. Bạn thử lại nhé.",
    placeholderIdle: "Hỏi mình bất cứ điều gì…",
    placeholderRecording: "Đang nghe… bấm mic khi bạn nói xong",
    placeholderProcessing: "Đang suy nghĩ…",
    placeholderSpeaking: "Đang nói… bấm mic để ngắt",
    titleIdle: "Nói chuyện với bạn đồng hành",
    titleRecording: "Dừng và gửi",
    titleProcessing: "Đang xử lý…",
    titleSpeaking: "Dừng nói",
    titleUnsupported: "Trình duyệt này chưa hỗ trợ trò chuyện bằng giọng nói",
    titleNeedHttps: "Trò chuyện bằng giọng nói cần HTTPS (hoặc localhost)",
    langGroup: "Ngôn ngữ nói",
    langSwitched_en: "Được rồi, mình nói chuyện bằng tiếng Anh nhé!",
    langSwitched_vi: "Được rồi, mình nói chuyện bằng tiếng Việt nhé!",
    voiceUnavailable: "Trình duyệt này chưa hỗ trợ trò chuyện bằng giọng nói.",
    micDenied: "Mình không dùng được micro của bạn. Hãy cho phép micro ở thanh địa chỉ của trình duyệt rồi thử lại nhé.",
    micMissing: "Mình không tìm thấy micro trên thiết bị này.",
    micBusy: "Micro đang được ứng dụng khác sử dụng. Hãy đóng ứng dụng đó rồi thử lại nhé.",
    micGeneric: "Micro có chút trục trặc. Bạn thử lại nhé.",
    heardNothing: "Mình chưa nghe thấy gì. Bấm mic và thử lại nhé.",
    couldntHear: "Mình nghe chưa rõ. Bạn thử lại nhé.",
    didntCatch: "Mình chưa nghe rõ. Bấm mic và nói lại nhé.",
    startFail: "Mình chưa bắt đầu nghe được. Bấm mic để thử lại nhé.",
    liveUnavailable: "Hiện chưa nghe trực tiếp được. Bấm mic lần nữa, mình sẽ dùng cách khác.",
  },
};

export class ChatbotUI {
  constructor({
    characters,
    initialCharacterId,
    onSend,
    onSelectCharacter,
    onClose,
    // ---- MỚI cho voice chat ----
    onTranscribe,   // async (blob) => string          : giọng nói -> chữ
    onSynthesize,   // async (text, characterId) => url : chữ -> URL audio
    onSpeakStart,   // () => void : mascot bắt đầu nói (bật animation talking)
    onSpeakEnd,     // () => void : mascot nói xong (tắt animation talking)
    initialLanguage,      // "en" | "vi". Bỏ trống = dùng lựa chọn đã lưu lần trước (mặc định "en")
    ttsEngine = "fal",    // "fal" = giọng riêng từng mascot (hay, trễ ~1-2s) | "browser" = giọng của trình duyệt (tức thì, miễn phí)
    voiceEngine = "auto", // "auto" | "browser" | "server"
    //   browser: nhận diện của trình duyệt, chữ hiện ngay khi nói (nhanh, nhưng kém với giọng vùng miền)
    //   server : ghi âm rồi gửi Wizper/Whisper (chính xác hơn, chữ hiện sau khi nói xong)
    //   auto   : như "browser", tự chuyển sang "server" khi trình duyệt không hỗ trợ
  }) {
    this.panel = document.querySelector("#chat-panel");
    this.picker = document.querySelector("#character-picker");
    this.messages = document.querySelector("#chat-messages");
    this.input = document.querySelector("#chat-input");
    this.micButton = document.querySelector("#mic-button");
    this.isOpen = false;
    this.onClose = onClose;
    this.onSend = onSend;
    this.characters = characters;
    this.onSelectCharacter = onSelectCharacter;
    this.currentAvatar = "";
    this.characterId = initialCharacterId;

    // Voice
    this.onTranscribe = onTranscribe;
    this.onSynthesize = onSynthesize;
    this.onSpeakStart = onSpeakStart;
    this.onSpeakEnd = onSpeakEnd;
    this.voiceState = "idle"; // idle | starting | recording | processing | speaking
    this.voiceSession = 0;    // tăng lên mỗi lần huỷ => bỏ qua kết quả của lượt cũ
    this.recorder = null;
    this.lang = LANGS[initialLanguage] ? initialLanguage : ChatbotUI.loadLanguage();
    this.langButtons = {};
    this.langGroup = null;
    this.isTalking = false;  // mascot đang ở trạng thái "talking"?
    this.talkTimer = null;   // hẹn giờ dừng talking khi KHÔNG có âm thanh thật
    this.voiceEngine = voiceEngine;
    this.ttsEngine = ttsEngine;
    this.live = null;          // phiên nhận diện trực tiếp (kiểu Gemini)
    this.liveBroken = false;   // true nếu trình duyệt chặn Web Speech => dùng đường ghi âm + Wizper
    this.audioEl = new Audio();
    this.audioUnlocked = false;
    this.stopPlayback = null;

    document.querySelector("#close-chat").onclick = () => this.close();
    document.querySelector("#choose-buddy").onclick = () => this.openPicker();
    document.querySelector("#close-picker").onclick = () => this.closePicker();

    document.querySelector("#chat-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const text = this.input.value.trim();
      if (!text) return;
      this.input.value = "";
      this.stopPlayback?.(); // đang đọc dở mà người dùng gõ chữ => ngắt giọng
      await this.sendMessage(text);
    });

    document.querySelector("#character-list").addEventListener("click", async (event) => {
      const card = event.target.closest("[data-character-id]");
      if (!card) return;
      card.disabled = true;
      try {
        await this.selectCharacter(Number(card.dataset.characterId));
      } catch (error) {
        console.error("Could not switch mascot:", error);
      } finally {
        card.disabled = false;
      }
    });

    document.querySelector("#scroll-left").onclick = () => {
      document.querySelector("#character-list").scrollBy({ left: -120, behavior: "smooth" });
    };
    document.querySelector("#scroll-right").onclick = () => {
      document.querySelector("#character-list").scrollBy({ left: 120, behavior: "smooth" });
    };

    this.createLangSwitch();
    this.initVoice();

    this.renderCharacters();
    this.setCharacter(initialCharacterId);

    // Tự động gửi lời chào khi mới mở web
    setTimeout(() => {
      this.addMessage("Buddy", this.t("greeting"));
    }, 500);
  }

  // =====================================================================
  // GỬI TIN NHẮN (dùng chung cho gõ chữ và nói)
  // =====================================================================
  async sendMessage(text, { speak = false, session = this.voiceSession } = {}) {
    this.addMessage("You", text);
    this.resetTalking(); // lượt mới: bỏ hẹn giờ talking của câu trả lời trước (main.js sẽ đưa mascot về "thinking")

    let reply;
    try {
      reply = await this.onSend(text, this.lang); // lang để backend trả lời đúng ngôn ngữ
    } catch {
      this.addMessage("Buddy", this.t("connectFail"));
      if (speak && session === this.voiceSession) this.setVoiceState("idle");
      return;
    }

    this.addMessage("Buddy", reply);

    if (speak) {
      // Chat bằng giọng nói: mascot nói ĐÚNG lúc âm thanh phát và dừng ĐÚNG lúc âm thanh hết (xem speak/playAudio)
      if (session === this.voiceSession) await this.speak(reply, session);
    } else {
      // Gõ chữ: không có âm thanh => ước lượng thời gian đọc theo độ dài câu trả lời
      this.talkForText(reply);
    }
  }

  // =====================================================================
  // ĐỒNG BỘ ANIMATION "TALKING" CỦA MASCOT VỚI THỜI GIAN NÓI THẬT
  // =====================================================================
  startTalking() {
    if (this.isTalking) return;
    this.isTalking = true;
    this.onSpeakStart?.();
  }

  stopTalking() {
    clearTimeout(this.talkTimer);
    this.talkTimer = null;
    if (!this.isTalking) return;
    this.isTalking = false;
    this.onSpeakEnd?.();
  }

  // Bỏ hẹn giờ mà KHÔNG báo "nói xong" (dùng khi lượt mới bắt đầu và mascot sắp chuyển sang thinking)
  resetTalking() {
    clearTimeout(this.talkTimer);
    this.talkTimer = null;
    this.isTalking = false;
  }

  // Không có âm thanh thật (gõ chữ, hoặc TTS bị lỗi): nói theo thời gian ước lượng (~14 ký tự/giây)
  talkForText(text) {
    clearTimeout(this.talkTimer);
    const ms = Math.min(12000, Math.max(1500, cleanForSpeech(text).length * 70));
    this.startTalking();
    this.talkTimer = setTimeout(() => this.stopTalking(), ms);
  }

  // =====================================================================
  // VOICE: GHI ÂM
  // =====================================================================
  initVoice() {
    const button = this.micButton;
    if (!button) return;

    const canRecord = VoiceRecorder.isSupported() && Boolean(this.onTranscribe);
    const canLive = this.voiceEngine !== "server" && LiveSpeech.isSupported();
    if (!canLive && !canRecord) {
      button.disabled = true;
      button.title = window.isSecureContext ? this.t("titleUnsupported") : this.t("titleNeedHttps");
      return;
    }

    button.title = this.t("titleIdle");
    button.addEventListener("click", () => this.onMicClick());
  }

  onMicClick() {
    switch (this.voiceState) {
      case "idle":
        return this.startListening();
      case "recording":
        return this.live ? this.live.stop() : this.finishListening();
      case "speaking":
        return this.stopPlayback?.();
      default:
        return undefined; // starting / processing: bỏ qua click
    }
  }

  // Safari/iOS chỉ cho phát audio nếu element đã được "play" trong một cú click của người dùng
  unlockAudio() {
    if (this.audioUnlocked) return;
    this.audioUnlocked = true;
    this.audioEl.src = SILENT_WAV;
    this.audioEl.play().catch(() => { this.audioUnlocked = false; });
  }

  async startListening() {
    this.unlockAudio(); // phải gọi ngay trong click handler
    this.stopPlayback?.();
    this.stopTalking();
    this.setVoiceState("starting");
    const session = ++this.voiceSession;

    // Ưu tiên nhận diện trực tiếp (chữ hiện ra khi đang nói, ngừng nói là tự gửi)
    const useLive = this.voiceEngine !== "server" && LiveSpeech.isSupported() && !this.liveBroken;
    if (useLive) {
      this.startLive(session);
      return;
    }
    if (!VoiceRecorder.isSupported() || !this.onTranscribe) {
      this.setVoiceState("idle");
      this.addMessage("Buddy", this.t("voiceUnavailable"));
      return;
    }

    const recorder = new VoiceRecorder({
      onLevel: (level) => this.micButton.style.setProperty("--mic-level", level.toFixed(2)),
      onAutoStop: () => this.finishListening(),
    });

    try {
      await recorder.start();
    } catch (error) {
      recorder.cancel();
      if (session === this.voiceSession) {
        this.setVoiceState("idle");
        this.addMessage("Buddy", this.describeMicError(error));
      }
      return;
    }

    // Trong lúc chờ người dùng bấm "Allow" mà họ đã đóng chat => bỏ
    if (session !== this.voiceSession) {
      recorder.cancel();
      return;
    }
    this.recorder = recorder;
    this.setVoiceState("recording");
  }

  async finishListening() {
    if (this.voiceState !== "recording" || !this.recorder) return;
    const recorder = this.recorder;
    const session = this.voiceSession;
    this.recorder = null;
    this.setVoiceState("processing");

    const recording = await recorder.stop();
    if (session !== this.voiceSession) return;
    if (!recording) { // không có tiếng nói thật => KHÔNG gửi lên server
      this.setVoiceState("idle");
      this.addMessage("Buddy", this.t("heardNothing"));
      return;
    }

    let text = "";
    try {
      text = ((await this.onTranscribe(recording.blob, LANGS[this.lang].code, {
        voicedMs: recording.voicedMs,
        durationMs: recording.durationMs,
      })) || "").trim();
    } catch (error) {
      console.error("Transcribe failed:", error);
      if (session !== this.voiceSession) return;
      this.setVoiceState("idle");
      this.addMessage("Buddy", this.t("couldntHear"));
      return;
    }
    if (session !== this.voiceSession) return;

    if (!text) {
      this.setVoiceState("idle");
      this.addMessage("Buddy", this.t("didntCatch"));
      return;
    }

    await this.sendMessage(text, { speak: true, session });
  }

  // =====================================================================
  // VOICE KIỂU GEMINI: chữ hiện ra khi đang nói, ngừng nói là tự gửi
  // =====================================================================
  startLive(session) {
    this.input.value = "";
    this.live = new LiveSpeech({
      lang: LANGS[this.lang].speech,
      onInterim: (text) => {
        if (session === this.voiceSession) this.input.value = text; // hiện chữ ngay trong ô nhập
      },
      onEnd: ({ text, error }) => this.handleLiveEnd(session, text, error),
    });

    try {
      this.live.start();
      this.setVoiceState("recording");
    } catch (error) {
      console.error("Could not start live speech:", error);
      this.live = null;
      this.liveBroken = true; // lần sau dùng đường ghi âm + Wizper
      this.setVoiceState("idle");
      this.addMessage("Buddy", this.t("startFail"));
    }
  }

  async handleLiveEnd(session, text, error) {
    if (session !== this.voiceSession) return;
    this.live = null;
    this.input.value = "";
    text = (text || "").trim();

    if (!text) {
      this.setVoiceState("idle");
      this.addMessage("Buddy", this.describeSpeechError(error));
      return;
    }

    this.setVoiceState("processing");
    await this.sendMessage(text, { speak: true, session }); // tự động gửi
  }

  describeSpeechError(error) {
    switch (error) {
      case "not-allowed":
      case "service-not-allowed":
        return this.t("micDenied");
      case "audio-capture":
        return this.t("micMissing");
      case "network":
        this.liveBroken = true; // trình duyệt không gọi được dịch vụ nhận diện (Brave, mất mạng...)
        return this.t("liveUnavailable");
      case "no-speech":
      case "aborted":
      default:
        return this.t("didntCatch");
    }
  }

  describeMicError(error) {
    switch (error?.name) {
      case "NotAllowedError":
      case "SecurityError":
        return this.t("micDenied");
      case "NotFoundError":
      case "OverconstrainedError":
        return this.t("micMissing");
      case "NotReadableError":
        return this.t("micBusy");
      default:
        console.error("Mic error:", error);
        return this.t("micGeneric");
    }
  }

  // =====================================================================
  // VOICE: ĐỌC TO CÂU TRẢ LỜI
  // =====================================================================
  async speak(text, session) {
    this.setVoiceState("processing");
    let failed = false;
    try {
      if (this.ttsEngine === "browser" && "speechSynthesis" in window) {
        if (session === this.voiceSession) await this.playBrowserTTS(text);
      } else {
        const url = await this.onSynthesize?.(text, this.characterId, this.lang);
        if (session !== this.voiceSession) return;
        if (!url) failed = true;
        else await this.playAudio(url);
      }
    } catch (error) {
      console.error("Voice playback failed:", error);
      failed = true;
    } finally {
      if (session === this.voiceSession) this.setVoiceState("idle");
    }

    // Không phát được tiếng (TTS lỗi) => mascot vẫn "nói" theo ước lượng rồi tự về trạng thái chờ
    if (failed && session === this.voiceSession) this.talkForText(text);
  }

  // Đọc bằng giọng có sẵn của trình duyệt/hệ điều hành: không cần chờ server
  playBrowserTTS(text) {
    return new Promise((resolve, reject) => {
      const synth = window.speechSynthesis;
      synth.cancel();
      const clean = cleanForSpeech(text);
      if (!clean) { reject(new Error("Nothing to speak")); return; }

      const isVi = this.lang === "vi";
      const langTag = isVi ? "vi-VN" : "en-US";
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = langTag;
      const voice = synth.getVoices().find((v) => v.lang.replace("_", "-").toLowerCase().startsWith(langTag.slice(0, 2)));
      if (voice) utterance.voice = voice;

      let started = false;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.stopPlayback = null;
        if (started) this.stopTalking(); // nói xong => mascot về trạng thái chờ
        resolve();
      };
      const fail = () => {
        if (done) return;
        done = true;
        this.stopPlayback = null;
        if (started) this.stopTalking();
        reject(new Error("Speech synthesis failed"));
      };
      this.stopPlayback = () => { synth.cancel(); finish(); };
      utterance.onstart = () => {
        started = true;
        this.setVoiceState("speaking");
        this.startTalking(); // bắt đầu có tiếng => mascot bắt đầu talking
      };
      utterance.onend = finish;
      utterance.onerror = (event) => {
        if (event.error === "canceled" || event.error === "interrupted") finish(); // do người dùng ngắt
        else fail();
      };
      synth.speak(utterance);
    });
  }

  playAudio(url) {
    return new Promise((resolve, reject) => {
      const audio = this.audioEl;
      let started = false;

      const finish = () => {
        audio.onended = null;
        audio.onerror = null;
        this.stopPlayback = null;
        if (started) this.stopTalking(); // hết tiếng (hoặc bị ngắt) => mascot về trạng thái chờ
      };

      this.stopPlayback = () => { finish(); audio.pause(); resolve(); }; // người dùng bấm ngắt
      audio.onended = () => { finish(); resolve(); };
      audio.onerror = () => { finish(); reject(new Error("Could not play audio")); };

      audio.src = url;
      audio.play()
        .then(() => {
          if (!this.stopPlayback) return; // đã bị ngắt trước khi kịp phát
          started = true;
          this.setVoiceState("speaking");
          this.startTalking(); // tiếng bắt đầu phát => mascot bắt đầu talking
        })
        .catch((error) => { finish(); reject(error); });
    });
  }

  // Huỷ mọi thứ đang diễn ra (khi đóng chat / đổi nhân vật)
  cancelVoice() {
    this.voiceSession += 1;
    this.recorder?.cancel();
    this.recorder = null;
    if (this.live) {
      this.live.cancel();
      this.live = null;
      this.input.value = "";
    }
    this.stopPlayback?.();
    this.stopTalking();
    this.setVoiceState("idle");
  }

  setVoiceState(state) {
    this.voiceState = state;
    const button = this.micButton;
    if (!button) return;

    button.classList.toggle("is-recording", state === "recording");
    button.classList.toggle("is-busy", state === "processing" || state === "starting");
    button.classList.toggle("is-speaking", state === "speaking");
    button.setAttribute("aria-pressed", String(state === "recording"));
    if (state !== "recording") button.style.removeProperty("--mic-level");

    const key = state === "starting" ? "Idle" : state[0].toUpperCase() + state.slice(1);
    button.title = this.t(`title${key}`);
    this.input.placeholder = this.t(`placeholder${key}`);
  }

  // =====================================================================
  // ĐA NGÔN NGỮ (EN / VI)
  // =====================================================================
  static loadLanguage() {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      return LANGS[saved] ? saved : "en";
    } catch {
      return "en";
    }
  }

  // Lấy chuỗi theo ngôn ngữ hiện tại: this.t("greeting") hoặc this.t("charHello")(name)
  t(key, ...args) {
    const ui = this.lang === "vi" ? "vi" : "en";
    const value = (I18N[ui] || I18N.en)[key] ?? I18N.en[key] ?? key;
    return typeof value === "function" ? value(...args) : value;
  }

  // Bộ chọn "EN | VI" nằm ngay trước nút mic (JS tự tạo nên không cần sửa HTML)
  createLangSwitch() {
    if (!this.micButton) return;
    const group = document.createElement("div");
    group.id = "lang-switch";
    group.setAttribute("role", "group");

    this.langButtons = {};
    LANG_ORDER.forEach((code) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.lang = code;
      button.textContent = LANGS[code].label;
      button.title = LANGS[code].name;
      button.addEventListener("click", () => this.setLanguage(code, { announce: true }));
      group.append(button);
      this.langButtons[code] = button;
    });

    this.micButton.before(group);
    this.langGroup = group;
    this.renderLangSwitch();
    this.setVoiceState("idle"); // áp placeholder theo ngôn ngữ đã lưu
  }

  renderLangSwitch() {
    this.langGroup?.setAttribute("aria-label", this.t("langGroup"));
    Object.entries(this.langButtons).forEach(([code, button]) => {
      const active = code === this.lang;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  setLanguage(lang, { announce = false } = {}) {
    if (!LANGS[lang] || lang === this.lang) return;
    this.cancelVoice(); // đang nghe/đọc dở bằng ngôn ngữ cũ thì dừng
    this.lang = lang;
    try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch { /* bỏ qua */ }
    this.renderLangSwitch();
    this.setVoiceState(this.voiceState);
    if (announce) this.addMessage("Buddy", this.t(`langSwitched_${lang}`));
  }

  // =====================================================================
  // PHẦN CŨ (giữ nguyên logic)
  // =====================================================================
  renderCharacters() {
    const list = document.querySelector("#character-list");
    list.replaceChildren();

    // Lấy nhân vật hiện tại đang được chọn từ src của #buddy-avatar
    const currentAvatarSrc = document.querySelector("#buddy-avatar").src;
    this.characters.forEach((character) => {
      const card = document.createElement("button");
      card.type = "button";

      const isActive = currentAvatarSrc.includes(character.avatar);
      card.className = `character-card ${isActive ? "active" : ""}`;
      card.dataset.characterId = character.id;

      // Container cho ảnh (để chứa cả tick xanh)
      const imgContainer = document.createElement("div");
      imgContainer.className = "img-container";
      const image = document.createElement("img");
      image.src = character.avatar;
      image.alt = character.name;
      imgContainer.append(image);

      // Icon dấu tick (chỉ hiện khi active)
      const checkIcon = document.createElement("div");
      checkIcon.className = "check-icon";
      checkIcon.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      imgContainer.append(checkIcon);

      const name = document.createElement("span");
      name.textContent = character.name;
      name.className = "char-name";

      const mood = document.createElement("small");
      mood.textContent = character.mood;
      mood.className = "char-mood";

      card.append(imgContainer, name, mood);
      list.append(card);
    });
  }

  setCharacter(id) {
    const character = this.characters.find((item) => item.id === id);
    if (!character) return;
    this.characterId = id; // MỚI: để chọn đúng giọng đọc
    this.currentAvatar = character.avatar;
    document.querySelector("#buddy-avatar").src = character.avatar;
    document.querySelector("#buddy-avatar").alt = character.name;
    document.querySelector("#buddy-name").textContent = character.name;

    // Render lại để cập nhật class .active và dấu tick
    this.renderCharacters();
  }

  async selectCharacter(id) {
    const character = this.characters.find((item) => item.id === id);
    if (!character) return;
    this.cancelVoice(); // MỚI: đang nghe/đọc dở thì dừng trước khi đổi nhân vật
    await this.onSelectCharacter(id);
    this.setCharacter(id);
    // Xóa khung chat cũ và gửi lời chào mới khi đổi Mascot
    this.messages.innerHTML = "";
    this.addMessage("Buddy", this.t("charHello", character.name));
    this.closePicker();
  }

  open() {
    this.panel.hidden = false;
    this.isOpen = true;
  }

  close() {
    this.cancelVoice(); // MỚI: đóng chat => tắt mic + ngắt giọng
    this.panel.hidden = true;
    this.picker.hidden = true;
    this.isOpen = false;
    this.onClose();
  }

  openPicker() { this.picker.hidden = false; }
  closePicker() { this.picker.hidden = true; }

  addMessage(name, text) {
    const isBuddy = name === "Buddy";

    const container = document.createElement("div");
    container.className = `chat-msg-row ${isBuddy ? "msg-buddy" : "msg-you"}`;

    if (isBuddy) {
      const avatar = document.createElement("img");
      avatar.className = "msg-avatar";
      avatar.src = this.currentAvatar;
      container.append(avatar);
    }

    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    bubble.textContent = text;

    container.append(bubble);
    this.messages.append(container);

    this.messages.scrollTop = this.messages.scrollHeight;
  }
}