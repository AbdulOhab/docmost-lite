import { useEffect, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  NumberInput,
  PasswordInput,
  Select,
  Slider,
  Stack,
  Switch,
  TagsInput,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconCheck,
  IconInfoCircle,
  IconPencil,
  IconPlayerPlay,
  IconPlus,
  IconTrash,
  IconWorldDownload,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import useUserRole from "@/hooks/use-user-role.tsx";
import {
  deleteProvider,
  fetchProviderModels,
  getAiAdminState,
  IAiProvider,
  saveAiSettings,
  saveProvider,
  testProvider,
  TestResult,
  toggleProvider,
} from "@/features/assistant/assistant-service";

const KEY = ["ai-admin"];

const PRESETS: { value: string; label: string; baseUrl: string; name: string; hint?: string }[] = [
  { value: "zai", label: "Z.ai GLM (pay-per-token API)", name: "Z.ai GLM", baseUrl: "https://api.z.ai/api/paas/v4", hint: "Not the Coding Plan key: that plan may only be used inside Z.ai's coding tools." },
  { value: "openai", label: "OpenAI", name: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { value: "openrouter", label: "OpenRouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  { value: "ollama", label: "Ollama (on this machine)", name: "Ollama", baseUrl: "http://localhost:11434/v1", hint: "No key needed. When the app runs in Docker, use an address the container can reach." },
  { value: "custom", label: "Other (OpenAI-compatible)", name: "", baseUrl: "" },
];

type Form = { id?: string; preset: string; name: string; baseUrl: string; apiKey: string; models: string[]; hasKey: boolean; keyHint: string | null };
const blank: Form = { preset: "zai", name: "Z.ai GLM", baseUrl: "https://api.z.ai/api/paas/v4", apiKey: "", models: [], hasKey: false, keyHint: null };

function ProviderModal({ opened, onClose, initial }: { opened: boolean; onClose: () => void; initial: Form }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(initial);
  const [result, setResult] = useState<TestResult | null>(null);
  useEffect(() => {
    setForm(initial);
    setResult(null);
  }, [initial, opened]);

  const patch = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));
  const preset = PRESETS.find((p) => p.value === form.preset);
  const conn = { id: form.id, baseUrl: form.baseUrl, apiKey: form.apiKey || undefined };
  const fail = (e: any) =>
    notifications.show({ message: e?.response?.data?.message ?? t("Something went wrong"), color: "red" });

  const save = useMutation({
    mutationFn: () =>
      saveProvider({
        id: form.id,
        name: form.name,
        baseUrl: form.baseUrl,
        apiKey: form.apiKey || undefined,
        models: form.models.map((id) => ({ id })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["assistant-status"] });
      onClose();
    },
    onError: fail,
  });

  const discover = useMutation({
    mutationFn: () => fetchProviderModels(conn),
    onSuccess: (r) => {
      if (!r.ok) return notifications.show({ message: r.error ?? t("Could not list models"), color: "red" });
      patch({ models: [...new Set([...form.models, ...r.models])] });
      notifications.show({ message: t("{{n}} models found", { n: r.models.length }) });
    },
    onError: fail,
  });

  const test = useMutation({
    mutationFn: () => testProvider({ ...conn, model: form.models[0] }),
    onSuccess: setResult,
    onError: fail,
  });

  const needsKey = !form.id && form.preset !== "ollama";
  const valid = form.name.trim() && form.baseUrl.trim() && form.models.length > 0 && (!needsKey || form.apiKey.trim());

  return (
    <Modal opened={opened} onClose={onClose} title={form.id ? t("Edit provider") : t("Add provider")} size="lg" centered>
      <Stack>
        {!form.id && (
          <Select
            label={t("Provider")}
            data={PRESETS.map((p) => ({ value: p.value, label: p.label }))}
            value={form.preset}
            allowDeselect={false}
            onChange={(v) => {
              const p = PRESETS.find((x) => x.value === v)!;
              patch({ preset: p.value, name: p.name, baseUrl: p.baseUrl });
            }}
          />
        )}
        {preset?.hint && <Alert variant="light" color="yellow" p="xs" icon={<IconInfoCircle size={16} />}><Text size="xs">{t(preset.hint)}</Text></Alert>}
        <TextInput label={t("Name")} value={form.name} onChange={(e) => patch({ name: e.currentTarget.value })} maxLength={60} />
        <TextInput
          label={t("API address (base URL)")}
          description={t("The app adds /chat/completions to it")}
          value={form.baseUrl}
          onChange={(e) => patch({ baseUrl: e.currentTarget.value })}
        />
        <PasswordInput
          label={t("API key")}
          description={form.id && form.hasKey ? t("Saved ({{hint}}). Leave empty to keep it, or type a new one to replace it.", { hint: form.keyHint }) : undefined}
          placeholder={form.id && form.hasKey ? "••••••••" : ""}
          value={form.apiKey}
          onChange={(e) => patch({ apiKey: e.currentTarget.value })}
          autoComplete="off"
        />
        <TagsInput
          label={t("Models")}
          description={t("Type a model name and press Enter. These appear in the model switcher.")}
          value={form.models}
          onChange={(models) => patch({ models })}
          splitChars={[",", " "]}
          clearable
        />
        <Group justify="space-between">
          <Group gap="xs">
            <Button size="xs" variant="default" leftSection={<IconWorldDownload size={14} />} onClick={() => discover.mutate()} loading={discover.isPending} disabled={!form.baseUrl.trim() || (!form.id && !form.apiKey.trim() && form.preset !== "ollama")}>
              {t("Fetch model names")}
            </Button>
            <Button size="xs" variant="default" leftSection={<IconPlayerPlay size={14} />} onClick={() => test.mutate()} loading={test.isPending} disabled={!form.baseUrl.trim() || !form.models.length}>
              {t("Test connection")}
            </Button>
          </Group>
          {result && (
            <Badge color={result.ok ? "teal" : "red"} variant="light" size="lg" style={{ textTransform: "none" }}>
              {result.ok ? `${t("Works")} · ${result.ms} ms` : `${t("Failed")}: ${result.error}`}
            </Badge>
          )}
        </Group>
        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={onClose}>{t("Cancel")}</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!valid}>{t("Save")}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export default function AssistantSettings() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: KEY, queryFn: getAiAdminState });

  const [modal, setModal] = useState<{ open: boolean; form: Form }>({ open: false, form: blank });
  const [settings, setSettings] = useState<{ defaultModel: string | null; instructions: string; temperature: number; maxSteps: number } | null>(null);
  useEffect(() => {
    if (data) {
      setSettings({
        defaultModel: data.settings.defaultModel ?? null,
        instructions: data.settings.instructions,
        temperature: data.settings.temperature,
        maxSteps: data.settings.maxSteps,
      });
    }
  }, [data]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: KEY });
    qc.invalidateQueries({ queryKey: ["assistant-status"] });
  };
  const fail = (e: any) =>
    notifications.show({ message: e?.response?.data?.message ?? t("Something went wrong"), color: "red" });

  const toggle = useMutation({ mutationFn: (v: { id: string; enabled: boolean }) => toggleProvider(v.id, v.enabled), onSuccess: refresh, onError: fail });
  const remove = useMutation({ mutationFn: deleteProvider, onSuccess: () => { notifications.show({ message: t("Provider removed") }); refresh(); }, onError: fail });
  const saveSettings = useMutation({
    mutationFn: () => saveAiSettings({ ...settings!, defaultModel: settings!.defaultModel ?? undefined }),
    onSuccess: () => { notifications.show({ message: t("Saved") }); refresh(); },
    onError: fail,
  });

  const confirmRemove = (p: IAiProvider) =>
    modals.openConfirmModal({
      title: t("Remove provider"),
      centered: true,
      children: <Text size="sm">{t("“{{name}}” and its saved key will be deleted.", { name: p.name })}</Text>,
      labels: { confirm: t("Remove"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => remove.mutate(p.id),
    });

  const edit = (p: IAiProvider) =>
    setModal({
      open: true,
      form: { id: p.id, preset: "custom", name: p.name, baseUrl: p.baseUrl, apiKey: "", models: p.models.map((m) => m.id), hasKey: p.hasKey, keyHint: p.keyHint },
    });

  if (!isAdmin) return null;

  return (
    <>
      <DocumentTitle title={t("AI Assistant")} />
      <SettingsTitle title={t("AI Assistant")} />

      <Stack gap="xl">
        <Alert variant="light" color="blue" icon={<IconInfoCircle />}>
          {t("Connect any OpenAI-compatible AI service. Add several providers or models and people can switch between them in the Assistant. Keys are stored encrypted on the server.")}
        </Alert>

        <div>
          <Group justify="space-between" mb="xs">
            <Text fw={600}>{t("Providers")}</Text>
            <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setModal({ open: true, form: blank })}>
              {t("Add provider")}
            </Button>
          </Group>

          {isLoading ? (
            <Group justify="center" py="md"><Loader /></Group>
          ) : !data?.providers.length ? (
            <Text size="sm" c="dimmed" ta="center" py="md">{t("No providers yet. Add one to turn the Assistant on.")}</Text>
          ) : (
            <Stack gap="sm">
              {data.providers.map((p) => (
                <Card key={p.id} withBorder radius="md" padding="sm">
                  <Group justify="space-between" wrap="nowrap" align="flex-start">
                    <div style={{ minWidth: 0 }}>
                      <Group gap="xs">
                        <Text fw={500}>{p.name}</Text>
                        {p.source === "env" && <Badge variant="light" color="gray">.env</Badge>}
                        {p.keyUnreadable && <Badge color="red" variant="light">{t("Key must be re-entered")}</Badge>}
                      </Group>
                      <Text size="xs" c="dimmed" style={{ overflowWrap: "anywhere" }}>
                        {p.baseUrl}{p.keyHint ? ` · ${t("key")} ${p.keyHint}` : ""}
                      </Text>
                      <Group gap={4} mt={6}>
                        {p.models.map((m) => <Badge key={m.id} variant="outline" color="gray" style={{ textTransform: "none" }}>{m.label || m.id}</Badge>)}
                      </Group>
                    </div>
                    {p.source === "db" ? (
                      <Group gap="xs" wrap="nowrap">
                        <Switch checked={p.enabled} onChange={(e) => toggle.mutate({ id: p.id, enabled: e.currentTarget.checked })} aria-label={t("Enabled")} />
                        <Tooltip label={t("Edit")} withArrow><ActionIcon variant="subtle" color="gray" onClick={() => edit(p)} aria-label={t("Edit")}><IconPencil size={16} /></ActionIcon></Tooltip>
                        <Tooltip label={t("Remove")} withArrow><ActionIcon variant="subtle" color="red" onClick={() => confirmRemove(p)} aria-label={t("Remove")}><IconTrash size={16} /></ActionIcon></Tooltip>
                      </Group>
                    ) : (
                      <Text size="xs" c="dimmed">{t("Set in the server's .env")}</Text>
                    )}
                  </Group>
                </Card>
              ))}
            </Stack>
          )}
        </div>

        {settings && !!data?.models.length && (
          <div>
            <Text fw={600} mb="xs">{t("Behavior")}</Text>
            <Stack gap="md">
              <Select
                label={t("Default model")}
                description={t("Used until a person picks another one in the Assistant")}
                allowDeselect={false}
                value={settings.defaultModel && data.models.some((m) => m.ref === settings.defaultModel) ? settings.defaultModel : data.models[0].ref}
                onChange={(v) => setSettings({ ...settings, defaultModel: v })}
                data={Object.values(
                  data.models.reduce<Record<string, { group: string; items: { value: string; label: string }[] }>>((acc, m) => {
                    (acc[m.provider] ??= { group: m.provider, items: [] }).items.push({ value: m.ref, label: m.label });
                    return acc;
                  }, {}),
                )}
              />
              <div>
                <Text size="sm" fw={500}>{t("Creativity (temperature)")}: {settings.temperature.toFixed(1)}</Text>
                <Text size="xs" c="dimmed" mb={6}>{t("Lower is more precise, higher is more varied. 0.3 suits wiki work.")}</Text>
                <Slider mb="lg" min={0} max={1.5} step={0.1} value={settings.temperature} onChange={(v) => setSettings({ ...settings, temperature: v })} marks={[{ value: 0, label: "0" }, { value: 0.3, label: "0.3" }, { value: 1, label: "1" }]} />
              </div>
              <NumberInput
                label={t("Most steps per request")}
                description={t("How many tool calls the assistant may chain before it must answer. More can cost more.")}
                min={1}
                max={15}
                w={200}
                value={settings.maxSteps}
                onChange={(v) => setSettings({ ...settings, maxSteps: Number(v) || 8 })}
              />
              <Textarea
                label={t("Extra instructions")}
                description={t("Added to the assistant's built-in rules, e.g. tone, language or how you like pages written.")}
                autosize
                minRows={3}
                maxRows={10}
                maxLength={4000}
                value={settings.instructions}
                onChange={(e) => setSettings({ ...settings, instructions: e.currentTarget.value })}
              />
              <Group>
                <Button leftSection={<IconCheck size={16} />} onClick={() => saveSettings.mutate()} loading={saveSettings.isPending}>{t("Save behavior")}</Button>
              </Group>
            </Stack>
          </div>
        )}

        <Alert variant="light" color="gray" icon={<IconInfoCircle />}>
          <Text size="xs">{t("The assistant can search, read, create and edit pages and diagrams as the person using it. It cannot delete anything.")}</Text>
        </Alert>
      </Stack>

      <ProviderModal opened={modal.open} onClose={() => setModal((m) => ({ ...m, open: false }))} initial={modal.form} />
    </>
  );
}
