// Jira global page: the decision register. Browse decisions, ask "did we already decide…?",
// look for decisions that may need revisiting, and see measured accuracy.

import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box, Button, ButtonGroup, DynamicTable, Em, EmptyState, Heading, Inline, Link, Lozenge, SectionMessage,
  Spinner, Stack, Strong, Tab, TabList, TabPanel, Tabs, Text, Textfield,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const STATUS = {
  active: ['success', 'Active'],
  revisit: ['moved', 'Reopened'],
  superseded: ['removed', 'Superseded'],
  proposed: ['default', 'Proposed'],
};

const pct = (x) => (x == null ? '–' : `${Math.round(x * 100)}%`);

function DecisionTable({ decisions }) {
  const head = { cells: ['ID', 'Decision', 'Status', 'Decided', 'Source'].map((c) => ({ key: c, content: c })) };
  const rows = decisions.map((d) => ({
    key: d.id,
    cells: [
      { key: 'id', content: d.id },
      { key: 'title', content: d.title },
      { key: 'status', content: <Lozenge appearance={(STATUS[d.status] || STATUS.active)[0]}>{(STATUS[d.status] || STATUS.active)[1]}</Lozenge> },
      { key: 'date', content: d.decidedOn || '' },
      { key: 'src', content: d.source && d.source.startsWith('http') ? <Link href={d.source} openNewTab>Page</Link> : 'Sample' },
    ],
  }));
  return <DynamicTable head={head} rows={rows} rowsPerPage={12} />;
}

function Ask() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const ask = async () => {
    setBusy(true);
    setRes(await invoke('askDecisions', { query: q }));
    setBusy(false);
  };
  return (
    <Stack space="space.150">
      <Text>Search the decision log before restarting an old debate.</Text>
      <Inline space="space.100">
        <Textfield placeholder="e.g. Did we decide anything about GraphQL?" onChange={(e) => setQ(e.target.value)} />
        <Button appearance="primary" onClick={ask} isDisabled={busy || q.trim().length < 3}>Search</Button>
      </Inline>
      {res && res.length === 0 && <SectionMessage title="No record found"><Text>No recorded decision matches. Nothing is guessed.</Text></SectionMessage>}
      {res && res.map((d) => (
        <SectionMessage key={d.id} appearance={d.status === 'superseded' ? 'warning' : 'information'} title={`${d.id}: ${d.title}`}>
          <Text>{d.decision}</Text>
          {d.why && <Text><Strong>Why:</Strong> {d.why}</Text>}
          {d.status === 'superseded' && <Text><Em>Superseded: {d.statusText}</Em></Text>}
        </SectionMessage>
      ))}
    </Stack>
  );
}

function Revisit() {
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    setRes(await invoke('reviewDecision', {}));
    setBusy(false);
  };
  return (
    <Stack space="space.150">
      <Text>Each decision can say when it should be revisited. Precedent looks for recent Jira issues showing that a condition has happened.</Text>
      <Box><Button onClick={run} isDisabled={busy}>{busy ? 'Reviewing…' : 'Look for revisit signals'}</Button></Box>
      {res && res.candidates.length === 0 && <Text>Reviewed {res.reviewed} decision(s). No condition has been met.</Text>}
      {res && res.candidates.map((c) => (
        <SectionMessage key={c.decision.id} appearance="warning" title={`${c.decision.id}: ${c.decision.title} may need revisiting`}>
          {c.met.map((m) => (
            <Stack key={m.evidence} space="space.050">
              <Text>Condition: <Em>“{m.conditionQuote}”</Em></Text>
              <Text>{m.evidence} says: <Em>“{m.evidenceQuote}”</Em></Text>
              <Text>{m.explanation}</Text>
            </Stack>
          ))}
        </SectionMessage>
      ))}
    </Stack>
  );
}

