export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  push_token: string | null;
  created_at: string;
}

export type GroupType = "hostel" | "flatmates" | "trip" | "couple" | "family" | "other";

export interface Group {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  type: GroupType;
  currency: string;
  created_by: string | null;
  created_at: string;
}

export type MemberRole = "admin" | "member";

export interface GroupMember {
  group_id: string;
  profile_id: string;
  joined_at: string;
  role: MemberRole;
  profile?: Profile; // Populated profile details
}

export interface Expense {
  id: string;
  group_id: string;
  paid_by: string;
  amount: number; // In decimal (represented as float in TS, safe math applied via utils)
  description: string;
  category: string;
  receipt_url: string | null;
  expense_date: string;
  is_settlement: boolean;
  created_at: string;
}

export interface ExpenseSplit {
  id: string;
  expense_id: string;
  debtor_id: string;
  amount: number;
  share_ratio: number | null;
}

export type TrackerType = "tiffin" | "grocery_list" | "custom";

export interface Tracker {
  id: string;
  group_id: string;
  name: string;
  type: TrackerType;
  unit_price: number;
  details: Record<string, any> | null;
  created_at: string;
}

export type TrackerLogStatus = "delivered" | "skipped" | "pending";

export interface TrackerLog {
  id: string;
  tracker_id: string;
  logged_by: string;
  action_date: string; // YYYY-MM-DD
  quantity: number;
  status: TrackerLogStatus;
  notes: string | null;
  created_at: string;
}

export interface TrackerLogConsumer {
  log_id: string;
  profile_id: string;
  share_ratio: number;
}

export interface Budget {
  id: string;
  profile_id: string | null;
  group_id: string | null;
  amount: number;
  category: string | null;
  month_year: string; // YYYY-MM-DD (usually representing 1st of month)
  warning_threshold_pct: number;
  created_at: string;
}

// Visual layout interfaces
export interface UserBalance {
  profile_id: string;
  display_name: string;
  avatar_url: string | null;
  balance: number; // Positive means they are owed money, negative means they owe money
}
