import { useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Code,
  CopyButton,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import {
  IconCheck,
  IconCopy,
  IconInfoCircle,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import useUserRole from "@/hooks/use-user-role.tsx";
import {
  useCreateMcpTokenMutation,
  useMcpInfoQuery,
  useRevokeMcpTokenMutation,
} from "@/features/mcp/queries/mcp-query";
import { McpScope } from "@/features/mcp/services/mcp-service";

const SCOPE_INFO: { value: McpScope; label: string; hint: string }[] = [
  { value: "read", label: "Read", hint: "search and read pages, comments, history" },
  { value: "write", label: "Write", hint: "create and edit pages, add comments" },
  { value: "delete", label: "Delete", hint: "move pages to trash or delete them for good" },
];

const scopeColor = { read: "blue", write: "orange", delete: "red" } as const;

function ScopeBadges({ scopes }: { scopes: McpScope[] }) {
  return (
    <Group gap={4}>
      {scopes.map((s) => (
        <Badge key={s} size="sm" variant="light" color={scopeColor[s]}>
          {s}
        </Badge>
      ))}
    </Group>
  );
}

function CopyField({ value }: { value: string }) {
  return (
    <Group gap="xs" wrap="nowrap">
      <Code block style={{ flex: 1, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
        {value}
      </Code>
      <CopyButton value={value} timeout={2000}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? "Copied" : "Copy"} withArrow>
            <ActionIcon variant="subtle" color={copied ? "teal" : "gray"} onClick={copy}>
              {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
    </Group>
  );
}

export default function McpSettings() {
  const { t } = useTranslation();
  const { isAdmin, isOwner } = useUserRole();
  const { data, isLoading } = useMcpInfoQuery();
  const createMutation = useCreateMcpTokenMutation();
  const revokeMutation = useRevokeMcpTokenMutation();

  const [opened, setOpened] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<McpScope[]>(["read"]);
  const [created, setCreated] = useState<string | null>(null);

  if (!isAdmin) return null;

  const toggle = (scope: McpScope, on: boolean) =>
    setScopes((cur) => (on ? [...cur, scope] : cur.filter((s) => s !== scope)));

  const submit = async () => {
    const res = await createMutation.mutateAsync({ name: name.trim(), scopes });
    setOpened(false);
    setName("");
    setScopes(["read"]);
    setCreated(res.token);
  };

  const confirmRevoke = (id: string, tokenName: string) =>
    modals.openConfirmModal({
      title: t("Revoke token"),
      centered: true,
      children: (
        <Text size="sm">
          {t("Anything using “{{name}}” will stop working immediately.", {
            name: tokenName,
          })}
        </Text>
      ),
      labels: { confirm: t("Revoke"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => revokeMutation.mutate(id),
    });

  const endpoint = data?.endpoint ?? `${window.location.origin}/mcp`;
  const command = `claude mcp add --transport http docmost ${endpoint} \\\n  --header "Authorization: Bearer <your token>"`;

  return (
    <>
      <DocumentTitle title="MCP" />
      <SettingsTitle title="MCP" />

      <Stack gap="lg">
        <Alert variant="light" color="blue" icon={<IconInfoCircle />}>
          {t(
            "MCP lets AI assistants such as Claude Code work with your pages. A token acts as the workspace owner within its scopes, so keep it secret.",
          )}
        </Alert>

        <div>
          <Text fw={500} mb={4}>{t("Endpoint")}</Text>
          <CopyField value={endpoint} />
        </div>

        <div>
          <Text fw={500} mb={4}>{t("Connect Claude Code")}</Text>
          <CopyField value={command} />
        </div>

        <div>
          <Group justify="space-between" mb="xs">
            <Text fw={500}>{t("Access tokens")}</Text>
            <Button
              size="xs"
              leftSection={<IconPlus size={14} />}
              onClick={() => setOpened(true)}
            >
              {t("Create token")}
            </Button>
          </Group>

          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("Name")}</Table.Th>
                <Table.Th>{t("Token")}</Table.Th>
                <Table.Th>{t("Scopes")}</Table.Th>
                <Table.Th>{t("Last used")}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data?.tokens.map((tk) => (
                <Table.Tr key={tk.id}>
                  <Table.Td>{tk.name}</Table.Td>
                  <Table.Td><Code>{tk.tokenPrefix}…</Code></Table.Td>
                  <Table.Td><ScopeBadges scopes={tk.scopes} /></Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {tk.lastUsedAt ? new Date(tk.lastUsedAt).toLocaleString() : t("Never")}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Tooltip label={t("Revoke")} withArrow>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        aria-label={t("Revoke")}
                        onClick={() => confirmRevoke(tk.id, tk.name)}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Table.Td>
                </Table.Tr>
              ))}
              {data?.envTokens.map((tk, i) => (
                <Table.Tr key={`env-${i}`}>
                  <Table.Td>
                    <Text size="sm">{t("Set in .env")}</Text>
                  </Table.Td>
                  <Table.Td><Code>{tk.hint}</Code></Table.Td>
                  <Table.Td><ScopeBadges scopes={tk.scopes} /></Table.Td>
                  <Table.Td />
                  <Table.Td />
                </Table.Tr>
              ))}
              {!isLoading && !data?.tokens.length && !data?.envTokens.length && (
                <Table.Tr>
                  <Table.Td colSpan={5}>
                    <Text size="sm" c="dimmed" ta="center">
                      {t("No tokens yet. MCP stays off until you create one.")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </div>
      </Stack>

      <Modal opened={opened} onClose={() => setOpened(false)} title={t("Create token")} centered>
        <Stack>
          <TextInput
            label={t("Name")}
            placeholder={t("e.g. Claude Code on my laptop")}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            maxLength={60}
            data-autofocus
          />
          <Stack gap="xs">
            <Text size="sm" fw={500}>{t("Scopes")}</Text>
            {SCOPE_INFO.map((s) => (
              <Checkbox
                key={s.value}
                checked={scopes.includes(s.value)}
                disabled={s.value === "delete" && !isOwner}
                onChange={(e) => toggle(s.value, e.currentTarget.checked)}
                label={t(s.label)}
                description={
                  s.value === "delete" && !isOwner
                    ? t("Only the owner can grant this")
                    : t(s.hint)
                }
              />
            ))}
          </Stack>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpened(false)}>{t("Cancel")}</Button>
            <Button
              onClick={submit}
              loading={createMutation.isPending}
              disabled={!name.trim() || scopes.length === 0}
            >
              {t("Create")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={created !== null}
        onClose={() => setCreated(null)}
        title={t("Copy your token now")}
        centered
        closeOnClickOutside={false}
      >
        <Stack>
          <Alert color="yellow" variant="light">
            {t("This is the only time the token is shown. Store it somewhere safe.")}
          </Alert>
          {created && <CopyField value={created} />}
          <Group justify="flex-end">
            <Button onClick={() => setCreated(null)}>{t("Done")}</Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
