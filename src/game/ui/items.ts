// Names and one-line descriptions for the build menu (DESIGN §7.1). UI text only; numbers come from config.
import type { ItemKind } from '../../sim/types';

export const ITEM_NAMES: Record<ItemKind, string> = {
  outpost: 'Outpost',
  factory: 'Factory-mill',
  dock: 'Dock',
  carrier: 'Carrier',
  woodchopper: 'Woodchopper',
  bridge: 'Bridge',
  workshop: 'Workshop',
  catapult: 'Catapult',
};

export const ITEM_DESCRIPTIONS: Record<ItemKind, string> = {
  outpost: 'Claims territory around it',
  factory: 'Riverside. Turns wood into yours, speeds up crafting, adds a queue slot',
  dock: 'Riverside. Catches floating wood, feeds an adjacent factory-mill',
  carrier: 'Carries wood along its row, A → B, forever',
  woodchopper: 'On a forest hex. Cuts wood into a log stack',
  bridge: 'On water. Works once it connects two lands',
  workshop: 'Where upgrades are bought (upgrades come in M6)',
  catapult: 'Offensive machine (its behaviour comes in M5)',
};
