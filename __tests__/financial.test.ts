import {
  calculatePercentageSplit,
  calculateBudgetMetrics,
  calculateTiffinBill,
  calculateWaterBill,
  calculateNetBalances
} from '../src/utils/financial';
import { safeAdd } from '../src/utils/math';

describe('financial.ts (Domain Calculations)', () => {

  describe('calculatePercentageSplit', () => {
    it('calculates 50/50 split correctly', () => {
      const result = calculatePercentageSplit(100.00, {
        'userA': 50,
        'userB': 50
      });
      expect(result).toEqual({ 'userA': 50.00, 'userB': 50.00 });
    });

    it('handles rounding remainders properly to ensure sum equals total', () => {
      // 10 split 33.33% each - remainder needs to go to largest pct (they are equal here, so order-based)
      const result = calculatePercentageSplit(10.00, {
        'userA': 33.34,
        'userB': 33.33,
        'userC': 33.33
      });
      // 10 * 0.3334 = 3.334 => 3.33
      // 10 * 0.3333 = 3.333 => 3.33
      // 3.33 * 3 = 9.99, remainder 0.01 goes to userA (largest pct)
      expect(result).toEqual({ 'userA': 3.34, 'userB': 3.33, 'userC': 3.33 });
      
      const sum = Object.values(result).reduce((a, b) => safeAdd(a, b), 0);
      expect(sum).toBe(10.00);
    });

    it('handles zero total correctly', () => {
      const result = calculatePercentageSplit(0, { 'A': 50, 'B': 50 });
      expect(result).toEqual({ 'A': 0, 'B': 0 });
    });
  });

  describe('calculateNetBalances', () => {
    it('calculates net balances for a group', () => {
      const expenses = [
        { id: 'e1', amount: 300, paid_by: 'A', group_id: 'g1' },
      ];
      // A paid 300. Split equally 3 ways (A, B, C)
      const splits = [
        { expense_id: 'e1', user_id: 'A', amount: 100 },
        { expense_id: 'e1', user_id: 'B', amount: 100 },
        { expense_id: 'e1', user_id: 'C', amount: 100 },
      ];

      const balances = calculateNetBalances(expenses, splits);
      
      // A paid 300, owes 100 -> +200
      // B paid 0, owes 100 -> -100
      // C paid 0, owes 100 -> -100
      expect(balances['A']).toBe(200);
      expect(balances['B']).toBe(-100);
      expect(balances['C']).toBe(-100);
    });
  });

  describe('calculateBudgetMetrics', () => {
    it('calculates remaining budget and percentages', () => {
      const metrics = calculateBudgetMetrics(400, 1000, 30, 15);
      
      expect(metrics.remainingBudget).toBe(600);
      expect(metrics.isExceeded).toBe(false);
      expect(metrics.usagePercentage).toBe(40);
      expect(metrics.targetDailyLimit).toBeCloseTo(33.33, 2);
      expect(metrics.recommendedDailySpent).toBe(40);
      expect(metrics.showWarning).toBe(false);
    });

    it('detects exceeded budget correctly', () => {
      const metrics = calculateBudgetMetrics(1200, 1000, 30, 5);
      
      expect(metrics.remainingBudget).toBe(0);
      expect(metrics.isExceeded).toBe(true);
      expect(metrics.usagePercentage).toBe(120);
      expect(metrics.showWarning).toBe(true); // Exceeded shows warning too
    });
  });

  describe('calculateTiffinBill', () => {
    it('calculates bill from logs', () => {
      const logs = [
        { id: '1', date: '2023-01-01', is_present: true },
        { id: '2', date: '2023-01-02', is_present: true },
        { id: '3', date: '2023-01-03', is_present: false },
      ];
      
      const bill = calculateTiffinBill(logs, 50);
      // 2 present days * 50 = 100
      expect(bill).toBe(100);
    });
  });

  describe('calculateWaterBill', () => {
    it('calculates bill from water quantities', () => {
      const logs = [
        { id: '1', date: '2023-01-01', quantity: 1 },
        { id: '2', date: '2023-01-05', quantity: 2 },
      ];
      
      const bill = calculateWaterBill(logs, 30);
      // 3 total jars * 30 = 90
      expect(bill).toBe(90);
    });
  });

});
