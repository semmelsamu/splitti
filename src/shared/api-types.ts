// Shapes of the JSON the API sends and receives, shared by server and UI.

export interface MemberDto {
  id: number;
  name: string;
  color: string;
  /** False for members that were removed but still appear in old entries. */
  active: boolean;
}

export interface BalanceDto {
  memberId: number;
  /** Positive: the group owes this member. Negative: the member owes the group. */
  cents: number;
}

export interface GroupDto {
  group: { name: string; createdAt: string };
  members: MemberDto[];
  balances: BalanceDto[];
}

export interface CreatedGroupDto {
  token: string;
  memberId: number;
}

export interface ApiErrorDto {
  error: string;
  /** German, fit to show to the user. */
  message: string;
}
