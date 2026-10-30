import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Container,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Text,
  Textarea,
  Title,
  Tooltip,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconCheck,
  IconInfoCircle,
  IconPlayerStop,
  IconSend,
  IconSparkles,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import DOMPurify from "dompurify";
import { markdownToHtml } from "@docmost/editor-ext";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, UIMessage } from "ai";
import { getBackendUrl } from "@/lib/config";
import { getAssistantStatus } from "@/features/assistant/assistant-service";
import useUserRole from "@/hooks/use-user-role.tsx";

type Step = { id: string; label: string; args: Record<string, string>; state: "running" | "ok" | "failed"; detail?: string };

const STORAGE_KEY = "assistant-chat-v2";
const MODEL_KEY = "assistant-model";

const LABELS: Record<string, string> = {
  list_spaces: "Listing spaces",
  list_pages: "Listing pages",
  get_page: "Reading a page",
  search_pages: "Searching pages",
  recent_pages: "Looking at recent pages",
  page_history: "Reading page history",
  list_comments: "Reading comments",
  list_trash: "Looking in the trash",
  create_space: "Creating a space",
  create_page: "Creating a page",
  update_page: "Updating a page",
  move_page: "Moving a page",
  duplicate_page: "Duplicating a page",
  restore_page: "Restoring a page",
  add_comment: "Adding a comment",
  list_diagrams: "Listing diagrams",
  get_diagram: "Reading a diagram",
  create_diagram: "Creating a diagram",
  update_diagram: "Updating a diagram",
};

// only text is remembered between visits (tool outputs can be large)
const load = (): UIMessage[] => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
};

const textOf = (m: UIMessage) =>
  m.parts
    .filter((p: any) => p.type === "text")
    .map((p: any) => p.text)
    .join("");

const stepsOf = (m: UIMessage): Step[] =>
  m.parts
    .filter((p: any) => typeof p.type === "string" && p.type.startsWith("tool-"))
    .map((p: any) => {
      const name = p.type.slice(5);
      const input = p.input ?? {};
      const args: Record<string, string> = {};
      for (const k of ["query", "title", "name", "type"]) {
        if (typeof input[k] === "string") args[k] = input[k].slice(0, 80);
      }
      return {
        id: p.toolCallId,
        label: LABELS[name] ?? name,
        args,
        state: p.state === "output-available" ? "ok" : p.state === "output-error" ? "failed" : "running",
        detail: p.errorText ? String(p.errorText).slice(0, 200) : undefined,
      } as Step;
    });

