export type FilingStatus = "single" | "mfj" | "mfs" | "hoh";
export type Role = "owner" | "editor" | "viewer" | "advisor";
export type AiProvider = "grok" | "openai" | "ollama";

export type Profile = {
  userId: string;
  displayName: string;
  currency: string;
  filingStatus: FilingStatus;
  stateCode: string;
  dependents: number;
  wagesCents: number;
  otherIncomeCents: number;
  withholdingCents: number;
  estimatedPaidCents: number;
  priorYearTaxCents: number;
  deductionMode: "auto" | "standard" | "itemized";
  saltCapCents: number;
  stateRateBps: number;
  navHidden: string;
  aiProvider: AiProvider;
  openaiKeySet: boolean;
  openaiModel: string;
  ollamaUrl: string;
  ollamaModel: string;
  vaultSalt: string;
  vaultVerifier: string;
  seeded: boolean;
  initialized: boolean;
  monthStartDay: number;
};

export type ProfilePatch = Partial<{
  displayName: string;
  currency: string;
  filingStatus: FilingStatus;
  stateCode: string;
  dependents: number;
  wagesCents: number;
  otherIncomeCents: number;
  withholdingCents: number;
  estimatedPaidCents: number;
  priorYearTaxCents: number;
  deductionMode: "auto" | "standard" | "itemized";
  saltCapCents: number;
  stateRateBps: number;
  navHidden: string;
  aiProvider: AiProvider;
  openaiKey: string;
  openaiModel: string;
  ollamaUrl: string;
  ollamaModel: string;
  vaultSalt: string;
  vaultVerifier: string;
  monthStartDay: number;
}>;

export type AccessRow = {
  id: number;
  ownerUserId: string;
  memberUserId: string | null;
  memberEmail: string;
  role: string;
  inviteCode: string;
  status: string;
  householdName: string;
};

export type Account = {
  id: string;
  name: string;
  institution: string;
  kind: string;
  mask: string;
  balanceCents: number;
  limitCents: number | null;
  aprBps: number | null;
  connected: boolean;
  archived: boolean;
  openedOn: string | null;
  customJson: string;
};

export type Category = {
  id: string;
  name: string;
  section: string;
  flow: string;
  taxSchedule: string;
  taxLine: string;
  icon: string;
  monthlyCents: number;
  rollover: boolean;
  sort: number;
  archived: boolean;
};

export type Rule = {
  id: string;
  pattern: string;
  categoryId: string;
  priority: number;
};

export type Person = {
  id: string;
  name: string;
  relation: string;
  archived: boolean;
  sort: number;
};

export type Txn = {
  id: string;
  accountId: string;
  categoryId: string | null;
  postedOn: string;
  amountCents: number;
  merchant: string;
  memo: string;
  pending: boolean;
  taxSchedule: string;
  taxLine: string;
  reviewed: boolean;
  source: string;
  personId: string | null;
  tags: string[];
};

export type Bill = {
  id: string;
  name: string;
  payee: string;
  kind: string;
  direction: string;
  categoryId: string | null;
  accountId: string | null;
  debtAccountId: string | null;
  amountCents: number;
  principalCents: number | null;
  cadence: string;
  nextDue: string;
  autopay: boolean;
  status: string;
  variable: boolean;
  notes: string;
  url: string;
  personId: string | null;
};

export type Payment = {
  id: string;
  billId: string;
  paidOn: string;
  amountCents: number;
  accountId: string | null;
  transactionId: string | null;
  status: string;
};

export type Asset = {
  id: string;
  name: string;
  kind: string;
  valueCents: number;
  asOf: string;
  loanAccountId: string | null;
  address: string;
  zillowUrl: string;
  zestimateCents: number | null;
  detail: string;
  customJson: string;
};

export type Valuation = {
  id: string;
  assetId: string;
  asOf: string;
  valueCents: number;
  source: string;
};

export type Snapshot = {
  id: string;
  asOf: string;
  assetsCents: number;
  debtsCents: number;
};

export type Goal = {
  id: string;
  name: string;
  targetCents: number;
  savedCents: number;
  targetDate: string | null;
  monthlyCents: number;
  priority: number;
  notes: string;
  archived: boolean;
};

export type Contribution = {
  id: string;
  goalId: string;
  amountCents: number;
  contributedOn: string;
  note: string;
};

export type PlanMonth = {
  id: string;
  categoryId: string;
  month: string;
  assignedCents: number;
};

export type Watch = {
  id: string;
  name: string;
  kind: string;
  refId: string;
  refName: string;
  comparator: string;
  thresholdCents: number;
  enabled: boolean;
  note: string;
};

export type Reminder = {
  id: string;
  title: string;
  dueOn: string;
  href: string;
  relatedType: string;
  relatedId: string;
  done: boolean;
  repeat: string;
  notes: string;
};

export type DocumentRow = {
  id: string;
  title: string;
  kind: string;
  year: number | null;
  relatedType: string;
  relatedId: string;
  notes: string;
  body: string;
  encrypted: boolean;
  fileName: string;
};

export type CreditScore = {
  id: string;
  bureau: string;
  score: number;
  asOf: string;
  factors: string;
  personId: string | null;
};

