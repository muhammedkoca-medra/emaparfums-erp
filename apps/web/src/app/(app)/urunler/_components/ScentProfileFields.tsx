"use client";

import { useTranslations } from "next-intl";
import { accordColor } from "@/app/vitrin/accords";
import { inputCls, labelCls, secondaryBtn } from "@/components/ui";

const GENDERS = ["women", "men", "unisex"] as const;
const SEASONS = ["winter", "spring", "summer", "autumn"] as const;

export interface ScentProfileForm {
  gender: (typeof GENDERS)[number];
  accords: { label: string; strength: number }[];
  dayPct: number;
  seasons: { winter: number; spring: number; summer: number; autumn: number };
}

export const emptyScentProfile: ScentProfileForm = {
  gender: "unisex",
  accords: [],
  dayPct: 50,
  seasons: { winter: 50, spring: 50, summer: 50, autumn: 50 },
};

/**
 * Vitrin koku profili alanları (cinsiyet, akor çubukları, gündüz/gece, mevsim). Kontrollü bileşen:
 * müşteriye vitrinde görünen bilgi budur. Hem yeni ürün hem düzenleme ekranında kullanılır.
 */
export function ScentProfileFields({
  value,
  onChange,
  disabled = false,
}: {
  value: ScentProfileForm;
  onChange: (next: ScentProfileForm) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("catalog.profile");

  const setAccord = (i: number, patch: Partial<{ label: string; strength: number }>) =>
    onChange({ ...value, accords: value.accords.map((a, idx) => (idx === i ? { ...a, ...patch } : a)) });

  return (
    <div className="flex flex-col gap-4">
      <label className={labelCls}>
        {t("genderLabel")}
        <select
          className={inputCls}
          value={value.gender}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, gender: e.target.value as ScentProfileForm["gender"] })}
        >
          {GENDERS.map((g) => (
            <option key={g} value={g}>
              {t(`gender.${g}`)}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold">{t("accords")}</span>
          <span className="text-[11px] text-muted">{value.accords.length}/12</span>
        </div>
        {value.accords.length === 0 && <p className="m-0 text-[12.5px] text-muted">{t("accordsEmpty")}</p>}
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {value.accords.map((a, i) => (
            <li key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_40px_28px] items-center gap-2">
              <input
                className={inputCls}
                placeholder={t("accordLabel")}
                value={a.label}
                maxLength={40}
                disabled={disabled}
                onChange={(e) => setAccord(i, { label: e.target.value })}
              />
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: accordColor(a.label || "x") }} />
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={a.strength}
                  disabled={disabled}
                  onChange={(e) => setAccord(i, { strength: Number(e.target.value) })}
                  className="w-full accent-[#b8864b]"
                />
              </span>
              <span className="num text-right text-[12px] font-semibold">{a.strength}</span>
              {!disabled && (
                <button
                  type="button"
                  aria-label={t("accordRemove")}
                  className="text-muted hover:text-bad"
                  onClick={() => onChange({ ...value, accords: value.accords.filter((_, idx) => idx !== i) })}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
        {!disabled && value.accords.length < 12 && (
          <button
            type="button"
            className={`${secondaryBtn} self-start`}
            onClick={() => onChange({ ...value, accords: [...value.accords, { label: "", strength: 60 }] })}
          >
            + {t("accordAdd")}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold">{t("dayNight")}</span>
          <span className="num text-[12px] text-muted">
            {t("day")} %{value.dayPct} · {t("night")} %{100 - value.dayPct}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={value.dayPct}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, dayPct: Number(e.target.value) })}
          className="w-full accent-[#b8864b]"
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold">{t("seasons")}</span>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {SEASONS.map((s) => (
            <label key={s} className="flex flex-col gap-1 text-[12px] font-medium text-text-2">
              <span className="flex justify-between">
                {t(`season.${s}`)} <span className="num text-muted">%{value.seasons[s]}</span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={value.seasons[s]}
                disabled={disabled}
                onChange={(e) => onChange({ ...value, seasons: { ...value.seasons, [s]: Number(e.target.value) } })}
                className="w-full accent-[#b8864b]"
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
