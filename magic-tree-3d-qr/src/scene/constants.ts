/** One QR module = one world unit. */
export const CELL = 1;
/** Lá được xếp vào mỗi module tối khi mã được hiện ra (một lớp 3x2). */
export const LEAVES_PER_MODULE = 6;
/** Chiều cao của một khối module đã ổn định. Đồng đều để mọi mặt trên đều sáng đều nhau. */
export const MODULE_HEIGHT = 0.34;
/** Viền bổ sung bên ngoài vùng yên tĩnh nơi hàng rào sống, theo đơn vị module. */
export const HEDGE_RING = 2.4;

export const ISO_AZIMUTH = Math.PI / 4;
export const ISO_ELEVATION = 0.58;
export const TOP_ELEVATION = Math.PI / 2 - 0.0001;