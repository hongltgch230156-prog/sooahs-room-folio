import * as THREE from "three";
import gsap from "gsap";

export class MascotController {
  // THÊM charId VÀO CONSTRUCTOR ĐỂ CHỌN NHÂN VẬT
  constructor(scene, loader, charId = 1, camera = null) {
    this.scene = scene;
    this.loader = loader;
    this.charId = charId; // Lưu ID nhân vật (1, 2, 3, 4, 5)
    this.camera = camera;
    this.mascot = null;
    this.mixer = null;
    this.actions = {};
    this.currentAction = null;
    this.faceCamera = false;
    this.yawOffset = 0;
    this.cameraWorldPosition = new THREE.Vector3();
    this.mascotWorldPosition = new THREE.Vector3();
    this.homePosition = null;
    this.chatPosition = null;
    this.actionTimer = null;
    
    // Tọa độ ngắm chừng
    this.startPos = { x: 10, y: 0, z: 0 }; // Nấp sau tường (bên phải)
    this.peekPos  = { x: 10, y: 0, z: 0 }; // Ngó đầu ra khỏi tường
    this.finalPos = { x: 10, y: 0, z: 0}; // Vị trí chốt ở góc dưới bên phải
  }

  clearTimers() {
    if (this.actionTimer) {
      clearTimeout(this.actionTimer);
      this.actionTimer = null;
    }
  }

async init() {
    const position = new THREE.Vector3(
      this.startPos.x,
      this.startPos.y,
      this.startPos.z
    );
    return this.loadCharacter(this.charId, position);
  }

  async changeCharacter(charId) {
    if (!Number.isInteger(charId) || charId < 1 || charId > 5) {
      throw new Error(`Unknown mascot id: ${charId}`);
    }
    if (charId === this.charId) return;

    const previousMascot = this.mascot;
    const previousMixer = this.mixer;
    const previousActions = this.actions;
    const previousAction = this.currentAction;
    const previousId = this.charId;
    const position = previousMascot
      ? previousMascot.position.clone()
      : new THREE.Vector3(this.startPos.x, this.startPos.y, this.startPos.z);

    previousMixer?.stopAllAction();
    if (previousMascot) this.scene.remove(previousMascot);

    this.mascot = null;
    this.mixer = null;
    this.actions = {};
    this.currentAction = null;

    try {
      await this.loadCharacter(charId, position);
      this.setIdle();
    } catch (error) {
      this.charId = previousId;
      this.mascot = previousMascot;
      this.mixer = previousMixer;
      this.actions = previousActions;
      this.currentAction = previousAction;
      if (previousMascot) this.scene.add(previousMascot);
      throw error;
    }
  }

  loadCharacter(charId, position) {
    return new Promise((resolve, reject) => {
      this.loader.load(
        `/models/char${charId}.glb`,
        (glb) => {
          this.charId = charId;
          this.mascot = glb.scene;
          this.rotOffset = charId >= 3 ? Math.PI / 2 : 0;
          this.mascot.scale.setScalar(3);
          this.mascot.position.copy(position);
          this.mascot.rotation.y = -Math.PI / 4 + this.rotOffset;
          this.scene.add(this.mascot);

          this.mixer = new THREE.AnimationMixer(this.mascot);
          this.actions = {};
          this.currentAction = null;

          glb.animations.forEach((clip) => {
            if (charId === 5) {
              clip.tracks = clip.tracks.filter(
                (track) => !track.name.includes("position")
              );
            }
            this.actions[clip.name] = this.mixer.clipAction(clip);
          });

          resolve();
        },
        undefined,
        reject
      );
    });
  }

  // Hàm chuyển đổi mượt mà giữa các animation
  fadeToAction(name, duration = 0.5) {
    const nextAction = this.actions[name];
    if (!nextAction) {
      console.warn(`Cảnh báo: Không tìm thấy animation tên là "${name}" trong file GLB của char${this.charId}!`);
      return; 
    }
    if (this.currentAction === nextAction) return;

    nextAction.reset().fadeIn(duration).play();
    if (this.currentAction) {
      this.currentAction.fadeOut(duration);
    }
    this.currentAction = nextAction;
  }

