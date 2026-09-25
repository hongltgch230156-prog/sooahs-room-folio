import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MagicTreeScene, type ViewMode } from './scene';
import {
  SEASONS,
  SEASON_ORDER,
  BLOSSOM_SWATCHES,
  type SeasonId,
  type BlossomId,
  type Palette,
} from './scene/palette';
import { SPECIES, SPECIES_ORDER, type SpeciesId } from './scene/species';
import { Ambience } from './audio/ambience';
import {
  SpringIcon,
  SummerIcon,
  AutumnIcon,
  ShareIcon,
  InfoIcon,
  SoundOnIcon,
  SoundOffIcon,
  BrandMark,
  OakIcon,
  PineIcon,
  WillowIcon,
  BirchIcon,
} from './ui/icons';

const DEFAULT_URL = 'https://example.com';
const MEME_KEYWORDS = [
  'trứng bắc thảo xanh meme',
  've tró',
  'trứng bắc thảo xanh lá',
  'trứng bắc thảo giận',
  'trứng bắc thảo vui',
  'trứng bắc thảo slay',
];
const MEME_DIRECT_IMAGES = [
  'https://images.unsplash.com/photo-1517849845537-4d257902454a?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1537151625747-768eb6cf92b9?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1574158622682-e40e69881006?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1519052537078-e6302a4968d4?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1526336024174-e58f5cdd8e13?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1504593811423-6dd665756598?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1517849845537-4d257902454a?auto=format&fit=crop&w=1200&q=80',
];

const buildMemeSearchUrl = (keyword: string) => {
  const q = encodeURIComponent(keyword.trim() || 'meme 2026');
  const candidates = [
    `https://www.pinterest.com/search/pins/?q=${q}`,
    `https://www.threads.com/search?query=${q}`,
    `https://www.google.com/search?q=${q}&tbm=isch`,
  ];
  return candidates[Math.floor(Math.random() * candidates.length)] ?? candidates[0];
};

const pickMemeImage = (keyword: string) => {
  const base = keyword.trim() || MEME_KEYWORDS[0] || 'meme 2026';
  const pick = Math.abs(Array.from(base).reduce((sum, char) => sum + char.charCodeAt(0), 0)) % MEME_DIRECT_IMAGES.length;
  return MEME_DIRECT_IMAGES[pick] ?? DEFAULT_URL;
};
const SEASON_ICONS: Record<SeasonId, () => React.ReactElement> = {
  spring: SpringIcon,
  summer: SummerIcon,
  autumn: AutumnIcon,
};
const SPECIES_ICONS: Record<SpeciesId, () => React.ReactElement> = {
  oak: OakIcon,
  pine: PineIcon,
  willow: WillowIcon,
  birch: BirchIcon,
};

