// Log stack icon stage (DESIGN §6.3): 0 = nothing, 1 = one log (1–4), 2 = two logs (5–14), 3 = pyramid (15+).
import { MILLI } from './fixed';
import type { Config } from './types';

export function stackStage(milliWood: number, config: Config): 0 | 1 | 2 | 3 {
  const wood = Math.floor(milliWood / MILLI);
  if (wood >= config.stackStages.stage3From) return 3;
  if (wood >= config.stackStages.stage2From) return 2;
  return wood >= 1 ? 1 : 0;
}