  // =======================================================
  // 1. KỊCH BẢN CHÀO HỎI TỔNG HỢP CHO TỪNG NHÂN VẬT
  // =======================================================
  playIntroSequence() {
    if (!this.mascot) return;
    this.introTimeline = gsap.timeline();

    // Lựa chọn dáng đi ra tùy theo character
    let introWalkAction = "happy_walk";
    switch(this.charId) {
      case 1: introWalkAction = "happy_walk"; break;
      case 2: introWalkAction = "northern_soul_floor_spin"; break;
      case 3: introWalkAction = "catwalk_walk_forward"; break;
      case 4: introWalkAction = "push_up"; break;
      case 5: introWalkAction = "swagger_walk"; break;
    }

    this.fadeToAction(introWalkAction, 0.2); 

    // Bước 1: Bước dọc theo bức tường ra phía trước
    this.introTimeline.to(this.mascot.position, {
      x: this.peekPos.x,
      z: this.peekPos.z,
      duration: 1.5,
      ease: "power1.out",
      onComplete: () => {
        // Bước 2: Dừng lại, xoay mặt ra màn hình (camera) và làm hành động chào
        gsap.to(this.mascot.rotation, { y: -Math.PI / 4 + this.rotOffset, duration: 0.3 });
        
        // ---- PHÂN NHÁNH HÀNH ĐỘNG CHÀO THEO CHAR ID ----
        switch(this.charId) {
          case 1: this.fadeToAction("waving_gesture", 0.5); break;
          case 2: this.fadeToAction("waving", 0.5); break;
          case 3: 
            this.fadeToAction("catwalk_walk_stop_twist_L", 0.3);
            setTimeout(() => this.fadeToAction("blow_a_kiss", 0.3), 1500);
            break;
          case 4: 
            this.fadeToAction("push_up_to_idle", 0.3);
            setTimeout(() => this.fadeToAction("salute", 0.3), 1000);
            break;
          case 5: 
            this.fadeToAction("slide_hip_hop_dance", 0.3);
            setTimeout(() => this.fadeToAction("pointing_gesture", 0.3), 1500);
            break;
        }
      }
    })
    // Giữ màn chào hỏi trong 3 giây (tăng lên 3s vì các char 3, 4, 5 có combo dài)
    .to({}, { duration: 3.5 }) 
    .add(() => {
      // Bước 3: Chuyển sang đi bộ, xoay mặt hướng chéo ra góc ngoài
      this.fadeToAction(introWalkAction, 0.3);
      gsap.to(this.mascot.rotation, {
        y: Math.PI / 4 + this.rotOffset, 
        duration: 0.5
      });
    })
    // Bước 4: Di chuyển chéo ra vị trí chốt
    .to(this.mascot.position, {
      x: this.finalPos.x,
      y: this.finalPos.y,
      z: this.finalPos.z,
      duration: 1.5,
      ease: "power1.inOut",
      onComplete: () => {
        // Bước 5: Đến nơi, xoay mặt nhìn thẳng vào mắt người dùng và vào trạng thái chờ
        gsap.to(this.mascot.rotation, {
          y: -Math.PI / 4 + this.rotOffset, 
          duration: 0.5
        });
        this.setIdle();
      }
    });
  }

  // =======================================================
  // 2. TRẠNG THÁI CHỜ (IDLE)
  // =======================================================
  setIdle() {
    this.clearTimers();
    switch(this.charId) {
      case 1: this.fadeToAction("listening_to_music", 0.5); break;
      case 2: this.fadeToAction("slide_hip_hop_dance", 0.5); break;
      case 3: this.fadeToAction("rumba_dancing", 0.5); break;
      case 4: this.fadeToAction("jog_in_circle", 0.5); break;
      case 5: this.fadeToAction("salsa_dancing", 0.5); break;
      default: this.fadeToAction("listening_to_music", 0.5);
    }
  }

  // =======================================================
  // 3. TRẠNG THÁI SUY NGHĨ (THINKING)
  // =======================================================
  setThinking() {
    this.clearTimers();
    switch(this.charId) {
      case 1: 
        this.fadeToAction("thinking", 0.5); 
        break;
      case 2: 
        this.fadeToAction("thoughtful_head_nod", 0.5); 
        break;
      case 3: 
        this.fadeToAction("thinking", 0.5); 
        break;
      case 4: 
        this.fadeToAction("walk_in_circle", 0.5); 
        break;
      case 5: 
        // Char 5 có 2 bước: lắc đầu rồi mới focus
        this.fadeToAction("thoughtful_head_shake", 0.5);
        // Sau 1.5s chuyển sang focus
        this.actionTimer = setTimeout(() => { 
          if(this.currentAction === this.actions["thoughtful_head_shake"]) {
            this.fadeToAction("focus", 0.5); 
          }
        }, 1500);
        break;
    }
  }

