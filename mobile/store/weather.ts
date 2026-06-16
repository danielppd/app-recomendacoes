// Cache do último clima conhecido, para a notificação diária poder citar o
// contexto mesmo a partir do Perfil (onde não rodamos o GPS de novo).
import type { Weather } from "../types";

let last: Weather | null = null;

export function setLastWeather(w: Weather | null) {
  last = w;
}

export function getLastWeather(): Weather | null {
  return last;
}