export type Milestone = {
  id: string;
  name: string;
  kind: string;
  targetCents: number;
  targetDate: string | null;
  currentCents: number;
  monthlyCents: number;
  annualReturnBps: number;
  notes: string;
};

export type Report = {
  id: string;
  name: string;
  metric: string;
  rangeKey: string;
  groupBy: string;
  filtersJson: string;
};

export type ApiKeyPublic = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsed: string | null;
};

export type AiMessage = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
};

export type Workspace = {
  today: string;
  ownerId: string;
  role: Role;
  profile: Profile;
  invites: AccessRow[];
  shared: AccessRow[];
  accounts: Account[];
  categories: Category[];
  rules: Rule[];
  people: Person[];
  transactions: Txn[];
  bills: Bill[];
  payments: Payment[];
  assets: Asset[];
  valuations: Valuation[];
  snapshots: Snapshot[];
  goals: Goal[];
  contributions: Contribution[];
  plan: PlanMonth[];
  watches: Watch[];
  readAlerts: string[];
  reminders: Reminder[];
  documents: DocumentRow[];
  scores: CreditScore[];
  milestones: Milestone[];
  reports: Report[];
  keys: ApiKeyPublic[];
  messages: AiMessage[];
};

export type ActionResult = { token?: string; code?: string };

export type Action =
  | { type: "profile.update"; patch: ProfilePatch; ownerId?: string }
  | { type: "account.save"; account: Partial<Account> & { name: string; kind: string }; ownerId?: string }
  | { type: "account.archive"; id: string; archived: boolean; ownerId?: string }
  | { type: "category.save"; category: Partial<Category> & { name: string }; ownerId?: string }
  | { type: "category.delete"; id: string; ownerId?: string }
  | { type: "rule.save"; rule: Partial<Rule> & { pattern: string; categoryId: string }; ownerId?: string }
  | { type: "rule.delete"; id: string; ownerId?: string }
  | { type: "person.save"; person: Partial<Person> & { name: string }; ownerId?: string }
  | { type: "person.delete"; id: string; ownerId?: string }
  | { type: "txn.save"; txn: Partial<Txn> & { accountId: string; postedOn: string; amountCents: number; merchant: string }; ownerId?: string }
  | { type: "txn.delete"; id: string; ownerId?: string }
  | { type: "txn.import"; accountId: string; rows: { postedOn: string; amountCents: number; merchant: string; memo: string }[]; ownerId?: string }
  | { type: "txn.recategorize"; ownerId?: string }
  | { type: "bill.save"; bill: Partial<Bill> & { name: string; amountCents: number; nextDue: string }; ownerId?: string }
  | { type: "bill.delete"; id: string; ownerId?: string }
  | { type: "bill.pay"; id: string; amountCents?: number; paidOn?: string; ownerId?: string }
  | { type: "asset.save"; asset: Partial<Asset> & { name: string; kind: string; valueCents: number }; ownerId?: string }
  | { type: "asset.delete"; id: string; ownerId?: string }
  | { type: "valuation.add"; assetId: string; asOf: string; valueCents: number; source: string; ownerId?: string }
  | { type: "goal.save"; goal: Partial<Goal> & { name: string; targetCents: number }; ownerId?: string }
  | { type: "goal.delete"; id: string; ownerId?: string }
  | { type: "goal.contribute"; goalId: string; amountCents: number; on: string; note: string; ownerId?: string }
  | { type: "plan.set"; categoryId: string; month: string; assignedCents: number; ownerId?: string }
  | { type: "watch.save"; watch: Partial<Watch> & { name: string; kind: string }; ownerId?: string }
  | { type: "watch.delete"; id: string; ownerId?: string }
  | { type: "alert.read"; key: string; ownerId?: string }
  | { type: "reminder.save"; reminder: Partial<Reminder> & { title: string; dueOn: string }; ownerId?: string }
  | { type: "reminder.delete"; id: string; ownerId?: string }
  | { type: "document.save"; document: Partial<DocumentRow> & { title: string }; ownerId?: string }
  | { type: "document.delete"; id: string; ownerId?: string }
  | { type: "score.save"; score: Partial<CreditScore> & { bureau: string; score: number; asOf: string }; ownerId?: string }
  | { type: "score.delete"; id: string; ownerId?: string }
  | { type: "milestone.save"; milestone: Partial<Milestone> & { name: string; kind: string; targetCents: number }; ownerId?: string }
  | { type: "milestone.delete"; id: string; ownerId?: string }
  | { type: "report.save"; report: Partial<Report> & { name: string; metric: string }; ownerId?: string }
  | { type: "report.delete"; id: string; ownerId?: string }
  | { type: "invite.create"; role: string; email: string; ownerId?: string }
  | { type: "invite.accept"; code: string; ownerId?: string }
  | { type: "invite.revoke"; id: number; ownerId?: string }
  | { type: "apikey.create"; name: string; ownerId?: string }
  | { type: "apikey.revoke"; id: string; ownerId?: string }
  | { type: "sample.clear"; ownerId?: string }
  | { type: "sample.load"; ownerId?: string }
  | { type: "advisor.log"; question: string; answer: string; ownerId?: string };