/** Tạm dừng việc tái tạo lại cây để tránh chạy quá nhiều mỗi lần gõ phím. */
const REBUILD_DELAY = 500;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<MagicTreeScene | null>(null);
  const ambienceRef = useRef<Ambience | null>(null);

  const [draft, setDraft] = useState('');
  const [committed, setCommitted] = useState(() => pickMemeImage(MEME_KEYWORDS[0] ?? 'meme 2026'));
  const [season, setSeason] = useState<SeasonId>('summer');
  const [species, setSpecies] = useState<SpeciesId>('oak');
  const [blossom, setBlossom] = useState<BlossomId>('blush');
  const [mode, setMode] = useState<ViewMode>('tree');
  const [muted, setMuted] = useState(true);
  const [showInfo, setShowInfo] = useState(true);
  const [memeMode, setMemeMode] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const palette = useMemo<Palette>(() => {
    const base = SEASONS[season];
    if (season !== 'spring') return base;
    const swatch = BLOSSOM_SWATCHES.find((s) => s.id === blossom) ?? BLOSSOM_SWATCHES[0];
    return { ...base, leaf: [...swatch.leaf], qrLeaf: [...swatch.qr] };
  }, [season, blossom]);

  // ---- scene lifecycle ---------------------------------------------------

  useEffect(() => {
    if (!canvasRef.current) return;
    const scene = new MagicTreeScene(canvasRef.current, committed, palette, SPECIES[species]);
    sceneRef.current = scene;

    const onResize = () => scene.resize();
    window.addEventListener('orientationchange', onResize);
    // Theo dõi canvas để bắt mọi thay đổi kích thước, kể cả những thay đổi
    // không kích hoạt sự kiện resize trên window — tab nền được khôi phục,
    // bố cục container thay đổi, hoặc canvas quay lại trạng thái kích thước bằng 0.
    const ro = new ResizeObserver(onResize);
    ro.observe(canvasRef.current);

    return () => {
      window.removeEventListener('orientationchange', onResize);
      ro.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
    // Tạo một lần; văn bản và bảng màu được đẩy trực tiếp bên dưới.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sceneRef.current?.setPalette(palette);
  }, [palette]);

  useEffect(() => {
    sceneRef.current?.setText(committed);
  }, [committed]);

  useEffect(() => {
    sceneRef.current?.setMode(mode);
  }, [mode]);

  useEffect(() => {
    sceneRef.current?.setSpecies(species);
  }, [species]);

  // Báo cáo chiều cao thực tế của dock để mã không bao giờ bị khung bên dưới nó.
  useEffect(() => {
    const el = dockRef.current;
    if (!el) return;
    const report = () => sceneRef.current?.setDockHeight(el.getBoundingClientRect().height);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const randomMemeUrl = useCallback(() => {
    const keyword = MEME_KEYWORDS[Math.floor(Math.random() * MEME_KEYWORDS.length)] ?? 'trứng bắc thảo xanh meme';
    return pickMemeImage(keyword);
  }, []);

  const canUseMemeMode = !draft.trim();

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (memeMode && canUseMemeMode) {
        setCommitted(randomMemeUrl());
        return;
      }
      if (draft.trim()) {
        setCommitted(draft.trim());
        return;
      }
      setCommitted(randomMemeUrl());
    }, REBUILD_DELAY);
    return () => window.clearTimeout(t);
  }, [draft, memeMode, canUseMemeMode, randomMemeUrl]);

  useEffect(() => {
    ambienceRef.current = new Ambience();
    return () => ambienceRef.current?.dispose();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  // ---- interactions ----------------------

  const toggleMode = useCallback(() => {
    setMode((m) => {
      const next: ViewMode = m === 'tree' ? 'code' : 'tree';
      if (next === 'code') ambienceRef.current?.chord();
      return next;
    });
  }, []);

  const toggleSound = useCallback(() => {
    const on = ambienceRef.current?.toggle() ?? false;
    setMuted(!on);
  }, []);

  const share = useCallback(async () => {
    const url = committed;
    const payload = {
      title: 'Magic Tree',
      text: 'A tree that is also a scannable QR code.',
      url,
    };
    try {
      if (navigator.share) {
        await navigator.share(payload);
        return;
      }
      await navigator.clipboard.writeText(url);
      setToast('Link copied');
    } catch (err) {
      // Một sheet chia sẻ bị hủy không phải là lỗi đáng hiển thị.
      if ((err as Error)?.name !== 'AbortError') setToast('Could not share');
    }
  }, [committed]);

  const onCanvasKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleMode();
    }
  };

  const hint = mode === 'tree' ? 'Tap the tree to see the QR code' : 'Tap to see the tree';

  const onDraftChange = (value: string) => {
    setDraft(value);
    if (value.trim()) setMemeMode(false);
  };

  const handleMemeModeToggle = () => {
    if (!canUseMemeMode) return;

    const keyword = MEME_KEYWORDS[Math.floor(Math.random() * MEME_KEYWORDS.length)] ?? 'trứng bắc thảo xanh meme';
    const imageUrl = pickMemeImage(keyword);
    const searchUrl = buildMemeSearchUrl(keyword);

    window.open(searchUrl, '_blank', 'noopener,noreferrer');
    setCommitted(imageUrl);
    setMemeMode((v) => !v);
  };

  return (
    <div className="stage" style={{ background: palette.ground }}>
      <a className="brand" href="/" aria-label="Magic Tree home">
        <BrandMark />
        <span className="brand__text">
          <span className="brand__name">Magic Tree</span>
          <span className="brand__tag">3D QR</span>
        </span>
      </a>

      <div className="info">
        <button
          className="info__btn"
          type="button"
          aria-expanded={showInfo}
          aria-label="About this project"
          onClick={() => setShowInfo((v) => !v)}
        >
          <InfoIcon />
        </button>
        {showInfo && (
          <div className="info__card" role="dialog" aria-label="About Magic Tree">
            <p>
              <strong>1. Scan the tree.</strong> The ground is secretly a QR code. 
              Yes, the tree is hiding it.
            </p>
            <p>
              <strong>2. Watch it grow.</strong> Scan the code and let the leaves 
              fall into place, one by one.
            </p>
            <p>
              <strong>3. Enjoy the magic.</strong> Built with React & three.js. 
              No watering required. 🌳
            </p>
          </div>
        )}
      </div>

      <canvas
        ref={canvasRef}
        className="stage__canvas"
        role="button"
        tabIndex={0}
        aria-label={hint}
        onClick={toggleMode}
        onKeyDown={onCanvasKey}
      />

      <div className="dock" ref={dockRef}>
        <div className="dock__toast-anchor">
          {toast && <div className="toast">{toast}</div>}
          <button className="hint" type="button" onClick={toggleMode}>
            {hint}
          </button>
        </div>

        <div className="field">
          <input
            className="field__input"
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            placeholder="Nhập link của bạn..."
            aria-label="Link to encode"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
          <button
            type="button"
            className={`field__mode ${memeMode ? 'field__mode--active' : ''}`}
            aria-pressed={memeMode}
            disabled={!canUseMemeMode}
            onClick={handleMemeModeToggle}
          >
            <span className="field__mode-label">Meme Mode</span>
          </button>
          <button
            className="field__action"
            type="button"
            onClick={share}
            aria-label="Share this tree"
          >
            <ShareIcon />
          </button>
        </div>

        <div className="field__status">
          Leave empty for a random surprise🤫👀
        </div>

        <div className="trees">
          {SPECIES_ORDER.map((id) => {
            const Icon = SPECIES_ICONS[id];
            return (
              <button
                key={id}
                className="tree"
                type="button"
                title={SPECIES[id].label}
                aria-pressed={species === id}
                onClick={() => setSpecies(id)}
              >
                <Icon />
                <span className="tree__label">{SPECIES[id].label}</span>
              </button>
            );
          })}
        </div>

        <div className="seasons">
          {SEASON_ORDER.map((id) => {
            const Icon = SEASON_ICONS[id];
            return (
              <button
                key={id}
                className="season"
                type="button"
                aria-pressed={season === id}
                onClick={() => setSeason(id)}
              >
                <Icon />
                <span className="season__label">{SEASONS[id].label}</span>
              </button>
            );
          })}
          <button
            className="mute"
            type="button"
            aria-pressed={!muted}
            aria-label={muted ? 'Turn ambience on' : 'Turn ambience off'}
            onClick={toggleSound}
          >
            {muted ? <SoundOffIcon /> : <SoundOnIcon />}
          </button>
        </div>

        <div className="blossoms">
          {season === 'spring' &&
            BLOSSOM_SWATCHES.map((s) => (
              <button
                key={s.id}
                className="blossom"
                type="button"
                aria-pressed={blossom === s.id}
                aria-label={`${s.label} blossom`}
                style={{ background: s.leaf[0] }}
                onClick={() => setBlossom(s.id)}
              />
            ))}
        </div>
      </div>
    </div>
  );
}