function Accuracy({ evalResults, stats }) {
  const head = { cells: ['', 'Conflict precision', 'Conflict recall', 'Revisit precision', 'Revisit recall', 'False alarms on clean issues'].map((c) => ({ key: c, content: c })) };
  const row = (label, r) => ({
    key: label,
    cells: [
      { key: 'l', content: label },
      { key: 'cp', content: pct(r?.conflict?.precision) },
      { key: 'cr', content: pct(r?.conflict?.recall) },
      { key: 'rp', content: pct(r?.revisit?.precision) },
      { key: 'rr', content: pct(r?.revisit?.recall) },
      { key: 'fa', content: r ? `${r.falseAlarms.alarmed} of ${r.falseAlarms.cases}` : '–' },
    ],
  });
  return (
    <Stack space="space.200">
      {evalResults?.holdout ? (
        <Stack space="space.100">
          <Text>
            Measured with labelled Jira-style work items against the sample decisions (model {evalResults.holdout.model}).
            The <Strong>held-out set</Strong> was written after the last prompt change and run once, so it is the fair number.
          </Text>
          <DynamicTable
            head={head}
            rows={[
              row(`Held-out set, ${evalResults.holdout.cases} items`, evalResults.holdout.withVerification),
              row(`Development set, ${evalResults.dev.cases} items`, evalResults.dev.withVerification),
            ]}
          />
          <Text><Em>Every finding shown in Jira also passes a word-for-word quote check against the decision and the issue.</Em></Text>
        </Stack>
      ) : <Text>No evaluation results bundled with this build.</Text>}
      <Heading as="h4">On this site</Heading>
      <Text>
        {stats.checks || 0} checks · {stats.conflicts || 0} conflicts flagged · {stats.revisitSignals || 0} revisit signals ·{' '}
        {stats.link || 0} linked · {stats.override || 0} proceeded with reason · {stats.reopen || 0} reopened ·{' '}
        {stats.rejectedByVerification || 0} unverified AI findings discarded
      </Text>
    </Stack>
  );
}

function App() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);

  const load = async () => setData(await invoke('getRegister'));
  useEffect(() => { load(); }, []);

  const act = async (name, label) => {
    setBusy(name);
    setMessage(null);
    try {
      const r = await invoke(name);
      setMessage(name === 'syncNow'
        ? `Synced ${r.pages} pages into ${r.decisions} decisions${r.errors?.length ? ` (${r.errors.length} errors)` : ''}.`
        : `Loaded ${r.loaded} sample decisions.`);
      await load();
    } catch (e) {
      setMessage(`${label} failed: ${e.message || e}`);
    } finally {
      setBusy(null);
    }
  };

  if (!data) return <Spinner label="Loading decisions" />;
  return (
    <Stack space="space.200">
      <Heading as="h2">Precedent · decision register</Heading>
      <Text>Decisions come from Confluence pages labelled <Strong>decision</Strong> and decision items on pages labelled <Strong>meeting-notes</Strong>. New Jira issues are checked against them automatically.</Text>
      <ButtonGroup>
        <Button onClick={() => act('syncNow', 'Sync')} isDisabled={!!busy}>{busy === 'syncNow' ? 'Syncing…' : 'Sync from Confluence'}</Button>
        <Button appearance="subtle" onClick={() => act('loadSamples', 'Loading samples')} isDisabled={!!busy}>Load sample decisions</Button>
      </ButtonGroup>
      {message && <SectionMessage><Text>{message}</Text></SectionMessage>}
      {data.sync && <Text><Em>Last sync {data.sync.at}: {data.sync.decisions} decisions from {data.sync.pages} pages.</Em></Text>}
      <Tabs id="precedent-tabs">
        <TabList>
          <Tab>Decisions ({data.decisions.length})</Tab>
          <Tab>Ask</Tab>
          <Tab>Revisit</Tab>
          <Tab>Accuracy</Tab>
        </TabList>
        <TabPanel>
          <Box padding="space.150">
            {data.decisions.length
              ? <DecisionTable decisions={data.decisions} />
              : <EmptyState header="No decisions yet" description="Label Confluence pages 'decision' and press Sync, or load the sample decisions to try Precedent." />}
          </Box>
        </TabPanel>
        <TabPanel><Box padding="space.150"><Ask /></Box></TabPanel>
        <TabPanel><Box padding="space.150"><Revisit /></Box></TabPanel>
        <TabPanel><Box padding="space.150"><Accuracy evalResults={data.evalResults} stats={data.stats || {}} /></Box></TabPanel>
      </Tabs>
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
