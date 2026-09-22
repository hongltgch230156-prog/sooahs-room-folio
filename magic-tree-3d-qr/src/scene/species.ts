export type SpeciesId = 'oak' | 'pine' | 'willow' | 'birch';

export interface Species {
  id: SpeciesId;
  label: string;
  /** Chiều cao tán cây theo bội số độ rộng plot. */
  heightFactor: number;
  /** Chiều dài thân theo phần trăm chiều cao tổng. */
  trunkFraction: number;
  trunkRadius: number;
  maxDepth: number;
  /** Xác suất một nút tạo ra nhánh thứ ba thay vì hai. */
  forkChance: number;
  /** Góc tỏa nhánh khỏi nhánh cha, tính bằng radian. */
  spread: [number, number];
  /** Mỗi thế hệ ngắn đi bao nhiêu. */
  lengthDecay: [number, number];
  radiusDecay: number;
  /** Độ dốc hướng dọc của nhánh, thấp ở thân và cao ở tán. */
  upBiasLow: number;
  upBiasHigh: number;
  /** Cây kim giữ một trụ trung tâm chạy thẳng lên đỉnh. */
  leader: boolean;
  /** Lá chỉ treo trên các nhánh đủ sâu. */
  leafFromDepth: number;
  /** Vị trí lá trên một nhánh theo tỷ lệ chiều dài. */
  leafAlong: [number, number];
  /** Bán kính cụm lá quanh mỗi đầu nhánh. */
  cluster: [number, number];
  /** Nén dọc (<1) hoặc kéo dài (>1) các cụm lá. */
  clusterYScale: number;
  leafSize: [number, number];
  /** Thu hẹp tán cây về phía trên: 0 là cột, 1 là hình nón. */
  taper: number;
  bark?: { bark: string; barkDark: string };
}

export const SPECIES: Record<SpeciesId, Species> = {
  oak: {
    id: 'oak',
    label: 'Oak',
    heightFactor: 0.86,
    trunkFraction: 0.23,
    trunkRadius: 0.033,
    maxDepth: 7,
    forkChance: 0.28,
    spread: [0.75, 1.25],
    lengthDecay: [0.72, 0.85],
    radiusDecay: 0.68,
    upBiasLow: 0.28,
    upBiasHigh: -0.08,
    leader: false,
    leafFromDepth: 3,
    leafAlong: [0.35, 1],
    cluster: [0.6, 1.7],
    clusterYScale: 0.62,
    leafSize: [0.62, 1.1],
    taper: 0.15,
  },
  pine: {
    id: 'pine',
    label: 'Pine',
    heightFactor: 0.92,
    trunkFraction: 0.2,
    trunkRadius: 0.026,
    maxDepth: 5,
    forkChance: 0.75,
    spread: [1.05, 1.4],
    lengthDecay: [0.6, 0.74],
    radiusDecay: 0.6,
    upBiasLow: -0.12,
    upBiasHigh: -0.32,
    leader: true,
    leafFromDepth: 2,
    leafAlong: [0.08, 1],
    cluster: [0.68, 1.5], // [SỬA] 0.55,1.2 → 0.68,1.5
    clusterYScale: 0.6,
    leafSize: [0.56, 1.0], // [SỬA] 0.45,0.82 → 0.56,1.0
    taper: 0.35,
    bark: { bark: '#6b5340', barkDark: '#46362a' },
  },
  willow: {
    id: 'willow',
    label: 'Willow',
    heightFactor: 0.74,
    trunkFraction: 0.3,
    trunkRadius: 0.032,
    maxDepth: 7,
    forkChance: 0.3,
    spread: [0.62, 1.05],
    lengthDecay: [0.72, 0.84],
    radiusDecay: 0.66,
    upBiasLow: 0.06,
    upBiasHigh: -1.05,
    leader: false,
    leafFromDepth: 3,
    leafAlong: [0.3, 1],
    cluster: [0.52, 1.3], // [SỬA] 0.42,1.05 → 0.52,1.3
    clusterYScale: 2.1,
    leafSize: [0.55, 1.02], // [SỬA] 0.44,0.85 → 0.55,1.02
    taper: 0.08,
  },
  birch: {
    id: 'birch',
    label: 'Birch',
    heightFactor: 0.86,
    trunkFraction: 0.26,
    trunkRadius: 0.022,
    maxDepth: 6,
    forkChance: 0.24,
    spread: [0.5, 0.92],
    lengthDecay: [0.72, 0.85],
    radiusDecay: 0.66,
    upBiasLow: 0.4,
    upBiasHigh: 0.1,
    leader: false,
    leafFromDepth: 2,
    leafAlong: [0.35, 1],
    cluster: [0.62, 1.5], // [SỬA] 0.5,1.2 → 0.62,1.5
    clusterYScale: 0.85,
    leafSize: [0.62, 1.08], // [SỬA] 0.5,0.92 → 0.62,1.08
    taper: 0.45,
    bark: { bark: '#ddd7cb', barkDark: '#9c9386' },
  },
};

export const SPECIES_ORDER: SpeciesId[] = ['oak', 'pine', 'willow', 'birch'];