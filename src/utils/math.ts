/**
 * Safely adds numbers to avoid standard JavaScript floating point calculation bugs.
 */
export const safeAdd = (...numbers: number[]): number => {
  return (
    numbers.reduce((sum, num) => sum + Math.round(num * 100), 0) / 100
  );
};

/**
 * Safely subtracts two numbers avoiding floating point issues.
 */
export const safeSubtract = (a: number, b: number): number => {
  return (Math.round(a * 100) - Math.round(b * 100)) / 100;
};

/**
 * Safely multiplies two numbers avoiding floating point issues.
 */
export const safeMultiply = (a: number, b: number): number => {
  return Math.round(Math.round(a * 100) * b) / 100;
};

/**
 * Rounds a number to exactly two decimal places.
 */
export const roundToTwoDecimals = (num: number): number => {
  return Math.round(num * 100) / 100;
};

/**
 * Distributes a total amount proportionally among a set of shares.
 * To ensure absolute integrity, any remainder cents (e.g. distributing 10.00 among 3 users is 3.33 each, with 0.01 left over)
 * are distributed one cent at a time to the members to guarantee the sum of splits equals the exact total.
 *
 * @param totalAmount The total amount to split (e.g. 10.00)
 * @param shares Array of ratios (e.g. [1, 1, 1] for equal split, [2, 1] for custom shares)
 * @returns Array of distributed split values summing to totalAmount
 */
export const distributeShares = (totalAmount: number, shares: number[]): number[] => {
  const totalShares = shares.reduce((sum, s) => sum + s, 0);
  if (totalShares === 0) return shares.map(() => 0);

  const totalCents = Math.round(totalAmount * 100);
  let distributedCents = 0;

  const resultCents = shares.map((share) => {
    const shareCents = Math.floor((totalCents * share) / totalShares);
    distributedCents += shareCents;
    return shareCents;
  });

  // Calculate left-over cents due to rounding
  let remainderCents = totalCents - distributedCents;

  // Distribute remainder cents to members (starting with the highest share indices)
  let index = 0;
  while (remainderCents > 0) {
    resultCents[index % resultCents.length] += 1;
    remainderCents -= 1;
    index += 1;
  }

  return resultCents.map((cents) => cents / 100);
};

export interface SimplifiedDebt {
  from: string;
  to: string;
  amount: number;
}

/**
 * Simplifies a list of net balances into the minimum number of peer-to-peer payments.
 *
 * @param netBalances Map of user IDs to their net balances (credits positive, debits negative)
 * @returns Array of simplified debt settlements
 */
export const simplifyDebts = (netBalances: Record<string, number>): SimplifiedDebt[] => {
  // Filter out users with zero balance
  const debtors = Object.keys(netBalances)
    .map((id) => ({ id, balance: netBalances[id] }))
    .filter((user) => user.balance < -0.01)
    .map((user) => ({ id: user.id, owes: -user.balance }));

  const creditors = Object.keys(netBalances)
    .map((id) => ({ id, balance: netBalances[id] }))
    .filter((user) => user.balance > 0.01)
    .map((user) => ({ id: user.id, owed: user.balance }));

  const settlements: SimplifiedDebt[] = [];

  let dIndex = 0;
  let cIndex = 0;

  // Greedy match debtors and creditors to minimize transactions
  while (dIndex < debtors.length && cIndex < creditors.length) {
    const debtor = debtors[dIndex];
    const creditor = creditors[cIndex];

    const amount = Math.min(debtor.owes, creditor.owed);

    if (amount > 0.01) {
      settlements.push({
        from: debtor.id,
        to: creditor.id,
        amount: roundToTwoDecimals(amount),
      });
    }

    debtor.owes = roundToTwoDecimals(debtor.owes - amount);
    creditor.owed = roundToTwoDecimals(creditor.owed - amount);

    if (debtor.owes <= 0.01) dIndex++;
    if (creditor.owed <= 0.01) cIndex++;
  }

  return settlements;
};

