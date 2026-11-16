// Labelled evaluation set for the conflict checker, written against SAMPLE_DECISIONS.
// expect: the findings a correct checker reports. [] means "say nothing".
// Groups:
//   conflict      work that would contradict a decision (some share no keywords with it)
//   compatible    same topic, but allowed by the decision (hard negatives)
//   unrelated     ordinary backlog items
//   revisit       work reporting that a "revisit if" condition has happened
//   lifecycle     superseded / proposed decisions must not be enforced
// All text is invented for the fictional company "Kestrel".

const C = (key) => ({ key, relation: 'conflict' });
const R = (key) => ({ key, relation: 'revisit_signal' });

export const EVAL_CASES = [
  // ---- conflict -------------------------------------------------------------------------
  { id: 'c01', group: 'conflict', text: 'Migrate merchant payouts to Settla\nMove all Nigerian merchant payouts from PayRail to Settla by end of Q1 to save on fees.', expect: [C('sample:payouts')] },
  { id: 'c02', group: 'conflict', text: 'Spike: direct bank payout integration\nBuild a direct integration with two Nigerian banks so we can stop paying a payout provider.', expect: [C('sample:payouts')] },
  { id: 'c03', group: 'conflict', text: 'Expose a public GraphQL endpoint for partners\nPartners keep asking for flexible queries, so add /graphql to the public API with partner keys.', expect: [C('sample:rest')] },
  { id: 'c04', group: 'conflict', text: 'Partner API v3: let integrators choose fields\nReplace the v3 partner REST resources with a single query endpoint where integrators send a GraphQL document.', expect: [C('sample:rest')] },
  { id: 'c05', group: 'conflict', text: 'Store ledger entries in MongoDB\nThe ledger schema changes often; move ledger entries into a MongoDB collection for flexibility.', expect: [C('sample:ledger')] },
  { id: 'c06', group: 'conflict', text: 'Keep wallet balances in a document store\nFor the new wallets feature, save balances and transfers as JSON documents in the document database the growth team uses.', expect: [C('sample:ledger')] },
  { id: 'c07', group: 'conflict', text: 'Start a native iOS app\nHire two Swift engineers and start a native iOS merchant app for better performance.', expect: [C('sample:mobile')] },
  { id: 'c08', group: 'conflict', text: 'Evaluate FlagPilot for experiments\nSign up for FlagPilot and move our checkout experiments and feature flags to it.', expect: [C('sample:flags')] },
  { id: 'c09', group: 'conflict', text: 'Add "Remember me" to the admin dashboard login\nOps staff complain about logging in again; add a remember me checkbox that keeps admin sessions for 30 days.', expect: [C('sample:session')] },
  { id: 'c10', group: 'conflict', text: 'Increase admin idle timeout to 4 hours\nThe refund team loses work when the admin dashboard logs them out. Set the idle timeout to 4 hours.', expect: [C('sample:session')] },
  { id: 'c11', group: 'conflict', text: 'Track signup funnel with customer emails\nInclude the customer email and phone number in the signup_completed analytics event so marketing can follow up.', expect: [C('sample:pii')] },
  { id: 'c12', group: 'conflict', text: 'Deploy pricing page update Friday afternoon\nMarketing wants the new pricing page live before the weekend campaign; deploy to production this Friday at 4pm.', expect: [C('sample:releases')] },
  { id: 'c13', group: 'conflict', text: 'Launch 24/7 phone support for Pro\nAdd a round-the-clock phone line for Pro plan merchants as part of the retention push.', expect: [C('sample:support')] },
  { id: 'c14', group: 'conflict', text: 'Introduce a free forever plan\nLaunch a permanent free plan for small merchants to drive top-of-funnel growth.', expect: [C('sample:trial')] },
  { id: 'c15', group: 'conflict', text: 'Set up active-active in a second region\nRun production in eu-west and us-east at the same time so we survive a full region outage.', expect: [C('sample:region')] },
  { id: 'c16', group: 'conflict', text: 'Bring back SMS codes for login\nSome merchants without smartphones struggle with passkeys; re-enable SMS one-time codes as a login option.', expect: [C('sample:otp')] },
  { id: 'c17', group: 'conflict', text: 'Ship logs to a hosted logging vendor\nOpenSearch is painful to run; send application logs to LogHarbor again.', expect: [C('sample:opensearch')] },
  { id: 'c18', group: 'conflict', text: 'Refund approvals: remove second approver\nLarge refunds are slow. Let a single agent approve refunds of any size in the admin dashboard.', expect: [C('meeting:0')] },

  // ---- compatible (hard negatives) --------------------------------------------------------
  { id: 'n01', group: 'compatible', text: 'Improve PayRail payout reconciliation report\nAdd the PayRail batch ID to the finance reconciliation export.', expect: [] },
  { id: 'n02', group: 'compatible', text: 'Add GraphQL query for dashboard widgets\nOur web app needs a new GraphQL query between the dashboard frontend and its backend for the revenue widget.', expect: [] },
  { id: 'n03', group: 'compatible', text: 'Publish OpenAPI 3.1 spec for refunds endpoint\nDocument the new REST refunds resource in the partner OpenAPI file.', expect: [] },
  { id: 'n04', group: 'compatible', text: 'Add index to ledger_entries table\nPostgres query plans show sequential scans on ledger_entries by merchant_id; add an index.', expect: [] },
  { id: 'n05', group: 'compatible', text: 'Fix Android keyboard overlap in React Native app\nThe amount field is hidden by the keyboard on some Android phones.', expect: [] },
  { id: 'n06', group: 'compatible', text: 'Add percentage rollouts to Toggle\nExtend our Toggle service so flags can roll out to a percentage of merchants.', expect: [] },
  { id: 'n07', group: 'compatible', text: 'Warn admins one minute before session timeout\nShow a countdown banner before the 15-minute admin idle timeout logs the user out.', expect: [] },
  { id: 'n08', group: 'compatible', text: 'Hash customer IDs in checkout events\nCheckout events still send the raw internal customer ID; switch them to the hashed ID.', expect: [] },
  { id: 'n09', group: 'compatible', text: 'Sev-1 hotfix: payouts failing for Ghana merchants\nSev-1 incident open since Friday 2pm. Deploy the hotfix to production today (Friday) once reviewed.', expect: [] },
  { id: 'n10', group: 'compatible', text: 'Add Tuesday release notes template\nCreate a Confluence template for the Tuesday release train notes.', expect: [] },
  { id: 'n11', group: 'compatible', text: 'Chat support macros for Pro tickets\nAdd saved replies to help agents hit the 4-hour first response target.', expect: [] },
  { id: 'n12', group: 'compatible', text: 'Trial reminder emails\nEmail merchants on day 10 and day 13 of their 14-day trial.', expect: [] },
  { id: 'n13', group: 'compatible', text: 'Add a third availability zone for the API\nSpread API pods across three zones in eu-west.', expect: [] },
  { id: 'n14', group: 'compatible', text: 'Passkey setup prompt after first login\nPrompt merchants to create a passkey right after their first email-code login.', expect: [] },
  { id: 'n15', group: 'compatible', text: 'OpenSearch dashboard for payout errors\nCreate a saved search in our OpenSearch cluster for payout error logs.', expect: [] },
  { id: 'n16', group: 'compatible', text: 'Second approver UI for large refunds\nBuild the approval queue so a second admin can approve refunds above 500,000 NGN.', expect: [] },

  // ---- unrelated ------------------------------------------------------------------------
  { id: 'u01', group: 'unrelated', text: 'Update office Wi-Fi password\nRotate the guest Wi-Fi password in the Lagos office.', expect: [] },
  { id: 'u02', group: 'unrelated', text: 'Typo on careers page\n"Recieve" should be "receive" in the benefits section.', expect: [] },
  { id: 'u03', group: 'unrelated', text: 'Plan Q1 team offsite\nBook a venue and agenda for the engineering offsite in February.', expect: [] },
  { id: 'u04', group: 'unrelated', text: 'Upgrade Node.js to 24 in CI\nThe CI image still uses Node 20; move to Node 24 LTS.', expect: [] },
  { id: 'u05', group: 'unrelated', text: 'Add dark mode to merchant dashboard\nMerchants asked for a dark theme on the web dashboard.', expect: [] },
  { id: 'u06', group: 'unrelated', text: 'Translate onboarding emails to French\nFor the Côte d\'Ivoire pilot, translate the onboarding email sequence.', expect: [] },
  { id: 'u07', group: 'unrelated', text: 'Fix flaky invoice PDF test\nThe invoice PDF snapshot test fails randomly on CI.', expect: [] },
  { id: 'u08', group: 'unrelated', text: 'Renew SSL certificate for status page\nThe status page certificate expires on 3 December.', expect: [] },
  { id: 'u09', group: 'unrelated', text: 'Interview loop for senior designer\nSet up the interview panel and take-home brief.', expect: [] },
  { id: 'u10', group: 'unrelated', text: 'Merchant CSV export includes timezone\nAdd the merchant timezone column to the transactions CSV export.', expect: [] },

  // ---- revisit signals ------------------------------------------------------------------
  { id: 'r01', group: 'revisit', text: 'PayRail fee increase notice\nPayRail emailed that payout fees go up to 2.4% per transaction from January. Finance wants options.', expect: [R('sample:payouts')] },
  { id: 'r02', group: 'revisit', text: 'Four enterprise partners request GraphQL\nAcme Freight, Bolt Retail, Kora Foods and Tali Health have each asked in writing for a GraphQL API.', expect: [R('sample:rest')] },
  { id: 'r03', group: 'revisit', text: 'Android crash-free rate below target\nCrash-free sessions on Android were 98.6% in October and 98.4% in November.', expect: [R('sample:mobile')] },
  { id: 'r04', group: 'revisit', text: 'Northwind contract asks for 99.99% uptime\nThe Northwind enterprise deal requires a 99.99% uptime commitment in the contract.', expect: [R('sample:region')] },
  { id: 'r05', group: 'revisit', text: 'Passkey adoption report\nSix months after launch, 22% of active merchants have created a passkey.', expect: [R('sample:otp')] },

  // ---- lifecycle --------------------------------------------------------------------------
  { id: 'l01', group: 'lifecycle', text: 'Split payouts service into its own repository\nThe payouts service should live in its own repo with separate CI.', expect: [] },
  { id: 'l02', group: 'lifecycle', text: 'Remove LogHarbor agent from old VMs\nThe LogHarbor agent is still installed on three legacy VMs; uninstall it.', expect: [] },
];
