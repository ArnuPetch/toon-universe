import {
  BROWSE_SORTS,
  PRICE_FILTERS,
  STATUS_FILTERS,
  type BrowseSort,
  type Genre,
  type PriceFilter,
  type SeriesStatus,
} from "@/lib/server/browse";
import { SERIES_STATUS_LABEL } from "../format";
import { ChipRow, type LinkOption } from "./link-tabs";

// URL ⇄ filter state for /search and /genres/[slug]. Unknown values are dropped,
// so a hand-edited URL never reaches the DB as anything but a known option.

export type SearchParams = Record<string, string | string[] | undefined>;

export type FilterState = {
  q?: string;
  genre?: string;
  status?: SeriesStatus;
  price?: PriceFilter;
  sort?: BrowseSort;
  page: number;
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const oneOf = <T extends string>(list: readonly T[], v: string | undefined) =>
  list.includes(v as T) ? (v as T) : undefined;

export function parseFilters(params: SearchParams): FilterState {
  const page = Number.parseInt(first(params.page) ?? "", 10);
  const genre = first(params.genre);
  return {
    q: first(params.q)?.trim().slice(0, 100) || undefined,
    genre: genre && /^[a-z0-9-]{1,50}$/.test(genre) ? genre : undefined,
    status: oneOf(STATUS_FILTERS, first(params.status)),
    price: oneOf(PRICE_FILTERS, first(params.price)),
    sort: oneOf(BROWSE_SORTS, first(params.sort)),
    page: Number.isSafeInteger(page) && page > 1 ? page : 1,
  };
}

/** URL for `state` with `patch` applied; any filter change goes back to page 1. */
export function filterHref(base: string, state: FilterState, patch: Partial<FilterState> = {}) {
  const next = { ...state, page: 1, ...patch };
  const sp = new URLSearchParams();
  if (next.q) sp.set("q", next.q);
  if (next.genre) sp.set("genre", next.genre);
  if (next.status) sp.set("status", next.status);
  if (next.price) sp.set("price", next.price);
  if (next.sort) sp.set("sort", next.sort);
  if (next.page > 1) sp.set("page", String(next.page));
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}

const SORT_LABEL: Record<BrowseSort, string> = {
  relevance: "ตรงที่สุด",
  popular: "ยอดนิยม",
  updated: "อัพเดตล่าสุด",
  new: "มาใหม่",
  rating: "คะแนนสูง",
  title: "ชื่อ ก–ฮ",
};

/** Filter chips. `defaultSort` = what the DB uses when no sort is given. */
export function BrowseFilters({
  base,
  state,
  genres,
  defaultSort,
}: {
  base: string;
  state: FilterState;
  genres?: Genre[];
  defaultSort: BrowseSort;
}) {
  const sorts = BROWSE_SORTS.filter((s) => s !== "relevance" || state.q);
  const currentSort = state.sort && (state.sort !== "relevance" || state.q) ? state.sort : defaultSort;
  const opt = (label: string, patch: Partial<FilterState>, current: boolean): LinkOption => ({
    href: filterHref(base, state, patch),
    label,
    current,
  });

  return (
    <div className="flex flex-col gap-3">
      <ChipRow
        label="เรียง"
        options={sorts.map((s) => opt(SORT_LABEL[s], { sort: s === defaultSort ? undefined : s }, s === currentSort))}
      />
      {genres && (
        <ChipRow
          label="แนว"
          options={[
            opt("ทั้งหมด", { genre: undefined }, !state.genre),
            ...genres.map((g) => opt(g.name, { genre: g.slug }, state.genre === g.slug)),
          ]}
        />
      )}
      <ChipRow
        label="สถานะ"
        options={[
          opt("ทั้งหมด", { status: undefined }, !state.status),
          ...STATUS_FILTERS.map((s) => opt(SERIES_STATUS_LABEL[s], { status: s }, state.status === s)),
        ]}
      />
      <ChipRow
        label="ราคา"
        options={[
          opt("ทั้งหมด", { price: undefined }, !state.price),
          opt("ฟรีทั้งเรื่อง", { price: "free" }, state.price === "free"),
          opt("มีตอนใช้ coin", { price: "paid" }, state.price === "paid"),
        ]}
      />
    </div>
  );
}
