/** @jsxImportSource @opentui/solid */
// oak:v1-only — whole file
import type { TuiPlugin, TuiPluginApi, TuiTheme } from '@opencode-ai/plugin/tui';
import { createEffect, createMemo, createSignal, onCleanup, Show } from 'solid-js';

const id = 'token-tree-usage' as const;

type AnyMessage = {
  role?: string;
  tokens?: {
    total?: number;
    input?: number;
    output?: number;
    reasoning?: number;
  };
};

type MessageEntry = AnyMessage | { info?: AnyMessage };

interface SidebarUsageProps {
  api: TuiPluginApi;
  sessionId: string;
  theme: TuiTheme;
}

interface ChildUsage {
  tokens: number;
  sessions: number;
  partial: boolean;
}

function messageInfo(entry: MessageEntry): AnyMessage {
  return 'info' in entry && entry.info ? entry.info : (entry as AnyMessage);
}

function messageTokens(entry: MessageEntry): number {
  const info = messageInfo(entry);
  if (info.role !== 'assistant') return 0;

  const tokens = info.tokens;
  if (!tokens) return 0;

  if (Number.isFinite(tokens.total)) return tokens.total ?? 0;

  return (
    (tokens.input ?? 0) +
    (tokens.output ?? 0) +
    (tokens.reasoning ?? 0)
  );
}

function sumMessages(messages: readonly MessageEntry[]): number {
  return messages.reduce((total, message) => total + messageTokens(message), 0);
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return String(tokens);
}

async function loadChildUsage(
  api: TuiPluginApi,
  sessionId: string
): Promise<ChildUsage> {
  const visited = new Set<string>([sessionId]);
  let tokens = 0;
  let sessions = 0;
  let partial = false;

  const visit = async (parentSessionId: string): Promise<void> => {
    const childResult = await api.client.session.children({
      sessionID: parentSessionId,
    });

    if (childResult.error || !childResult.data) {
      partial = true;
      return;
    }

    for (const child of childResult.data) {
      if (!child.id || visited.has(child.id)) continue;

      visited.add(child.id);
      sessions += 1;

      const messageResult = await api.client.session.messages({
        sessionID: child.id,
      });

      if (messageResult.error || !messageResult.data) {
        partial = true;
      } else {
        tokens += sumMessages(messageResult.data);
      }

      await visit(child.id);
    }
  };

  await visit(sessionId);

  return { tokens, sessions, partial };
}

function SidebarUsage(props: SidebarUsageProps) {
  const [refreshCounter, setRefreshCounter] = createSignal(0);
  const [childUsage, setChildUsage] = createSignal<ChildUsage>({
    tokens: 0,
    sessions: 0,
    partial: false,
  });
  const [loading, setLoading] = createSignal(true);

  const theme = () => props.theme.current;

  const leadTokens = createMemo(() => {
    refreshCounter();
    return sumMessages(props.api.state.session.messages(props.sessionId));
  });

  const totalTokens = createMemo(() => leadTokens() + childUsage().tokens);

  let requestId = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const refresh = async () => {
    const currentRequest = ++requestId;
    setLoading(true);

    try {
      const usage = await loadChildUsage(props.api, props.sessionId);
      if (currentRequest !== requestId) return;
      setChildUsage(usage);
    } catch (error) {
      if (currentRequest !== requestId) return;
      console.error('[token-tree-usage] Failed to load child usage:', error);
      setChildUsage(previous => ({ ...previous, partial: true }));
    } finally {
      if (currentRequest === requestId) setLoading(false);
    }
  };

  const scheduleRefresh = () => {
    setRefreshCounter(counter => counter + 1);

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      void refresh();
    }, 250);
  };

  createEffect(() => {
    props.sessionId;
    setChildUsage({ tokens: 0, sessions: 0, partial: false });
    void refresh();
  });

  const unsubMessageUpdated = props.api.event.on('message.updated', scheduleRefresh);
  const unsubMessageRemoved = props.api.event.on('message.removed', scheduleRefresh);
  const unsubSessionStatus = props.api.event.on('session.status', scheduleRefresh);
  const interval = setInterval(scheduleRefresh, 5_000);

  onCleanup(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    clearInterval(interval);
    unsubMessageUpdated();
    unsubMessageRemoved();
    unsubSessionStatus();
  });

  return (
    <box flexDirection="column" paddingTop={1}>
      <text fg={theme().textMuted}>
        <b>Tokens</b>
      </text>
      <text fg={theme().text}>
        Lead {formatTokens(leadTokens())} | Total {formatTokens(totalTokens())}
      </text>
      <Show when={childUsage().sessions > 0}>
        <text fg={theme().textMuted}>
          Subagents +{formatTokens(childUsage().tokens)} | {childUsage().sessions}
        </text>
      </Show>
      <Show when={loading()}>
        <text fg={theme().textMuted}>Updating...</text>
      </Show>
      <Show when={childUsage().partial}>
        <text fg={theme().warning}>Partial total</text>
      </Show>
    </box>
  );
}

const tui: TuiPlugin = async api => {
  api.slots.register({
    order: 900,
    slots: {
      sidebar_content: (ctx, props) => (
        <SidebarUsage api={api} sessionId={props.session_id} theme={ctx.theme} />
      ),
    },
  });
};

// oak:v1-only — whole file (loaded through tui.json). The no-op `setup` keeps
// OpenCode 2 quiet if it migrates tui.json; its sidebar lives in plugins/oak-tui.
export default { id, tui, setup() {} };
