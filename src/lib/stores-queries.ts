import { queryOptions } from "@tanstack/react-query";
import {
  getPublicStoresList,
  getStoreProfile,
  getStoreTournamentHistory,
} from "./nexus-public.functions";

export const publicStoresQuery = () =>
  queryOptions({
    queryKey: ["public-stores"],
    queryFn: () => getPublicStoresList(),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });

export const storeProfileQuery = (slug: string) =>
  queryOptions({
    queryKey: ["store-profile", slug],
    queryFn: () => getStoreProfile({ data: { slug } }),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

export const storeTournamentHistoryQuery = (slug: string) =>
  queryOptions({
    queryKey: ["store-tournament-history", slug],
    queryFn: () => getStoreTournamentHistory({ data: { slug } }),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
