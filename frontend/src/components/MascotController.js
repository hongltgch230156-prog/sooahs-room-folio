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
    this.startPos = { x: 9.5, y: 0 , z: -1.5 }; // Nấp sau tường (bên phải)
    this.peekPos  = { x: 9.5, y: 0, z: -1.5 }; // Ngó đầu ra khỏi tường
    this.finalPos = { x: 9.5, y: 0, z: -1.5}; // Vị trí chốt ở góc dưới bên phải
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
    await this.loadCharacter(this.charId, position);
    this.setIdle();
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
          
          // 1. TẠO GROUP "VỎ BỌC" CHO MASCOT
          this.mascot = new THREE.Group(); 
          const model = glb.scene; 
          this.mascot.add(model); // Nhét mô hình vào vỏ bọc
          
          // 2. SET VỊ TRÍ, KÍCH THƯỚC CHO VỎ BỌC
          this.rotOffset = charId >= 3 ? Math.PI / 2 : 0;
          this.mascot.scale.setScalar(2.5);
          this.mascot.position.copy(position);
          this.mascot.rotation.y = -Math.PI / 4 + this.rotOffset;
          this.scene.add(this.mascot);
          
          // 3. GÁN ANIMATION VÀO MÔ HÌNH BÊN TRONG (Không gán vào vỏ bọc)
          this.mixer = new THREE.AnimationMixer(model);
          this.actions = {};
          this.currentAction = null;
          
          // 4. TRẢ LẠI CODE GỐC ĐỂ MASCOT DI CHUYỂN BÌNH THƯỜNG
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

    // Đưa mascot đến thẳng vị trí ngó ra ban đầu (peekPos) ngay từ đầu mà không cần đi bộ tới
    this.mascot.position.set(this.peekPos.x, this.peekPos.y, this.peekPos.z);
    this.mascot.rotation.y = -Math.PI / 4 + this.rotOffset;

    // Bước 1: Thực hiện hành động chào luôn tại chỗ tùy theo character
    this.introTimeline.add(() => {
      switch(this.charId) {
        case 1: this.fadeToAction("waving_gesture", 0.5); break;
        case 2: this.fadeToAction("waving", 0.5); break;
        case 3: this.fadeToAction("rumba_dancing", 0.3); break;
        case 4: 
          this.fadeToAction("push_up_to_idle", 0.3);
          setTimeout(() => this.fadeToAction("salute", 0.3), 1000);
          break;
        case 5: this.fadeToAction("slide_hip_hop_dance", 0.3); break;
      }
    })
    // Giữ màn chào hỏi trong 3.5 giây
    .to({}, { duration: 3.5 }) 
    .add(() => {
      // Bước 2: Xoay mặt hướng chéo ra góc ngoài trước khi di chuyển về vị trí chốt
      gsap.to(this.mascot.rotation, {
        y: Math.PI / 4 + this.rotOffset, 
        duration: 0.5
      });
      // Nếu muốn mascot đi bộ về vị trí chốt, bật lại animation đi bộ tương ứng
      let walkAction = "happy_walk";
      if (this.charId === 2) walkAction = "northern_soul_floor_spin";
      if (this.charId === 3) walkAction = "catwalk_walk_forward";
      if (this.charId === 4) walkAction = "push_up";
      this.fadeToAction(walkAction, 0.3);
    })
    // Bước 3: Di chuyển chéo ra vị trí chốt cuối cùng
    .to(this.mascot.position, {
      x: this.finalPos.x,
      y: this.finalPos.y,
      z: this.finalPos.z,
      duration: 1.5,
      ease: "power1.inOut",
      onComplete: () => {
        // Bước 4: Đến nơi, xoay mặt nhìn thẳng vào màn hình và vào trạng thái chờ
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
        this.fadeToAction("focus", 0.5); 
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
  // 5. TRẠNG THÁI CHỐT CÂU TRẢ LỜI
  // =======================================================
  setFinishTalking() {
    this.clearTimers();
    
    // Chỉ giữ lại động tác kết thúc cho Char 4
    if (this.charId === 4) {
      this.fadeToAction("hands_forward_gesture", 0.3);
      
      // Tạo dáng chốt tầm 2.5 giây rồi tự động quay về trạng thái chờ
      this.actionTimer = setTimeout(() => {
        this.setIdle();
      }, 2500);
    } else {
      // Các char khác (1, 2, 3, 5) sẽ quay trở về trạng thái Idle ngay lập tức
      this.setIdle();
    }
  }

  // Cập nhật frame (gọi trong hàm render loop của main.js)
  update(deltaTime) {
    if (this.mixer) {
      this.mixer.update(deltaTime);

      // === ÉP MỞ RỘNG BẮP TAY BẰNG CODE (CÓ PHÂN NHÁNH RIÊNG CHO CHAR 5) ===
      if (this.mascot) {
        const leftArm = this.mascot.getObjectByName("mixamorigLeftArm");
        const rightArm = this.mascot.getObjectByName("mixamorigRightArm");
        
        if (leftArm && rightArm) {
          if (this.charId === 5) {
            if (this.currentAction === this.actions["focus"]) {
              leftArm.rotation.z += 0.1; 
              rightArm.rotation.z -= 0.1;
            } else {
              // Còn với các trạng thái khác (Idle, Talking,...) thì dùng mức 0.6 và 0.3 bình thường
              leftArm.rotation.z += 0.6; 
              rightArm.rotation.z -= 0.6;
              leftArm.rotation.x -= 0.3;
              rightArm.rotation.x -= 0.3;
            }
          } else if (this.charId === 1 && this.currentAction === this.actions["waving_gesture"]) {
            leftArm.rotation.z += 1.0; 
            rightArm.rotation.z -= 1.0;
          } else {
            // Dành cho các Char từ 1 đến 4 (đã đang rất ổn với 0.5)
            leftArm.rotation.z += 0.5;
            rightArm.rotation.z -= 0.5;
          }
        }
      }
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