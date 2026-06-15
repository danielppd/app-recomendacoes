// Tipos espelhando os contratos reais do backend Bubble (bubble/app/api/*)

export type ItemType = "film" | "book" | "music" | "place";

export interface PackItem {
  id: string;
  title: string;
  creator: string;
  type: ItemType;
  coverUrl: string | null;
  connectionPhrase: string;
  similarityScore: number;
}

export interface Pack {
  title: string;
  mood: string;
  vibeDescription: string;
  items: PackItem[];
  savedId: string | null;
}

export interface Weather {
  temp: number;
  description: string;
  city: string;
  period: string; // manhã | tarde | noite | madrugada
}
