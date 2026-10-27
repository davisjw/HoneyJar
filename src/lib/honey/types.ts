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

export type Contact = {
  id: string;
  name: string;
  kind: string;
  phone: string;
  website: string;
  email: string;
  street: string;
  city: string;
  region: string;
  postal: string;
  hours: string;
  notes: string;
};

export type Person = {
  id: string;
  name: string;
  relation: string;
  email: string;
  linkedUserId: string | null;
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
  meterId: string | null;
  flatPay: boolean;
};

export type Payment = {
  id: string;
  billId: string;
  paidOn: string;
  amountCents: number;
  accountId: string | null;
  transactionId: string | null;
  readingId: string | null;
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
  mime: string;
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

export type Lot = {
  id: string;
  accountId: string | null;
  symbol: string;
  name: string;
  acquiredOn: string;
  sharesMicros: number;
  costCents: number;
  closedOn: string | null;
  notes: string;
};

export type SecurityPrice = {
  id: string;
  symbol: string;
  asOf: string;
  priceCents: number;
};

export type PortfolioFlow = {
  id: string;
  lotId: string | null;
  accountId: string | null;
  symbol: string;
  kind: string;
  postedOn: string;
  amountCents: number;
  external: boolean;
  transactionId: string | null;
  memo: string;
};

export type RetirementSketch = {
  id: string;
  name: string;
  monthlyCents: number;
  annualReturnBps: number;
  years: number;
  targetCents: number;
  usePortfolio: boolean;
  startCents: number;
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
  expiresAt: string | null;
};

export type Draw = {
  id: string;
  ledgerId: string;
  postedOn: string;
  direction: string;
  amountCents: number;
  bizAccountId: string;
  homeAccountId: string;
};

export type InvoiceLine = { description: string; amountCents: number };

export type Invoice = {
  id: string;
  ledgerId: string;
  number: string;
  client: string;
  clientEmail: string;
  clientAddress: string;
  clientCity: string;
  clientRegion: string;
  clientPostal: string;
  issuedOn: string;
  dueOn: string;
  status: string;
  notes: string;
  lines: InvoiceLine[];
  accountId: string | null;
  transactionId: string | null;
  paidOn: string | null;
  leaseId: string | null;
};

export type Lease = {
  id: string;
  ledgerId: string;
  tenant: string;
  email: string;
  address: string;
  city: string;
  region: string;
  postal: string;
  unit: string;
  rentCents: number;
  dueDay: number;
  startOn: string;
  endOn: string | null;
  depositCents: number;
  depositHeldCents: number;
  status: string;
  lastInvoiced: string;
  notes: string;
};

export type Realization = {
  id: string;
  lotId: string | null;
  accountId: string | null;
  symbol: string;
  acquiredOn: string;
  soldOn: string;
  sharesMicros: number;
  basisCents: number;
  proceedsCents: number;
  gainCents: number;
  term: string;
};

export type MileageTrip = {
  id: string;
  ledgerId: string;
  on: string;
  purpose: string;
  destination: string;
  use: string;
  milesHundredths: number;
  parkingCents: number;
  tollsCents: number;
};

export type RateTier = {
  name: string;
  upTo: number | null;
  rateCents: number;
};

export type UtilityMeter = {
  id: string;
  name: string;
  unit: string;
  provider: string;
  parentId: string | null;
  tiers: RateTier[];
  postal: string;
};

export type UtilityColumn = {
  id: string;
  meterId: string;
  key: string;
  label: string;
  kind: "number" | "money" | "calculated" | "date";
  unit: string;
  formula: string;
  rollup: "" | "meter" | "usage" | "bill" | "days" | "readDate" | "charges";
  fromChildren: boolean;
  carryForward: boolean;
  sort: number;
};

export type UtilityReading = {
  id: string;
  meterId: string;
  readOn: string;
  meter: number | null;
  amountCents: number;
  opening: boolean;
  cells: Record<string, number>;
};

export type LedgerBook = {
  id: string;
  name: string;
  kind: "personal" | "business" | "property";
  taxForm: string;
  activity: string;
  archived: boolean;
  accounts: Account[];
  categories: Category[];
  transactions: Txn[];
  bills: Bill[];
  rules: Rule[];
  plan: PlanMonth[];
  goals: Goal[];
  milestones: Milestone[];
  watches: Watch[];
  reminders: Reminder[];
  documents: DocumentRow[];
  reports: Report[];
  invoices: Invoice[];
  trips: MileageTrip[];
  leases: Lease[];
  draws: Draw[];
  meters: UtilityMeter[];
  columns: UtilityColumn[];
  readings: UtilityReading[];
  monthSpentCents: number;
  yearSpentCents: number;
  yearProfitCents: number;
  monthIncomeCents: number;
  monthExpenseCents: number;
  yearIncomeCents: number;
  yearExpenseCents: number;
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
  contacts: Contact[];
  transactions: Txn[];
  bills: Bill[];
  payments: Payment[];
  meters: UtilityMeter[];
  columns: UtilityColumn[];
  readings: UtilityReading[];
  weather: { postal: string; month: string; avgF: number }[];
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
  lots: Lot[];
  prices: SecurityPrice[];
  flows: PortfolioFlow[];
  realizations: Realization[];
  sketches: RetirementSketch[];
  ledgers: LedgerBook[];
  reports: Report[];
  keys: ApiKeyPublic[];
  messages: AiMessage[];
  txnHasMore: boolean;
};

export type ActionResult = {
  token?: string;
  code?: string;
  recoveryCode?: string;
  txn?: Txn;
  matches?: { key: string; txns: Txn[] }[];
  lookup?: {
    name: string;
    phone: string;
    website: string;
    email: string;
    street: string;
    city: string;
    region: string;
    postal: string;
    hours: string;
  };
  file?: { mime: string; fileName: string; dataBase64: string };
  patch?: {
    transactions?: Txn[];
    deletedTransactionIds?: string[];
    accounts?: Account[];
    readings?: UtilityReading[];
  };
};

export type Action = (
  | { type: "profile.update"; patch: ProfilePatch; ownerId?: string }
  | { type: "account.save"; account: Partial<Account> & { name: string; kind: string }; ownerId?: string }
  | { type: "account.archive"; id: string; archived: boolean; ownerId?: string }
  | { type: "category.save"; category: Partial<Category> & { name: string }; ownerId?: string }
  | { type: "category.delete"; id: string; ownerId?: string }
  | { type: "rule.save"; rule: Partial<Rule> & { pattern: string; categoryId: string }; ownerId?: string }
  | { type: "rule.delete"; id: string; ownerId?: string }
  | { type: "person.save"; person: Partial<Person> & { name: string }; ownerId?: string }
  | { type: "person.delete"; id: string; ownerId?: string }
  | { type: "contact.save"; contact: Partial<Contact> & { name: string }; ownerId?: string }
  | { type: "contact.delete"; id: string; ownerId?: string }
  | { type: "contact.lookup"; name: string; ownerId?: string }
  | { type: "txn.save"; txn: Partial<Txn> & { accountId: string; postedOn: string; amountCents: number; merchant: string }; ownerId?: string }
  | { type: "txn.delete"; id: string; ownerId?: string }
  | { type: "txn.import"; accountId: string; rows: { postedOn: string; amountCents: number; merchant: string; memo: string; accountId?: string; categoryId?: string | null; personId?: string | null; tags?: string[] }[]; ownerId?: string }
  | { type: "txn.match"; rows: { key: string; accountId: string; postedOn: string; amountCents: number; merchant: string; memo?: string }[]; ownerId?: string }
  | { type: "txn.get"; id: string; ownerId?: string }
  | { type: "txn.recategorize"; ownerId?: string }
  | { type: "bill.save"; bill: Partial<Bill> & { name: string; amountCents: number; nextDue: string }; ownerId?: string }
  | { type: "bill.delete"; id: string; ownerId?: string }
  | { type: "bill.pay"; id: string; amountCents?: number; paidOn?: string; readingId?: string | null; ownerId?: string }
  | { type: "meter.save"; meter: Partial<UtilityMeter> & { name: string }; template?: string; ownerId?: string }
  | { type: "meter.delete"; id: string; ownerId?: string }
  | { type: "meter.tiers"; id: string; tiers: RateTier[]; ownerId?: string }
  | { type: "column.save"; column: Partial<UtilityColumn> & { meterId: string; label: string; afterId?: string }; ownerId?: string }
  | { type: "column.delete"; id: string; ownerId?: string }
  | { type: "column.move"; id: string; direction: "up" | "down"; ownerId?: string }
  | { type: "column.order"; meterId: string; ids: string[]; ownerId?: string }
  | { type: "weather.ensure"; meterId: string; months: string[]; ownerId?: string }
  | { type: "reading.save"; reading: Partial<UtilityReading> & { meterId: string; readOn: string }; ownerId?: string }
  | { type: "reading.cells"; id: string; cells: Record<string, number>; ownerId?: string }
  | { type: "reading.date"; id: string; readOn: string; ownerId?: string }
  | { type: "reading.delete"; id: string; ownerId?: string }
  | { type: "reading.import"; meterId: string; rows: { readOn: string; create: boolean; cells: Record<string, number> }[]; ownerId?: string }
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
  | { type: "receipt.save"; relatedType: "txn" | "bill"; relatedId: string; fileName: string; mime: string; dataBase64: string; ownerId?: string }
  | { type: "receipt.open"; id: string; ownerId?: string }
  | { type: "receipt.delete"; id: string; ownerId?: string }
  | { type: "score.save"; score: Partial<CreditScore> & { bureau: string; score: number; asOf: string }; ownerId?: string }
  | { type: "score.delete"; id: string; ownerId?: string }
  | { type: "milestone.save"; milestone: Partial<Milestone> & { name: string; kind: string; targetCents: number }; ownerId?: string }
  | { type: "milestone.delete"; id: string; ownerId?: string }
  | { type: "lot.save"; lot: Partial<Lot> & { symbol: string; acquiredOn: string; sharesMicros: number; costCents: number }; recordBuy?: boolean; ownerId?: string }
  | { type: "lot.delete"; id: string; ownerId?: string }
  | { type: "price.save"; price: Partial<SecurityPrice> & { symbol: string; asOf: string; priceCents: number }; ownerId?: string }
  | { type: "price.delete"; id: string; ownerId?: string }
  | { type: "flow.save"; flow: Partial<PortfolioFlow> & { kind: string; postedOn: string; amountCents: number }; recordInBooks?: boolean; ownerId?: string }
  | { type: "flow.delete"; id: string; ownerId?: string }
  | { type: "sketch.save"; sketch: Partial<RetirementSketch> & { name: string }; ownerId?: string }
  | { type: "sketch.delete"; id: string; ownerId?: string }
  | { type: "portfolio.sync"; accountId: string; ownerId?: string }
  | { type: "report.save"; report: Partial<Report> & { name: string; metric: string }; ownerId?: string }
  | { type: "report.delete"; id: string; ownerId?: string }
  | { type: "invite.create"; role: string; email: string; ownerId?: string }
  | { type: "invite.accept"; code: string; ownerId?: string }
  | { type: "invite.revoke"; id: number; ownerId?: string }
  | { type: "apikey.create"; name: string; expiresInDays?: number; ownerId?: string }
  | { type: "apikey.revoke"; id: string; ownerId?: string }
  | { type: "recovery.issue"; ownerId?: string }
  | { type: "account.delete"; confirm: string; ownerId?: string }
  | { type: "sample.clear"; ownerId?: string }
  | { type: "sample.load"; ownerId?: string }
  | { type: "household.begin"; name: string; ownerId?: string }
  | { type: "household.blank"; name: string; ownerId?: string }
  | { type: "advisor.log"; question: string; answer: string; ownerId?: string }
  | { type: "ledger.save"; ledger: { id?: string; name: string; taxForm?: string; activity?: string; kind?: string }; ownerId?: string }
  | { type: "biz.account.save"; ledgerId: string; account: { id?: string; name: string; kind?: string }; ownerId?: string }
  | { type: "biz.txn.save"; ledgerId: string; txn: Partial<Txn> & { accountId: string; postedOn: string; amountCents: number; merchant: string }; ownerId?: string }
  | { type: "biz.txn.delete"; id: string; ownerId?: string }
  | { type: "biz.draw"; ledgerId: string; direction: "draw" | "contribution"; amountCents: number; postedOn: string; bizAccountId: string; homeAccountId: string; ownerId?: string }
  | { type: "biz.draw.delete"; id: string; ownerId?: string }
  | { type: "ledger.archive"; id: string; archived: boolean; ownerId?: string }
  | { type: "invoice.save"; ledgerId: string; invoice: { id?: string; client: string; clientEmail?: string; clientAddress?: string; clientCity?: string; clientRegion?: string; clientPostal?: string; issuedOn: string; dueOn: string; notes?: string; lines: InvoiceLine[] }; ownerId?: string }
  | { type: "invoice.pay"; id: string; accountId: string; paidOn: string; ownerId?: string }
  | { type: "invoice.void"; id: string; ownerId?: string }
  | { type: "mileage.save"; ledgerId: string; trip: { id?: string; on: string; purpose: string; destination?: string; use?: string; milesHundredths: number; parkingCents?: number; tollsCents?: number }; ownerId?: string }
  | { type: "mileage.delete"; id: string; ownerId?: string }
  | { type: "lease.save"; ledgerId: string; lease: { id?: string; tenant: string; email?: string; address?: string; city?: string; region?: string; postal?: string; unit?: string; rentCents: number; dueDay: number; startOn: string; endOn?: string; depositCents?: number; notes?: string }; ownerId?: string }
  | { type: "lease.deposit"; id: string; accountId: string; amountCents: number; postedOn: string; ownerId?: string }
  | { type: "lease.return"; id: string; accountId: string; amountCents: number; postedOn: string; ownerId?: string }
  | { type: "lease.end"; id: string; ownerId?: string }
  | { type: "lot.sell"; id: string; soldOn: string; sharesMicros: number; proceedsCents: number; accountId?: string; ownerId?: string }
) & { ledgerId?: string };
