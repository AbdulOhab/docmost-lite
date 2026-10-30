import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import {
  createMcpToken,
  getMcpInfo,
  revokeMcpToken,
} from "@/features/mcp/services/mcp-service";

const KEY = ["mcp-info"];

export function useMcpInfoQuery() {
  return useQuery({ queryKey: KEY, queryFn: getMcpInfo });
}

const onError = (error: any) =>
  notifications.show({
    message: error?.response?.data?.message ?? "Something went wrong",
    color: "red",
  });

export function useCreateMcpTokenMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createMcpToken,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError,
  });
}

export function useRevokeMcpTokenMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: revokeMcpToken,
    onSuccess: () => {
      notifications.show({ message: "Token revoked" });
      qc.invalidateQueries({ queryKey: KEY });
    },
    onError,
  });
}
