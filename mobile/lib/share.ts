// Compartilhamento nativo via API Share do React Native (sem pacote extra).
import { Share } from "react-native";
import { typeMeta } from "../constants/theme";
import type { Pack } from "../types";

export function buildShareMessage(pack: Pack): string {
  const lines = pack.items.map((it) => {
    const label = typeMeta[it.type]?.label ?? it.type;
    const who = it.creator ? ` — ${it.creator}` : "";
    return `• ${label}: ${it.title}${who}`;
  });
  return [
    `🫧 ${pack.title}`,
    "",
    ...lines,
    "",
    "Gerado no Bubble — descubra cultura conectada pelo seu gosto.",
  ].join("\n");
}

export async function sharePack(pack: Pack): Promise<void> {
  await Share.share({
    title: pack.title,
    message: buildShareMessage(pack),
  });
}
