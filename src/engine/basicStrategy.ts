import table from "../basicStrategy.json";

export type AdviceAction = "H" | "S" | "D" | "Ds" | "P" | "R";

export type HandKind = "hard" | "soft" | "pair";

export function getAdvice(opts: {
  kind: HandKind;
  // total for hard/soft; for pair use pairRank (2..11 where 11=Ace)
  total?: number;
  pairRank?: number;
  dealerUpcard: number; // 2..11 (11 = Ace)
  allowSurrender?: boolean;
}): { action: AdviceAction; label: string } {
  const up = String(opts.dealerUpcard);
  let action: AdviceAction = "H";

  if (opts.kind === "pair") {
    const r = String(opts.pairRank ?? 0);
    action = (table as any).pairs?.[r]?.[up] ?? "H";
  } else if (opts.kind === "soft") {
    const t = String(opts.total ?? 0);
    action = (table as any).soft?.[t]?.[up] ?? "H";
  } else {
    const t = String(opts.total ?? 0);
    action = (table as any).hard?.[t]?.[up] ?? "H";
  }

  if (action === "R" && opts.allowSurrender === false) {
    // fallback when surrender not allowed:
    // common fallback: 15/16 vs 10/A => hit, vs 9 sometimes hit; keeping simple:
    action = "H";
  }

  const label =
    action === "H" ? "Hit" :
    action === "S" ? "Stand" :
    action === "D" ? "Double (otherwise Hit)" :
    action === "Ds" ? "Double (otherwise Stand)" :
    action === "P" ? "Split" :
    "Surrender (otherwise Hit)";

  return { action, label };
}