function Markdown({ text, onLink }: { text: string; onLink: (href: string) => void }) {
  const html = useMemo(() => {
    try {
      return DOMPurify.sanitize(markdownToHtml(text) as string);
    } catch {
      return DOMPurify.sanitize(text);
    }
  }, [text]);

  return (
    <div
      className="assistant-md"
      style={{ overflowWrap: "anywhere" }}
      // links to pages open inside the app instead of reloading it
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest("a");
        const href = a?.getAttribute("href");
        if (a && href && href.startsWith("/")) {
          e.preventDefault();
          onLink(href);
        }
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function StepRow({ step }: { step: Step }) {
  const detail = Object.values(step.args).filter(Boolean).join(" · ");
  return (
    <Group gap={6} wrap="nowrap" align="center">
      {step.state === "running" ? (
        <Loader size={12} />
      ) : step.state === "ok" ? (
        <IconCheck size={14} color="var(--mantine-color-teal-6)" />
      ) : (
        <IconX size={14} color="var(--mantine-color-red-6)" />
      )}
      <Text size="xs" c={step.state === "failed" ? "red" : "dimmed"} lineClamp={1}>
        {step.label}
        {detail ? ` — ${detail}` : ""}
        {step.state === "failed" && step.detail ? ` (${step.detail})` : ""}
      </Text>
    </Group>
  );
}

const SUGGESTIONS = [
  "What did I change recently?",
  "Search my pages for nginx and summarize what I wrote",
  "Create a page called Meeting notes with a short template",
  "Make a flow diagram of a login process",
];

export default function Assistant() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: status, isLoading } = useQuery({
    queryKey: ["assistant-status"],
    queryFn: getAssistantStatus,
    staleTime: 30_000,
  });

  const transport = useMemo(
    () => new DefaultChatTransport({ api: `${getBackendUrl()}/ai/chat`, credentials: "include" }),
    [],
  );
  const { messages, sendMessage, status: chatStatus, stop, setMessages, error } = useChat({
    transport,
    messages: load(),
  });
  const busy = chatStatus === "submitted" || chatStatus === "streaming";

  const { isAdmin } = useUserRole();
  const [input, setInput] = useState("");
  const [chosenModel, setChosenModel] = useState<string | null>(() => {
    try {
      return localStorage.getItem(MODEL_KEY);
    } catch {
      return null;
    }
  });
  const models = status?.models ?? [];
  // a remembered model that was removed in Settings falls back to the default
  const model =
    chosenModel && models.some((m) => m.ref === chosenModel)
      ? chosenModel
      : status?.enabled
        ? status.defaultModel
        : null;
  const pickModel = (ref: string | null) => {
    if (!ref) return;
    setChosenModel(ref);
    try {
      localStorage.setItem(MODEL_KEY, ref);
    } catch {
      /* not remembered */
    }
  };
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!busy) {
      try {
        const slim = messages.slice(-40).map((m) => ({
          id: m.id,
          role: m.role,
          parts: [{ type: "text", text: textOf(m) }],
        }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
      } catch {
        /* private mode or full: the chat just is not remembered */
      }
    }
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const send = (text: string) => {
    const prompt = text.trim();
    if (!prompt || busy) return;
    setInput("");
    sendMessage({ text: prompt }, { body: { model } });
  };

  const reset = () => {
    stop();
    setMessages([]);
  };

  return (
    <Container size="md" py="md" style={{ height: "calc(100vh - 45px - 32px)", display: "flex", flexDirection: "column" }}>
      <DocumentTitle title={t("Assistant")} />
      <Group justify="space-between" mb="sm">
        <Group gap="xs">
          <IconSparkles size={22} />
          <Title order={3}>{t("Assistant")}</Title>
          {status?.enabled && (
            <Select
              size="xs"
              w={240}
              aria-label={t("Model")}
              value={model}
              onChange={pickModel}
              allowDeselect={false}
              data={Object.values(
                models.reduce<Record<string, { group: string; items: { value: string; label: string }[] }>>((acc, m) => {
                  (acc[m.provider] ??= { group: m.provider, items: [] }).items.push({ value: m.ref, label: m.label });
                  return acc;
                }, {}),
              )}
              comboboxProps={{ withinPortal: true }}
            />
          )}
        </Group>
        <Tooltip label={t("Start a new chat")} withArrow>
          <ActionIcon variant="subtle" color="gray" onClick={reset} disabled={!messages.length} aria-label={t("Start a new chat")}>
            <IconTrash size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {isLoading ? (
        <Group justify="center" mt="xl"><Loader /></Group>
      ) : !status?.enabled ? (
        <Alert color="yellow" variant="light" icon={<IconInfoCircle />} title={t("The assistant is not set up yet")}>
          <Stack gap={6}>
            <Text size="sm">
              {isAdmin
                ? t("Add a provider (API address, key and model names) in Settings → AI Assistant.")
                : t("Ask an admin to set up an AI provider in Settings.")}
            </Text>
            {isAdmin && (
              <Button size="xs" w="fit-content" onClick={() => navigate("/settings/assistant")}>
                {t("Open AI Assistant settings")}
              </Button>
            )}
          </Stack>
        </Alert>
      ) : (
        <>
          <ScrollArea style={{ flex: 1 }} offsetScrollbars>
            <Stack gap="md" pb="md">
              {!messages.length && (
                <Stack gap="xs" mt="xl" align="center">
                  <Text c="dimmed" ta="center">
                    {t("Ask in plain words. I can search, read, create and edit pages and diagrams for you.")}
                  </Text>
                  <Group justify="center" gap="xs">
                    {SUGGESTIONS.map((s) => (
                      <Button key={s} size="xs" variant="default" onClick={() => send(s)}>{t(s)}</Button>
                    ))}
                  </Group>
                </Stack>
              )}

              {messages.map((m, i) => {
                const text = textOf(m);
                const steps = m.role === "assistant" ? stepsOf(m) : [];
                const last = i === messages.length - 1;
                return (
                  <Box key={m.id} style={{ alignSelf: m.role === "user" ? "flex-end" : "stretch", maxWidth: m.role === "user" ? "85%" : "100%" }}>
                    {m.role === "user" ? (
                      <Paper bg="var(--mantine-primary-color-light)" p="sm" radius="md">
                        <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>{text}</Text>
                      </Paper>
                    ) : (
                      <Stack gap={6}>
                        {!!steps.length && <Stack gap={2}>{steps.map((s) => <StepRow key={s.id} step={s} />)}</Stack>}
                        {text ? (
                          <Markdown text={text} onLink={(href) => navigate(href)} />
                        ) : busy && last && !steps.length ? (
                          <Group gap={6}><Loader size={12} /><Text size="xs" c="dimmed">{t("Working…")}</Text></Group>
                        ) : null}
                      </Stack>
                    )}
                  </Box>
                );
              })}
              {busy && messages[messages.length - 1]?.role === "user" && (
                <Group gap={6}><Loader size={12} /><Text size="xs" c="dimmed">{t("Working…")}</Text></Group>
              )}
              {error && (
                <Alert color="red" variant="light" icon={<IconAlertTriangle />} p="xs">
                  <Text size="sm">{error.message}</Text>
                </Alert>
              )}
              <div ref={endRef} />
            </Stack>
          </ScrollArea>

          <Group align="flex-end" gap="xs" wrap="nowrap" pt="xs">
            <Textarea
              style={{ flex: 1 }}
              autosize
              minRows={1}
              maxRows={6}
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              placeholder={t("Ask or tell me what to do…")}
              aria-label={t("Message")}
              maxLength={8000}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(input);
                }
              }}
            />
            {busy ? (
              <Button color="red" variant="light" leftSection={<IconPlayerStop size={16} />} onClick={() => stop()}>
                {t("Stop")}
              </Button>
            ) : (
              <Button leftSection={<IconSend size={16} />} onClick={() => send(input)} disabled={!input.trim()}>
                {t("Send")}
              </Button>
            )}
          </Group>
          <Text size="xs" c="dimmed" ta="center" pt={4}>
            {t("The assistant can change your pages, but it cannot delete anything. Check what it did.")}
          </Text>
        </>
      )}
    </Container>
  );
}
