import { ReactNode } from "react";
import { Menu, Text } from "@mantine/core";
import {
  IconBinaryTree2,
  IconScribble,
  IconTopologyStar3,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { DIAGRAM_TYPES, DiagramType } from "@/features/diagrams/diagram-service";
import { useCreateDiagramMutation } from "@/features/diagrams/diagram-queries";

export const TYPE_ICON: Record<DiagramType, React.ElementType> = {
  excalidraw: IconScribble,
  mermaid: IconBinaryTree2,
  drawio: IconTopologyStar3,
};

/** Wraps any trigger; choosing a type creates a diagram of that type and opens it. */
export function NewDiagramMenu({
  children,
  position = "bottom-start",
  onChosen,
}: {
  children: ReactNode;
  position?: "bottom-start" | "bottom-end" | "right-start";
  onChosen?: () => void;
}) {
  const { t } = useTranslation();
  const create = useCreateDiagramMutation();

  return (
    <Menu position={position} withinPortal width={260}>
      <Menu.Target>{children}</Menu.Target>
      <Menu.Dropdown>
        {DIAGRAM_TYPES.map((d) => {
          const Icon = TYPE_ICON[d.value];
          return (
            <Menu.Item
              key={d.value}
              leftSection={<Icon size={18} />}
              disabled={create.isPending}
              onClick={() => {
                create.mutate(d.value);
                onChosen?.();
              }}
            >
              <div>{d.label}</div>
              <Text size="xs" c="dimmed">{t(d.hint)}</Text>
            </Menu.Item>
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );
}
