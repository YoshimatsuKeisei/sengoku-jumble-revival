import type { PostBattleSnapshot } from "./postBattleState";

export type PostBattleScreen = "battle_result" | "merit_list" | "enemy_list" | "enemy_detail";
export type PostBattleRouteTarget = PostBattleScreen | "map";
export type PostBattleRouteMode = "requested_full_flow" | "swf_defeat_to_map";

export const POST_BATTLE_ROUTE_MODE: PostBattleRouteMode = "requested_full_flow";

export function routeAfterBattleResult(
  snapshot: Pick<PostBattleSnapshot, "battleResult">,
  mode: PostBattleRouteMode = POST_BATTLE_ROUTE_MODE,
): PostBattleRouteTarget {
  if (mode === "swf_defeat_to_map" && snapshot.battleResult === "DEFEAT") return "map";
  return "merit_list";
}

export function routeAfterMeritList(): PostBattleRouteTarget {
  return "enemy_list";
}
