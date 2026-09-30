export class ChatbotUI {
  constructor({ characters, initialCharacterId, onSend, onSelectCharacter, onClose }) {
    this.panel = document.querySelector("#chat-panel");
    this.picker = document.querySelector("#character-picker");
    this.messages = document.querySelector("#chat-messages");
    this.input = document.querySelector("#chat-input");
    this.isOpen = false;
    this.onClose = onClose;
    this.onSend = onSend;
    this.characters = characters;
    this.onSelectCharacter = onSelectCharacter;
    this.currentAvatar = "";

    document.querySelector("#close-chat").onclick = () => this.close();
    document.querySelector("#choose-buddy").onclick = () => this.openPicker();
    document.querySelector("#close-picker").onclick = () => this.closePicker();
    document.querySelector("#chat-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const text = this.input.value.trim();
      if (!text) return;

      this.addMessage("You", text);
      this.input.value = "";

      try {
        const reply = await this.onSend(text);
        this.addMessage("Buddy", reply);
      } catch {
        this.addMessage("Buddy", "I couldn't connect just now. Please try again.");
      }
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
      document.querySelector("#character-list").scrollBy({ left: -120, behavior: 'smooth' });
    };
    document.querySelector("#scroll-right").onclick = () => {
      document.querySelector("#character-list").scrollBy({ left: 120, behavior: 'smooth' });
    };

    const micButton = document.querySelector("#mic-button");
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = "en-US";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onstart = () => { micButton.disabled = true; };
      recognition.onend = () => { micButton.disabled = false; };
      recognition.onresult = (resultEvent) => {
        this.input.value = resultEvent.results[0][0].transcript;
        this.input.focus();
      };
      micButton.addEventListener("click", () => {
        try {
          recognition.start();
        } catch (error) {
          console.error("Could not start speech recognition:", error);
        }
      });
    } else {
      micButton.disabled = true;
      micButton.title = "Speech recognition is not supported by this browser";
    }

    this.renderCharacters();
    this.setCharacter(initialCharacterId);

    // THÊM: Tự động gửi lời chào khi mới mở web
    setTimeout(() => {
      this.addMessage("Buddy", "Hey! I'm your AI buddy. What can I help you with?");
    }, 500); 
    }

    renderCharacters() {
    const list = document.querySelector("#character-list");
    list.replaceChildren();
    
    // Lấy ID nhân vật hiện tại đang được chọn (từ avatar hoặc biến lưu trữ)
    // Giả sử lấy từ src của #buddy-avatar
    const currentAvatarSrc = document.querySelector("#buddy-avatar").src;

    this.characters.forEach((character) => {
        const card = document.createElement("button");
        card.type = "button";
        
        // Kiểm tra xem character này có đang được chọn không
        const isActive = currentAvatarSrc.includes(character.avatar);
        card.className = `character-card ${isActive ? 'active' : ''}`;
        card.dataset.characterId = character.id;
        
        // Tạo container cho ảnh (để chứa cả tick xanh)
        const imgContainer = document.createElement("div");
        imgContainer.className = "img-container";

        const image = document.createElement("img");
        image.src = character.avatar;
        image.alt = character.name;
        imgContainer.append(image);

        // THÊM: Icon dấu tick (chỉ hiện khi active)
        const checkIcon = document.createElement("div");
        checkIcon.className = "check-icon";
        checkIcon.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        imgContainer.append(checkIcon);

        const name = document.createElement("span");
        name.textContent = character.name;
        name.className = "char-name"; // Để dễ CSS

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
    this.currentAvatar = character.avatar;
    document.querySelector("#buddy-avatar").src = character.avatar;
    document.querySelector("#buddy-avatar").alt = character.name;
    document.querySelector("#buddy-name").textContent = character.name;
    
    // Gọi lại hàm render để cập nhật class .active và dấu tick
    this.renderCharacters();
  }

    async selectCharacter(id) {
    const character = this.characters.find((item) => item.id === id);
    if (!character) return;

    await this.onSelectCharacter(id);
    this.setCharacter(id);
    // Tùy chọn: Xóa khung chat cũ và gửi lời chào mới khi đổi Mascot
    this.messages.innerHTML = ""; 
    this.addMessage("Buddy", `Hi! I'm ${character.name}. What's up?`);
    
    this.closePicker();
    }

  open() {
    this.panel.hidden = false;
    this.isOpen = true;
  }

  close() {
    this.panel.hidden = true;
    this.picker.hidden = true;
    this.isOpen = false;
    this.onClose();
  }

  openPicker() { this.picker.hidden = false; }
  closePicker() { this.picker.hidden = true; }

  addMessage(name, text) {
    const isBuddy = name === "Buddy";
    
    // Tạo container cho tin nhắn
    const container = document.createElement("div");
    container.className = `chat-msg-row ${isBuddy ? "msg-buddy" : "msg-you"}`;

    // Tạo Avatar cho Buddy
    if (isBuddy) {
      const avatar = document.createElement("img");
      avatar.className = "msg-avatar";
      avatar.src = this.currentAvatar;
      container.append(avatar);
    }

    // Tạo bong bóng chat
    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    bubble.textContent = text;
    
    container.append(bubble);
    this.messages.append(container);
    
    // Cuộn xuống cuối
    this.messages.scrollTop = this.messages.scrollHeight;
  }
}