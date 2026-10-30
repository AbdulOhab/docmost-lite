import { useEffect, useRef, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  ColorSwatch,
  Group,
  Menu,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { IconCalendar, IconDots, IconGripVertical, IconPlus, IconTrash } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  attachClosestEdge,
  Edge,
  extractClosestEdge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import {
  KanbanBoard,
  KanbanCard,
  KanbanColumn,
  newId,
} from "@/features/kanban/kanban-service";

const COLORS = ["gray", "red", "orange", "yellow", "green", "teal", "blue", "violet", "pink"];

type Update = (fn: (board: KanbanBoard) => KanbanBoard) => void;

/** Places `item` next to `targetId` (or at the end when targetId is undefined). */
function insertRelative<T extends { id: string }>(
  list: T[],
  item: T,
  targetId: string | undefined,
  after: boolean,
): T[] {
  const rest = list.filter((x) => x.id !== item.id);
  const idx = targetId ? rest.findIndex((x) => x.id === targetId) : -1;
  if (idx < 0) return [...rest, item];
  rest.splice(after ? idx + 1 : idx, 0, item);
  return rest;
}

function moveCard(board: KanbanBoard, cardId: string, toCol: string, targetCard: string | undefined, after: boolean) {
  const card = board.columns.flatMap((c) => c.cards).find((c) => c.id === cardId);
  if (!card || cardId === targetCard) return board;
  return {
    columns: board.columns.map((col) => {
      const without = col.cards.filter((c) => c.id !== cardId);
      return col.id === toCol
        ? { ...col, cards: insertRelative(without, card, targetCard, after) }
        : { ...col, cards: without };
    }),
  };
}

function moveColumn(board: KanbanBoard, colId: string, targetId: string, after: boolean) {
  const col = board.columns.find((c) => c.id === colId);
  if (!col || colId === targetId) return board;
  return { columns: insertRelative(board.columns, col, targetId, after) };
}

const dueState = (due?: string) => {
  if (!due) return null;
  const today = new Date().toISOString().slice(0, 10);
  return due < today ? "red" : due === today ? "orange" : "gray";
};

function DropLine({ edge }: { edge: Edge | null }) {
  if (!edge) return null;
  const vertical = edge === "left" || edge === "right";
  return (
    <div
      style={{
        position: "absolute",
        background: "var(--mantine-primary-color-filled)",
        borderRadius: 2,
        pointerEvents: "none",
        ...(vertical
          ? { top: 0, bottom: 0, width: 3, [edge]: -6 }
          : { left: 0, right: 0, height: 3, [edge]: -4 }),
      }}
    />
  );
}

function CardView({ card, columnId, onOpen }: { card: KanbanCard; columnId: string; onOpen: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState<Edge | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = ref.current!;
    return combine(
      draggable({
        element: el,
        getInitialData: () => ({ type: "card", cardId: card.id, columnId }),
        onDragStart: () => setDragging(true),
        onDrop: () => setDragging(false),
      }),
      dropTargetForElements({
        element: el,
        canDrop: ({ source }) => source.data.type === "card",
        getData: ({ input, element }) =>
          attachClosestEdge({ type: "card", cardId: card.id, columnId }, { input, element, allowedEdges: ["top", "bottom"] }),
        onDrag: ({ self, source }) =>
          setEdge(source.data.cardId === card.id ? null : extractClosestEdge(self.data)),
        onDragLeave: () => setEdge(null),
        onDrop: () => setEdge(null),
      }),
    );
  }, [card.id, columnId]);

  const due = dueState(card.due);
  return (
    <div ref={ref} style={{ position: "relative", opacity: dragging ? 0.4 : 1 }}>
      <DropLine edge={edge} />
      <Paper
        withBorder
        radius="sm"
        p="xs"
        shadow="xs"
        onClick={onOpen}
        style={{
          cursor: "grab",
          borderLeft: card.color ? `4px solid var(--mantine-color-${card.color}-6)` : undefined,
        }}
      >
        <Text size="sm" fw={500} style={{ wordBreak: "break-word" }}>
          {card.title}
        </Text>
        {card.description && (
          <Text size="xs" c="dimmed" lineClamp={2} mt={2} style={{ wordBreak: "break-word" }}>
            {card.description}
          </Text>
        )}
        {card.due && (
          <Badge size="xs" variant="light" color={due ?? "gray"} mt={6} leftSection={<IconCalendar size={10} />}>
            {card.due}
          </Badge>
        )}
      </Paper>
    </div>
  );
}

