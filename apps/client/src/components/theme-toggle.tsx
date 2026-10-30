import {
  ActionIcon,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from "@mantine/core";
import { IconMoon, IconSun } from "@tabler/icons-react";
import classes from "./theme-toggle.module.css";

export function ThemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme();

  return (
    <Tooltip label="Toggle Color Scheme" withArrow>
      <ActionIcon
        variant="subtle"
        color="dark"
        size="sm"
        onClick={() => {
          setColorScheme(computedColorScheme === "light" ? "dark" : "light");
        }}
        aria-label="Toggle color scheme"
      >
        <IconSun className={classes.light} size={20} stroke={1.5} />
        <IconMoon className={classes.dark} size={20} stroke={1.5} />
      </ActionIcon>
    </Tooltip>
  );
}
