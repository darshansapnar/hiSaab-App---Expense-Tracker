import { distributeShares, simplifyDebts, safeAdd, safeSubtract, safeMultiply } from '../src/utils/math';

describe('math.ts', () => {

  describe('safeAdd, safeSubtract, safeMultiply', () => {
    it('safely adds floating point numbers', () => {
      expect(safeAdd(0.1, 0.2)).toBe(0.3);
      expect(safeAdd(1.05, 2.03)).toBe(3.08);
    });

    it('safely subtracts floating point numbers', () => {
      expect(safeSubtract(0.3, 0.1)).toBe(0.2);
    });

    it('safely multiplies floating point numbers', () => {
      expect(safeMultiply(0.1, 0.2)).toBe(0.02);
    });
  });

  describe('distributeShares (Equal and Custom splits)', () => {
    it('distributes equally exactly to the cent', () => {
      // 10 split 3 ways: 3.34, 3.33, 3.33
      const shares = [1, 1, 1];
      const result = distributeShares(10.00, shares);
      expect(result).toEqual([3.34, 3.33, 3.33]);
      expect(result.reduce((a, b) => safeAdd(a, b), 0)).toBe(10.00);
    });

    it('distributes customs ratios exactly to the cent', () => {
      // 100 split by ratio 2:1:1
      const shares = [2, 1, 1];
      const result = distributeShares(100.00, shares);
      expect(result).toEqual([50.00, 25.00, 25.00]);
      
      // Edge case: 10 split by ratio 2:1:1
      // Total shares = 4
      // 2/4 = 5.00
      // 1/4 = 2.50
      // 1/4 = 2.50
      const edgeResult = distributeShares(10.00, shares);
      expect(edgeResult).toEqual([5.00, 2.50, 2.50]);
    });

    it('handles zero total correctly', () => {
      const result = distributeShares(0, [1, 1, 1]);
      expect(result).toEqual([0, 0, 0]);
    });
  });

  describe('simplifyDebts (Settlements)', () => {
    it('simplifies a simple debt', () => {
      const netBalances = {
        'A': 100,  // Owed 100
        'B': -100  // Owes 100
      };
      
      const settlements = simplifyDebts(netBalances);
      expect(settlements).toHaveLength(1);
      expect(settlements[0]).toEqual({ from: 'B', to: 'A', amount: 100 });
    });

    it('simplifies a circular debt', () => {
      // A paid 30 for A, B, C (A gets 20 back: +20. B owes 10: -10, C owes 10: -10)
      const netBalances = {
        'A': 20,
        'B': -10,
        'C': -10
      };
      
      const settlements = simplifyDebts(netBalances);
      expect(settlements).toHaveLength(2);
      
      // Order isn't strictly guaranteed by greedy algo but the amounts should sum up
      const totalAmount = settlements.reduce((sum, s) => sum + s.amount, 0);
      expect(totalAmount).toBe(20);
      
      settlements.forEach(s => {
        expect(s.to).toBe('A');
        expect(s.amount).toBe(10);
      });
    });
  });

});
