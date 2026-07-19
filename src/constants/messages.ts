export const WITTY_MESSAGES = {
  expense_added: [
    "Another expense? Your wallet is crying silently. 💸",
    "Logged! That rupee really had a story. 📖",
    "Added! There goes the coffee money. ☕",
    "Ka-ching! Recorded that purchase. 💳",
  ],
  expense_updated: [
    "Rewriting history, are we? Modified! 📝",
    "Updated! We won't tell anyone about the correction. 🤫",
    "Change is the only constant. Expense updated! 🔄",
    "Corrected! Clean ledger, happy life. ✨",
  ],
  expense_deleted: [
    "Aaaaand it's gone! Deleted. 💨",
    "Poof! Like it never happened. 🪄",
    "Deleted! Bye bye, transaction. 👋",
    "Erased from existence. Nice. 🧹",
  ],
  group_created: [
    "New group alert! Let the division begin. 👥",
    "Group created! Ready to split the bill? 🔗",
    "New group! Let's keep the friendships clear. 🤝",
    "Squad goals unlocked! Group created. 🚀",
  ],
  member_joined: [
    "A new challenger appears! Joined. 👤",
    "Welcome to the split party! 🥳",
    "Joined! Ready to owe some money? 💸",
    "New member unlocked. Welcome! 🔓",
  ],
  settlement_completed: [
    "Hisaab clear! Friendship restored. 🤝",
    "Settled! You are financially clean. 🧹",
    "No debts, no regrets! Settled. ✨",
    "Clear skies, clear ledger! Done. 🌤️",
  ],
  tiffin_logged: [
    "Tiffin logged! Eat well, track better. 🍱",
    "Logged! What's for lunch today? 🍕",
    "Meal recorded! Keep the streak hot. 🔥",
    "Logged! Ready to satisfy your hunger. 🍲",
  ],
  budget_warning: [
    "Check your pockets! Budget is bleeding. 🚨",
    "Budget warning! Tread lightly. 🛑",
    "Warning! Your wallet is working overtime. ⚠️",
    "Whoops! Budget limit is getting close. 📉",
  ],
  monthly_summary: [
    "Here's your monthly wrap! Time to count the coins. 📊",
    "Month done! Let's see where the rupees went. 🔍",
    "Monthly stats are ready. Check them out! 📈",
    "The monthly damage report is here. 📉",
  ],
  daily_reminder: [
    "Don't break your streak! Log today's kharcha. 🔥",
    "Quick check: did you buy anything today? 💰",
    "Your wallet is waiting for today's logs. 💼",
    "A clean ledger keeps the doctor away. 🩺",
  ],
};

export type WittyEventType = keyof typeof WITTY_MESSAGES;
