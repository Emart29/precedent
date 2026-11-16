// Jira issue panel: shows recorded decisions this issue may contradict, with verified quotes,
// the people who shaped each decision (from the Teamwork Graph) and three ways to respond.

import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box, Button, ButtonGroup, Em, Heading, Inline, Link, Lozenge, SectionMessage, Spinner, Stack, Strong,
  Tag, TagGroup, Text, TextArea, User, UserGroup, useProductContext,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const RESPONSE_LABEL = { link: 'Linked to decision', override: 'Proceeding with recorded reason', reopen: 'Decision reopened' };

function People({ people }) {
  const all = [...(people?.owners || []), ...(people?.contributors || [])];
  if (!all.length && !people?.teams?.length) return null;
  return (
    <Stack space="space.050">
      <Text><Strong>People to talk to first</Strong> (from Teamwork Graph)</Text>
      {all.length > 0 && (
        <UserGroup>
          {all.slice(0, 6).map((u) => <User key={u.accountId} accountId={u.accountId} />)}
        </UserGroup>
      )}
      {people?.teams?.length > 0 && (
        <TagGroup>{people.teams.map((t) => <Tag key={t.id} text={t.displayName} />)}</TagGroup>
      )}
    </Stack>
  );
}

function Finding({ f, issueKey, response, onDone }) {
  const [mode, setMode] = useState(null); // 'override' | 'reopen'
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const conflict = f.relation === 'conflict';

  const respond = async (action) => {
    setBusy(true);
    setError(null);
    try {
      await invoke('respond', { issueKey, decisionId: f.id, action, reason });
      setMode(null);
      onDone();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionMessage
      appearance={conflict ? 'warning' : 'information'}
      title={`${conflict ? 'May contradict' : 'Reason to revisit'} ${f.id}: ${f.decision.title}`}
    >
      <Stack space="space.100">
        <Text>The decision says: <Em>“{f.decisionQuote}”</Em></Text>
        <Text>This issue says: <Em>“{f.workQuote}”</Em></Text>
        <Text>{f.explanation}</Text>
        <Inline space="space.100" alignBlock="center">
          {f.decision.decidedOn && <Text>Decided {f.decision.decidedOn}</Text>}
          {f.sourceUrl && <Link href={f.sourceUrl} openNewTab>Open decision page</Link>}
          {response && <Lozenge appearance="success">{RESPONSE_LABEL[response.action]}</Lozenge>}
        </Inline>
        <People people={f.people} />
        {!response && !mode && (
          <ButtonGroup>
            <Button onClick={() => respond('link')} isDisabled={busy || !f.sourceUrl}>Link to decision</Button>
            <Button onClick={() => setMode('override')} isDisabled={busy}>Proceed with a reason</Button>
            <Button onClick={() => setMode('reopen')} isDisabled={busy}>Reopen decision</Button>
          </ButtonGroup>
        )}
        {mode && (
          <Stack space="space.100">
            <TextArea
              placeholder={mode === 'override' ? 'Why is it right to go ahead anyway?' : 'What has changed since the decision?'}
              onChange={(e) => setReason(e.target.value)}
            />
            <ButtonGroup>
              <Button appearance="primary" onClick={() => respond(mode)} isDisabled={busy || reason.trim().length < 10}>
                {mode === 'override' ? 'Record reason and proceed' : 'Reopen and comment'}
              </Button>
              <Button appearance="subtle" onClick={() => setMode(null)}>Cancel</Button>
            </ButtonGroup>
          </Stack>
        )}
        {error && <Text>{error}</Text>}
      </Stack>
    </SectionMessage>
  );
}

function App() {
  const context = useProductContext();
  const issueKey = context?.extension?.issue?.key;
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async (fresh) => {
    setLoading(true);
    setError(null);
    try {
      setState(await invoke(fresh ? 'runIssueCheck' : 'getIssueState', { issueKey }));
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (issueKey) load(false); }, [issueKey]);

  if (!issueKey || (loading && !state)) return <Spinner label="Checking recorded decisions" />;

  const responses = new Map((state?.responses || []).map((r) => [r.decisionId, r]));
  return (
    <Stack space="space.150">
      {error && <SectionMessage appearance="error" title="Precedent could not finish"><Text>{error}</Text></SectionMessage>}
      {state && !state.checkedAt && (
        <Text>This issue has not been checked against your team's decisions yet.</Text>
      )}
      {state?.checkedAt && state.findings.length === 0 && (
        <SectionMessage appearance="success" title="No conflicts with recorded decisions">
          <Text>Checked against {state.candidates} decision(s) you can view.</Text>
        </SectionMessage>
      )}
      {state?.findings.map((f) => (
        <Finding key={f.id} f={f} issueKey={issueKey} response={responses.get(f.id)} onDone={() => load(false)} />
      ))}
      <Inline space="space.100" alignBlock="center">
        <Button onClick={() => load(true)} isDisabled={loading}>{loading ? 'Checking…' : state?.checkedAt ? 'Check again' : 'Check now'}</Button>
        {state?.rejectedCount > 0 && (
          <Text>{state.rejectedCount} AI finding(s) were discarded because their quotes did not match the source.</Text>
        )}
      </Inline>
      <Box>
        <Text><Em>Every quote is checked word for word against the decision and this issue before it is shown.</Em></Text>
      </Box>
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
