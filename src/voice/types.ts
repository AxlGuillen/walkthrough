export type Language = 'es' | 'en';

export interface Word {
  text: string;
  start: number;
  end: number;
}

export interface SpeechTiming {
  duration: number;
  words: readonly Word[];
}

export interface Speech extends SpeechTiming {
  audio: Buffer;
}

export interface SpeechRequest {
  text: string;
  language: Language;
  voice?: string;
}

export interface VoiceProvider {
  readonly id: string;
  // Used when a tour names no voice, so every narration keeps the same voice.
  readonly defaultVoice?: string;
  synthesize(request: SpeechRequest): Promise<Speech>;
}
