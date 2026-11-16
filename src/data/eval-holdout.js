// Held-out evaluation set. Written after the prompt was last changed and run once; the app was
// not tuned on these results. Harder than the development set: paraphrases with no shared
// keywords, items touching two decisions, negations, long descriptions and keyword-heavy
// items that are actually compatible.

const C = (key) => ({ key, relation: 'conflict' });
const R = (key) => ({ key, relation: 'revisit_signal' });

export const HOLDOUT_CASES = [
  { id: 'h01', group: 'conflict', text: 'Partner self-serve schema explorer\nGive partners a single endpoint where they write their own queries against our data graph instead of calling fixed resources. Ship it as part of the public developer portal.', expect: [C('sample:rest')] },
  { id: 'h02', group: 'conflict', text: 'Speed up cash-out for merchants\nFinance found a provider with cheaper settlement. Plan: route all Ghana merchant withdrawals through Settla starting next month, keep PayRail only as a backup.', expect: [C('sample:payouts')] },
  { id: 'h03', group: 'conflict', text: 'Growth experiment tooling\nThe growth squad wants to buy a hosted experimentation and flagging product so PMs can flip features without engineers. Procurement has a quote from FlagPilot.', expect: [C('sample:flags')] },
  { id: 'h04', group: 'conflict', text: 'Login fallback for feature phones\nAbout 9% of merchants in rural areas use feature phones. Send them a six-digit code by text message when they sign in.', expect: [C('sample:otp')] },
  { id: 'h05', group: 'conflict', text: 'Black Friday launch plan\nThe new checkout goes live to production on Friday 27 November at 10:00 so it is ready for the weekend traffic peak. QA signs off Thursday.', expect: [C('sample:releases')] },
  { id: 'h06', group: 'conflict', text: 'Marketing attribution fix\nAttribution is broken. Add the shopper\'s email address and phone to the purchase_completed event so the analytics tool can match them with ad clicks.', expect: [C('sample:pii')] },
  { id: 'h07', group: 'conflict', text: 'Merchant wallet v2 storage\nStore each merchant wallet as a single JSON document (balance plus last 100 movements) in the new NoSQL cluster to make reads faster.', expect: [C('sample:ledger')] },
  { id: 'h08', group: 'conflict', text: 'Tablet app for market traders\nBuild a dedicated Android-native tablet app in Kotlin for market traders, separate from the existing merchant app.', expect: [C('sample:mobile')] },
  { id: 'h09', group: 'conflict', text: 'Support for VIP merchants\nStaff a phone hotline that answers at any hour for all Pro customers, starting with the December peak.', expect: [C('sample:support')] },
  { id: 'h10', group: 'conflict', text: 'Two requests from the refunds team\n1) Keep admins signed in for a full working day. 2) Let any single agent approve refunds of 2,000,000 NGN without waiting for a colleague.', expect: [C('sample:session'), C('meeting:0')] },
  { id: 'h11', group: 'conflict', text: 'Disaster recovery upgrade\nReplicate the production database to a standby in a second cloud region and fail traffic over automatically during a regional outage.', expect: [C('sample:region')] },
  { id: 'h12', group: 'conflict', text: 'Starter plan\nOffer a no-cost Starter plan that never expires for merchants under 20 transactions a month.', expect: [C('sample:trial')] },
  { id: 'h13', group: 'conflict', text: 'Logging costs\nOur OpenSearch nodes are expensive to run. Move logs to a hosted SaaS log platform and turn the cluster off.', expect: [C('sample:opensearch')] },

  { id: 'h14', group: 'compatible', text: 'We will NOT move the ledger to MongoDB\nWrite up why the ledger stays in Postgres for the new engineers\' onboarding guide.', expect: [] },
  { id: 'h15', group: 'compatible', text: 'GraphQL schema lint in web app CI\nAdd a linter for the GraphQL schema used between our dashboard frontend and its backend. Public partner APIs are unaffected.', expect: [] },
  { id: 'h16', group: 'compatible', text: 'Friday code freeze reminder bot\nPost a Slack reminder every Friday morning that production deploys are frozen until Tuesday, except Sev-1 hotfixes.', expect: [] },
  { id: 'h17', group: 'compatible', text: 'Evaluate Settla as a fallback quote only\nFinance asked for an updated Settla quote for the annual vendor review. No migration planned; PayRail stays.', expect: [] },
  { id: 'h18', group: 'compatible', text: 'Passkey recovery via email code\nWhen a merchant loses their passkey device, let them recover with an email one-time code.', expect: [] },
  { id: 'h19', group: 'compatible', text: 'React Native upgrade to latest\nUpgrade the merchant app to the latest React Native version and fix deprecated APIs.', expect: [] },
  { id: 'h20', group: 'compatible', text: 'Toggle SDK for the mobile app\nAdd the in-house Toggle client to the React Native app so mobile features can be flagged.', expect: [] },
  { id: 'h21', group: 'compatible', text: 'Trial extension for support cases\nAllow support to extend a merchant\'s 14-day trial by 7 days when onboarding was delayed by us.', expect: [] },
  { id: 'h22', group: 'compatible', text: 'Analytics: replace raw IDs in legacy events\nThree legacy events still send customer emails; replace them with hashed customer IDs.', expect: [] },
  { id: 'h23', group: 'compatible', text: 'Admin timeout setting audit\nAuditors asked for evidence that the admin idle timeout is 15 minutes. Export the config and screenshots.', expect: [] },
  { id: 'h24', group: 'unrelated', text: 'Quarterly NPS survey\nSend the Q4 NPS survey to active merchants and summarise the comments.', expect: [] },
  { id: 'h25', group: 'unrelated', text: 'Office move checklist\nThe Accra team moves offices on 12 January. Book movers and update the address on invoices.', expect: [] },
  { id: 'h26', group: 'unrelated', text: 'Fix rounding in VAT report\nVAT totals differ by 1 kobo from the line items in some months.', expect: [] },

  { id: 'h27', group: 'revisit', text: 'Settla licence news\nSettla announced today that the central bank granted its licence for same-day NGN settlement.', expect: [R('sample:payouts')] },
  { id: 'h28', group: 'revisit', text: 'Enterprise plan launch\nThe Enterprise plan with contractual 24/7 support hours launches on 1 February.', expect: [R('sample:support')] },
  { id: 'h29', group: 'revisit', text: 'Q3 conversion review\nTrial-to-paid conversion was 6.9% for the whole of Q3, down from 11%.', expect: [R('sample:trial')] },
  { id: 'h30', group: 'revisit', text: 'Ledger load test idea\nCould ledger writes ever exceed 5,000 transactions per second? Let\'s plan a load test next year.', expect: [] },
];
