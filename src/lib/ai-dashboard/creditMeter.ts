/** How full the credits bar is: credits used out of everything usable now (plan credits + extra pack credits left). */
export const creditMeterPercent = (creditsUsed: number, creditsTotal: number, topUpCredits = 0): number => {
  const capacity = creditsTotal + Math.max(0, topUpCredits);
  return capacity > 0 ? Math.min(100, Math.max(0, creditsUsed) / capacity * 100) : 0;
};