  // =======================================================
  // 4. TRẠNG THÁI TRẢ LỜI (TALKING)
  // =======================================================
  setTalking() {
    // Tất cả các char đều dùng hoạt ảnh talking giống nhau
    this.clearTimers();
    this.fadeToAction("talking", 0.5);
  }

  // =======================================================
  // 5. TRẠNG THÁI CHỐT CÂU TRẢ LỜI (Đổi tên từ setClapping cho tổng quát)
  // =======================================================
  setFinishTalking() {
    this.clearTimers();
    switch(this.charId) {
      case 1: this.fadeToAction("clapping", 0.3); break;
      case 2: this.fadeToAction("clapping", 0.3); break;
      case 3: this.fadeToAction("clapping", 0.3); break;
      case 4: this.fadeToAction("hands_forward_gesture", 0.3); break;
      case 5: this.fadeToAction("pointing_gesture", 0.3); break;
    }
    
    // Tạo dáng chốt tầm 2.5 giây rồi tự động quay về trạng thái chờ
    this.actionTimer = setTimeout(() => {
      this.setIdle();
    }, 2500);
  }

  // Cập nhật frame (gọi trong hàm render loop của main.js)
  update(deltaTime) {
    if (this.mixer) {
      this.mixer.update(deltaTime);
    }

    if (this.faceCamera && this.camera && this.mascot) {
      const targetYaw = this.getCameraYaw() + this.yawOffset;
      const yawDifference = Math.atan2(
        Math.sin(targetYaw - this.mascot.rotation.y),
        Math.cos(targetYaw - this.mascot.rotation.y)
      );
      this.mascot.rotation.y += yawDifference * (1 - Math.exp(-8 * deltaTime));
    }
  }

  getCameraYaw() {
    this.camera.getWorldPosition(this.cameraWorldPosition);
    this.mascot.getWorldPosition(this.mascotWorldPosition);

    const deltaX = this.cameraWorldPosition.x - this.mascotWorldPosition.x;
    const deltaZ = this.cameraWorldPosition.z - this.mascotWorldPosition.z;

    return Math.atan2(deltaX, deltaZ);
  }

  openChat() {
    if (!this.mascot || !this.camera || this.chatPosition) return;
    
    // Hủy ngay kịch bản chào hỏi đang dở dang (nếu có)
    if (this.introTimeline) {
      this.introTimeline.kill();
      this.introTimeline = null;
    }
    // Dừng mọi chuyển động sai lệch
    gsap.killTweensOf(this.mascot.position);
    gsap.killTweensOf(this.mascot.rotation);

    // Trả thẳng về trạng thái chờ và quay mặt đúng chuẩn
    this.setIdle();
    gsap.to(this.mascot.rotation, {
      y: -Math.PI / 4 + this.rotOffset,
      duration: 0.5
    });

    // Gán cứng homePosition bằng finalPos thay vì vị trí lơ lửng
    this.homePosition = new THREE.Vector3(this.finalPos.x, this.finalPos.y, this.finalPos.z);
    
    const cameraRight = new THREE.Vector3(1, 0, 0)
      .applyQuaternion(this.camera.quaternion);
    cameraRight.y = 0;
    cameraRight.normalize();
    this.chatPosition = this.homePosition.clone()
      .addScaledVector(cameraRight, -3);
      
    gsap.to(this.mascot.position, {
      x: this.chatPosition.x,
      z: this.chatPosition.z,
      duration: 0.6,
      ease: "power2.out",
    });
  }
  closeChat() {
    if (!this.mascot || !this.homePosition) return;

    gsap.to(this.mascot.position, {
      x: this.homePosition.x,
      y: this.homePosition.y,
      z: this.homePosition.z,
      duration: 0.6,
      ease: "power2.out",
    });

    this.chatPosition = null;
  }
}