// Factory intake (DESIGN §6.7): wood reaching a factory becomes its owner's, added to one shared wood count.
// Neutral factories (wood piles up outside) come with M5.
import type { GameState, Structure } from '../types';

export function deliverToFactory(state: GameState, factory: Structure, amount: number): void {
  state.players[factory.owner]!.wood += amount;
}
