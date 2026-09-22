import QRCode from 'qrcode';

/** Các module đệm sáng được giữ trống ở mọi phía để máy quét có thể bắt được mã. */
export const QUIET_ZONE = 4;

export interface QrMatrix {
  /** Chiều rộng/chiều cao của ma trận payload, không tính vùng yên tĩnh. */
  size: number;
  /** Mảng boolean size*size theo hàng (row-major). true = module tối. */
  dark: boolean[];
  /** Các ô thuộc mẫu finder hoặc alignment pattern; giữ nguyên về cấu trúc. */
  reserved: boolean[];
  darkCells: Array<{ x: number; y: number }>;
  /** Chiều rộng đầy đủ của plot theo module, bao gồm vùng yên tĩnh ở cả hai bên. */
  plot: number;
  text: string;
}

const isFinder = (x: number, y: number, size: number) => {
  const inBox = (bx: number, by: number) => x >= bx && x < bx + 7 && y >= by && y < by + 7;
  return inBox(0, 0) || inBox(size - 7, 0) || inBox(0, size - 7);
};

/**
 * Mã hóa `text` với mức sửa lỗi H. Độ dư thừa cao là yếu tố cho phép
 * tán cây nằm trên plot mà không làm hỏng quá trình quét.
 */
export function buildQr(text: string): QrMatrix {
  const qr = QRCode.create(text || ' ', { errorCorrectionLevel: 'H' });
  const size = qr.modules.size;
  const data = qr.modules.data;

  const dark: boolean[] = new Array(size * size);
  const reserved: boolean[] = new Array(size * size);
  const darkCells: Array<{ x: number; y: number }> = [];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const on = !!data[i];
      dark[i] = on;
      reserved[i] = isFinder(x, y, size);
      if (on) darkCells.push({ x, y });
    }
  }

  return { size, dark, reserved, darkCells, plot: size + QUIET_ZONE * 2, text };
}

/** Tâm của một module trong không gian thế giới, với plot được căn giữa tại gốc tọa độ. */
export function moduleToWorld(x: number, y: number, size: number, cell: number) {
  const half = (size * cell) / 2;
  return {
    x: x * cell - half + cell / 2,
    z: y * cell - half + cell / 2,
  };
}