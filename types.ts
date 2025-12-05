export interface WordCard {
  word: string;
  phonetic: string;
  meaning: string;
  options: string[]; // 4 choices
  mnemonic: string;
  sentence: string;
  sentenceTranslation: string;
}

export enum AppStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  QUIZ = 'QUIZ',
  REVIEW = 'REVIEW', // Showing result after answer
  MISTAKES = 'MISTAKES'
}

export interface MistakeRecord extends WordCard {
  timestamp: number;
  consecutiveCorrect: number; // 0 to 3. At 3, it stops appearing.
}