/**
 * Financial utility functions for deterministic calculation of application metrics.
 * Extracted from UI components for testability.
 */

import { safeAdd, safeMultiply, safeSubtract, roundToTwoDecimals } from "./math";

/**
 * Calculates a percentage-based split of a total amount among a map of user percentages.
 * Similar to distributeShares, ensures the exact total is reached without floating point errors.
 * 
 * @param totalAmount The total expense amount
 * @param percentagesMap Map of user ID to percentage (e.g. { "userA": 40, "userB": 60 })
 * @returns Map of user ID to calculated amount
 */
export const calculatePercentageSplit = (
  totalAmount: number,
  percentagesMap: Record<string, number>
): Record<string, number> => {
  const result: Record<string, number> = {};
  
  // Validate total is exactly 100
  const totalPct = Object.values(percentagesMap).reduce((sum, pct) => safeAdd(sum, pct), 0);
  
  if (totalAmount === 0 || totalPct === 0) {
    Object.keys(percentagesMap).forEach(id => result[id] = 0);
    return result;
  }

  const totalCents = Math.round(totalAmount * 100);
  let distributedCents = 0;
  
  // Calculate proportional shares in cents
  const ids = Object.keys(percentagesMap);
  ids.forEach(id => {
    const pct = percentagesMap[id];
    const shareCents = Math.floor((totalCents * pct) / 100);
    distributedCents += shareCents;
    result[id] = shareCents;
  });

  // Distribute remaining cents starting with whoever had the largest percentage
  let remainderCents = totalCents - distributedCents;
  
  // Sort ids by percentage descending to fairly distribute remainder cents
  const sortedIds = [...ids].sort((a, b) => percentagesMap[b] - percentagesMap[a]);
  
  let index = 0;
  while (remainderCents > 0) {
    result[sortedIds[index % sortedIds.length]] += 1;
    remainderCents -= 1;
    index += 1;
  }

  // Convert back to dollars/rupees
  ids.forEach(id => {
    result[id] = result[id] / 100;
  });

  return result;
};

export interface BudgetMetrics {
  remainingBudget: number;
  isExceeded: boolean;
  usagePercentage: number;
  targetDailyLimit: number;
  recommendedDailySpent: number;
  showWarning: boolean;
  warningText: string;
}

/**
 * Calculates monthly budget metrics based on spending and limits.
 */
export const calculateBudgetMetrics = (
  totalSpent: number,
  budgetLimit: number,
  daysInMonth: number,
  remainingDays: number
): BudgetMetrics => {
  const remainingBudget = Math.max(0, safeSubtract(budgetLimit, totalSpent));
  const isExceeded = totalSpent > budgetLimit;
  const usagePercentage = budgetLimit > 0 ? (totalSpent / budgetLimit) * 100 : 0;
  
  const targetDailyLimit = budgetLimit > 0 ? budgetLimit / daysInMonth : 0;
  // If no days remaining (last day), assume 1 to avoid division by zero
  const divisor = Math.max(1, remainingDays);
  const recommendedDailySpent = remainingBudget / divisor;
  
  const showWarning = usagePercentage >= 80 && budgetLimit > 0;
  
  let warningText = `You have used ${usagePercentage.toFixed(0)}% of your monthly budget limit.`;
  if (isExceeded) {
    warningText = `Warning: Monthly budget limit exceeded by ₹${safeSubtract(totalSpent, budgetLimit).toFixed(2)}!`;
  } else if (usagePercentage >= 90) {
    warningText = `Critical: You have used ${usagePercentage.toFixed(0)}% of your monthly budget!`;
  } else if (usagePercentage >= 80) {
    warningText = `Caution: Budget usage is currently at ${usagePercentage.toFixed(0)}%!`;
  }

  return {
    remainingBudget: roundToTwoDecimals(remainingBudget),
    isExceeded,
    usagePercentage: roundToTwoDecimals(usagePercentage),
    targetDailyLimit: roundToTwoDecimals(targetDailyLimit),
    recommendedDailySpent: roundToTwoDecimals(recommendedDailySpent),
    showWarning,
    warningText
  };
};

export interface TiffinLog {
  id: string;
  date: string;
  is_present: boolean;
}

/**
 * Calculates the total tiffin bill for a month based on logs.
 */
export const calculateTiffinBill = (logs: TiffinLog[], ratePerTiffin: number): number => {
  const totalTiffins = logs.filter(log => log.is_present).length;
  return safeMultiply(totalTiffins, ratePerTiffin);
};
export interface Expense {
  id: string;
  amount: number;
  paid_by: string;
  group_id: string;
}

export interface Split {
  expense_id: string;
  user_id: string;
  amount: number;
}

/**
 * Calculates net balances for all users in a group given a set of expenses and splits.
 * Positive balance means they are owed money (creditor).
 * Negative balance means they owe money (debtor).
 */
export const calculateNetBalances = (
  expenses: Expense[],
  splits: Split[]
): Record<string, number> => {
  const balances: Record<string, number> = {};
  
  // Process what people paid (credits)
  expenses.forEach(exp => {
    if (!balances[exp.paid_by]) balances[exp.paid_by] = 0;
    balances[exp.paid_by] = safeAdd(balances[exp.paid_by], exp.amount);
  });
  
  // Process what people owe (debits)
  splits.forEach(split => {
    if (!balances[split.user_id]) balances[split.user_id] = 0;
    balances[split.user_id] = safeSubtract(balances[split.user_id], split.amount);
  });
  
  return balances;
};
