/** How full the credits bar is: credits used out of everything usable now (plan credits + extra pack credits left). */
export const creditMeterPercent = (creditsUsed: number, creditsTotal: number, topUpCredits = 0): number => {
  const capacity = creditsTotal + Math.max(0, topUpCredits);
  return capacity > 0 ? Math.min(100, Math.max(0, creditsUsed) / capacity * 100) : 0;
};

/** Arthur, Nov 21: the credits circle is FULL whenever you have at least your plan's credits (after a refill, or after
 *  buying a pack), and empties as you use them. Percent of the plan's credits you have left, 0-100. */
export const creditsLeftPercent = (creditsLeft: number, planCredits: number): number =>
  planCredits > 0 ? Math.min(100, Math.max(0, creditsLeft) / planCredits * 100) : 0;