function AddCard({ onAdd }: { onAdd: (title: string) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const submit = () => {
    const v = title.trim();
    if (v) onAdd(v);
    setTitle("");
  };
  if (!open) {
    return (
      <Button variant="subtle" color="gray" size="xs" leftSection={<IconPlus size={14} />} onClick={() => setOpen(true)} justify="flex-start">
        {t("Add card")}
      </Button>
    );
  }
  return (
    <Stack gap={6}>
      <Textarea
        autosize
        minRows={2}
        autoFocus
        placeholder={t("Card title")}
        value={title}
        onChange={(e) => setTitle(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") {
            setTitle("");
            setOpen(false);
          }
        }}
      />
      <Group gap="xs">
        <Button size="compact-sm" onClick={submit}>{t("Add")}</Button>
        <Button size="compact-sm" variant="default" onClick={() => { setTitle(""); setOpen(false); }}>{t("Done")}</Button>
      </Group>
    </Stack>
  );
}

function ColumnView({
  column,
  update,
  onOpenCard,
}: {
  column: KanbanColumn;
  update: Update;
  onOpenCard: (id: string) => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState<Edge | null>(null);
  const [overCards, setOverCards] = useState(false);
  const [title, setTitle] = useState(column.title);

  useEffect(() => setTitle(column.title), [column.title]);

  useEffect(() => {
    const el = ref.current!;
    return combine(
      draggable({
        element: el,
        dragHandle: handleRef.current!,
        getInitialData: () => ({ type: "column", columnId: column.id }),
      }),
      dropTargetForElements({
        element: el,
        canDrop: ({ source }) => source.data.type === "card" || source.data.type === "column",
        getData: ({ input, element }) =>
          attachClosestEdge({ type: "column", columnId: column.id }, { input, element, allowedEdges: ["left", "right"] }),
        onDrag: ({ self, source }) => {
          if (source.data.type === "column") {
            setEdge(source.data.columnId === column.id ? null : extractClosestEdge(self.data));
          } else {
            setOverCards(true);
          }
        },
        onDragLeave: () => { setEdge(null); setOverCards(false); },
        onDrop: () => { setEdge(null); setOverCards(false); },
      }),
    );
  }, [column.id]);

  const rename = () => {
    const v = title.trim() || column.title;
    setTitle(v);
    if (v !== column.title) update((b) => ({ columns: b.columns.map((c) => (c.id === column.id ? { ...c, title: v } : c)) }));
  };

  return (
    <div ref={ref} style={{ position: "relative", width: 290, flexShrink: 0 }}>
      <DropLine edge={edge} />
      <Paper
        radius="md"
        p="xs"
        bg="var(--mantine-color-default-hover)"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          maxHeight: "calc(100vh - 130px)",
          outline: overCards ? "2px dashed var(--mantine-primary-color-filled)" : undefined,
        }}
      >
        <Group gap={4} wrap="nowrap">
          <div ref={handleRef} style={{ cursor: "grab", display: "flex" }} aria-label={t("Move column")}>
            <IconGripVertical size={16} color="var(--mantine-color-dimmed)" />
          </div>
          <TextInput
            variant="unstyled"
            size="sm"
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            onBlur={rename}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
            maxLength={80}
            style={{ flex: 1 }}
            styles={{ input: { fontWeight: 600 } }}
            aria-label={t("Column name")}
          />
          <Badge size="sm" variant="default" circle>{column.cards.length}</Badge>
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" size="sm" aria-label={t("Column actions")}>
                <IconDots size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                color="red"
                leftSection={<IconTrash size={14} />}
                onClick={() => {
                  if (!column.cards.length || window.confirm(t("Delete this column and its cards?"))) {
                    update((b) => ({ columns: b.columns.filter((c) => c.id !== column.id) }));
                  }
                }}
              >
                {t("Delete column")}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>

        <ScrollArea.Autosize mah="calc(100vh - 250px)" scrollbarSize={6} type="hover">
          <Stack gap={8} mih={8}>
            {column.cards.map((card) => (
              <CardView key={card.id} card={card} columnId={column.id} onOpen={() => onOpenCard(card.id)} />
            ))}
          </Stack>
        </ScrollArea.Autosize>

        <AddCard
          onAdd={(cardTitle) =>
            update((b) => ({
              columns: b.columns.map((c) =>
                c.id === column.id ? { ...c, cards: [...c.cards, { id: newId(), title: cardTitle }] } : c,
              ),
            }))
          }
        />
      </Paper>
    </div>
  );
}

