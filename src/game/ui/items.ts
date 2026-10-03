// Names and one-line descriptions for the build menu (DESIGN §7.1). UI text only; numbers come from config.
import type { ItemKind } from '../../sim/types';

export const ITEM_NAMES: Record<ItemKind, string> = {
  outpost: 'Outpost',
  factory: 'Factory-mill',
  dock: 'Dock',
  carrier: 'Carrier',
  woodchopper: 'Woodchopper',
  bridge: 'Bridge',
  dam: 'Dam',
  workshop: 'Workshop',
  catapult: 'Catapult',
  forestGuard: 'Forest guard',
  stoneCutter: 'Stone cutter',
  excavator: 'Excavator',
};

export const ITEM_DESCRIPTIONS: Record<ItemKind, string> = {
  outpost: 'Claims territory around it',
  factory: 'Riverside. Turns wood into yours, speeds up crafting, adds a queue slot',
  dock: 'Riverside. Catches floating wood, feeds an adjacent factory-mill',
  carrier: 'Carries wood along its row, A → B, forever',
  woodchopper: 'On a forest hex. Cuts wood into a log stack',
  bridge: 'On water. Works once it connects two lands',
  dam: 'On a river. Stops floating wood; on a fork, sends it down the other branch',
  workshop: 'Researches upgrades (Workshop tab); more workshops research faster',
  catapult: 'Drives to the closest enemy in a conflict zone and fires at it',
  forestGuard: 'Walks the hexes around it, replanting spent forests',
  stoneCutter: 'On a rock. Breaks it in 5 min for 1 stone (several add up)',
  excavator: 'On empty land. Digs it in 3 min so water can flow there',
};
