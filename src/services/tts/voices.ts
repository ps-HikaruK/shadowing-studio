export interface VoiceOption {
  id: string;
  /** 公式ドキュメント上の特徴 */
  trait: string;
  /** 想定用途(日本語) */
  note: string;
}

/** Gemini TTS の男性寄りプリビルト音声(README 3.2 の候補) */
export const MALE_VOICES: VoiceOption[] = [
  { id: "Iapetus", trait: "Clear", note: "明瞭さ重視" },
  { id: "Schedar", trait: "Even", note: "安定した会話調" },
  { id: "Umbriel", trait: "Easy-going", note: "柔らかい日常会話" },
  { id: "Algieba", trait: "Smooth", note: "なめらかな発話" },
  { id: "Charon", trait: "Informative", note: "明瞭で説明的" },
  { id: "Orus", trait: "Firm", note: "しっかりした声質" },
  { id: "Algenib", trait: "Gravelly", note: "ややハスキー" },
  { id: "Puck", trait: "Upbeat", note: "明るくカジュアル" },
  { id: "Enceladus", trait: "Breathy", note: "息の多い落ち着いた声" },
  { id: "Zubenelgenubi", trait: "Casual", note: "カジュアル" },
  { id: "Sadaltager", trait: "Knowledgeable", note: "落ち着いた説明調" },
  { id: "Alnilam", trait: "Firm", note: "力強い" },
  { id: "Rasalgethi", trait: "Informative", note: "説明的" },
  { id: "Achird", trait: "Friendly", note: "親しみやすい" },
  { id: "Gacrux", trait: "Mature", note: "成熟した声" },
  { id: "Fenrir", trait: "Excitable", note: "エネルギッシュ" },
];

/** Phase 0 (2026-09-03) の A/B テストで決定。予備は Iapetus */
export const DEFAULT_VOICE = "Schedar";
export const BACKUP_VOICE = "Iapetus";

export const TTS_MODELS = [
  { id: "gemini-2.5-flash-preview-tts", label: "Gemini 2.5 Flash TTS (低コスト)" },
  { id: "gemini-3.1-flash-tts-preview", label: "Gemini 3.1 Flash TTS Preview (高品質)" },
  { id: "gemini-2.5-pro-preview-tts", label: "Gemini 2.5 Pro TTS" },
] as const;

export const DEFAULT_MODEL = TTS_MODELS[0].id;

/** 試聴用の定型文(Phase 0 の音声比較にも使う) */
export const PREVIEW_SENTENCES = [
  "Hey, sorry I'm late. The train was packed this morning, and I couldn't get on the first one.",
  "Honestly, I've been meaning to try that place for a while. Wanna grab lunch there sometime this week?",
  "I get what you're saying, but I'm not sure that's gonna work for everyone on the team.",
];