function CardModal({
  card,
  onClose,
  onChange,
  onDelete,
}: {
  card: KanbanCard | null;
  onClose: () => void;
  onChange: (patch: Partial<KanbanCard>) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<KanbanCard | null>(card);
  useEffect(() => setDraft(card), [card?.id]);
  if (!draft) return null;
  const set = (patch: Partial<KanbanCard>) => {
    setDraft({ ...draft, ...patch });
    onChange(patch);
  };
  return (
    <Modal opened onClose={onClose} title={t("Card")} centered>
      <Stack>
        <TextInput
          label={t("Title")}
          value={draft.title}
          maxLength={300}
          onChange={(e) => set({ title: e.currentTarget.value })}
          data-autofocus
        />
        <Textarea
          label={t("Description")}
          autosize
          minRows={4}
          maxRows={12}
          value={draft.description ?? ""}
          onChange={(e) => set({ description: e.currentTarget.value })}
        />
        <TextInput
          label={t("Due date")}
          type="date"
          value={draft.due ?? ""}
          onChange={(e) => set({ due: e.currentTarget.value || undefined })}
        />
        <div>
          <Text size="sm" fw={500} mb={4}>{t("Color")}</Text>
          <Group gap={8}>
            <ColorSwatch
              color="transparent"
              size={22}
              withShadow={false}
              style={{ border: "1px dashed var(--mantine-color-dimmed)", cursor: "pointer" }}
              onClick={() => set({ color: undefined })}
              aria-label={t("No color")}
            />
            {COLORS.map((c) => (
              <ColorSwatch
                key={c}
                color={`var(--mantine-color-${c}-6)`}
                size={22}
                withShadow={false}
                component="button"
                aria-label={c}
                aria-pressed={draft.color === c}
                style={{ cursor: "pointer", outline: draft.color === c ? "2px solid var(--mantine-color-text)" : undefined, outlineOffset: 2 }}
                onClick={() => set({ color: c })}
              />
            ))}
          </Group>
        </div>
        <Group justify="space-between">
          <Button color="red" variant="light" leftSection={<IconTrash size={14} />} onClick={onDelete}>
            {t("Delete card")}
          </Button>
          <Button onClick={onClose}>{t("Done")}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export default function KanbanBoardView({ board, update }: { board: KanbanBoard; update: Update }) {
  const { t } = useTranslation();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [colTitle, setColTitle] = useState("");
  const updateRef = useRef(update);
  updateRef.current = update;

  useEffect(
    () =>
      monitorForElements({
        onDrop: ({ source, location }) => {
          const targets = location.current.dropTargets;
          if (!targets.length) return;
          const target = targets[0];
          const after = extractClosestEdge(target.data) === "bottom" || extractClosestEdge(target.data) === "right";

          if (source.data.type === "card") {
            const cardId = source.data.cardId as string;
            const toCol = target.data.columnId as string;
            const targetCard = target.data.type === "card" ? (target.data.cardId as string) : undefined;
            updateRef.current((b) => moveCard(b, cardId, toCol, targetCard, after));
          } else if (source.data.type === "column") {
            const target = targets.find((t) => t.data.type === "column");
            if (!target) return;
            const right = extractClosestEdge(target.data) === "right";
            updateRef.current((b) => moveColumn(b, source.data.columnId as string, target.data.columnId as string, right));
          }
        },
      }),
    [],
  );

  const openCard = board.columns.flatMap((c) => c.cards).find((c) => c.id === openId) ?? null;

  const addColumn = () => {
    const v = colTitle.trim();
    if (v) update((b) => ({ columns: [...b.columns, { id: newId(), title: v, cards: [] }] }));
    setColTitle("");
    setAdding(false);
  };

  return (
    <>
      <ScrollArea style={{ flex: 1 }} type="auto" offsetScrollbars>
        <Group align="flex-start" wrap="nowrap" gap="md" p="md" pb="xl">
          {board.columns.map((col) => (
            <ColumnView key={col.id} column={col} update={update} onOpenCard={setOpenId} />
          ))}
          <div style={{ width: 290, flexShrink: 0 }}>
            {adding ? (
              <Stack gap={6}>
                <TextInput
                  autoFocus
                  placeholder={t("Column name")}
                  value={colTitle}
                  onChange={(e) => setColTitle(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addColumn();
                    if (e.key === "Escape") { setColTitle(""); setAdding(false); }
                  }}
                  maxLength={80}
                />
                <Group gap="xs">
                  <Button size="compact-sm" onClick={addColumn}>{t("Add")}</Button>
                  <Button size="compact-sm" variant="default" onClick={() => setAdding(false)}>{t("Cancel")}</Button>
                </Group>
              </Stack>
            ) : (
              <Button variant="light" leftSection={<IconPlus size={14} />} onClick={() => setAdding(true)} fullWidth>
                {t("Add column")}
              </Button>
            )}
          </div>
        </Group>
      </ScrollArea>

      <CardModal
        card={openCard}
        onClose={() => setOpenId(null)}
        onChange={(patch) =>
          update((b) => ({
            columns: b.columns.map((c) => ({
              ...c,
              cards: c.cards.map((x) => (x.id === openId ? { ...x, ...patch } : x)),
            })),
          }))
        }
        onDelete={() => {
          update((b) => ({ columns: b.columns.map((c) => ({ ...c, cards: c.cards.filter((x) => x.id !== openId) })) }));
          setOpenId(null);
        }}
      />
    </>
  );
}
