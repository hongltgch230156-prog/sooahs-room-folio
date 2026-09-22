import { moduleToWorld, QUIET_ZONE, type QrMatrix } from './qr';
import { CELL, LEAVES_PER_MODULE, MODULE_HEIGHT } from './constants';

export interface LeafTarget {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
}

/**
 * Vị trí mà lá `index` rơi xuống khi tán cây đã lắng xuống thành mã.
 *
 * Lá được phân phối theo từng nhóm LEAVES_PER_MODULE, một nhóm cho mỗi module tối,
 * bố trí thành lưới phẳng 3x2 ở cùng một chiều cao đồng nhất. Giữ cho nhóm phẳng
 * và sáng đều là yếu tố khiến mỗi module được nhị phân hóa sạch cho máy quét.
 */
export function leafTarget(qr: QrMatrix, index: number): LeafTarget {
  const cell = qr.darkCells[Math.floor(index / LEAVES_PER_MODULE)];
  const slot = index % LEAVES_PER_MODULE;
  const gx = (slot % 3) - 1;
  const gz = Math.floor(slot / 3) - 0.5;

  const { x, z } = moduleToWorld(cell.x + QUIET_ZONE, cell.y + QUIET_ZONE, qr.plot, CELL);

  return {
    x: x + gx / 3,
    y: MODULE_HEIGHT / 2,
    z: z + gz / 2,
    // Lớn hơn một chút để các lá lân cận liền nhau mà không có khoảng trống nhìn thấy.
    sx: 0.38,
    sy: MODULE_HEIGHT,
    sz: 0.56,
  };
}

/** Total leaves needed to fill every dark module of `qr`. */
export const leafCountFor = (qr: QrMatrix) => qr.darkCells.length * LEAVES_PER_MODULE;