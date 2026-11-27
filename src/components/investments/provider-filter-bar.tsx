"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { assetProviderKey } from "@/lib/account-groups";
import { getAssets } from "@/lib/api";
import { translateProviderName } from "@/lib/i18n-data";
import { INVESTMENT_HOUSES } from "@/lib/investment-houses";

export function ProviderFilterBar() {
  const locale = useLocale();
  const tBanks = useTranslations("banks");
  const searchParams = useSearchParams();
  const router = useRouter();
  const selectedProvider = searchParams.get("provider");
  const query = useQuery({ queryKey: ["assets"], queryFn: getAssets });

  const providers = [
    ...new Set(
      (query.data?.assets ?? [])
        .filter((a) => !a.isLiability)
        .map((a) => assetProviderKey(a))
        .filter((p): p is string => Boolean(p)),
    ),
  ];

  if (providers.length === 0) return null;

  const providerLabel = (id: string) => {
    const house = INVESTMENT_HOUSES.find((h) => h.id === id);
    if (house) return locale === "he" ? house.name.he : house.name.en;
    return translateProviderName(id, id, tBanks);
  };

  const setProviderFilter = (provider: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (provider) params.set("provider", provider);
    else params.delete("provider");
    const qs = params.toString();
    router.replace(qs ? `/investments?${qs}` : "/investments");
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant={!selectedProvider ? "default" : "outline"}
        onClick={() => setProviderFilter(null)}
      >
        {locale === "he" ? "הכל" : "All"}
      </Button>
      {providers.map((p) => (
        <Button
          key={p}
          size="sm"
          variant={selectedProvider === p ? "default" : "outline"}
          onClick={() => setProviderFilter(p)}
        >
          {providerLabel(p)}
        </Button>
      ))}
    </div>
  );
}
