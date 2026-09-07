'use client';

import { useState, useEffect } from 'react';

/**
 * Разход на Actions за текущия месец.
 *
 * Преди това минаваше през Next API route, който не може да работи на GitHub
 * Pages — статичен хостинг няма сървър — и при това викаше два endpoint-а,
 * които GitHub спря (410 Gone). Сега чете новия billing endpoint направо от
 * браузъра с токена на преподавателя.
 *
 * Отговорът не съдържа включената в плана квота, затова тук няма проценти:
 * показва се изразходваното и колко от него реално се плаща. Измисленият
 * знаменател би изглеждал по-добре, но нямаше да е верен.
 */

const ORG = 'nvnacs50';

interface UsageItem {
  product: string;
  sku: string;
  quantity: number;
  unitType: string;
  netAmount: number;
  grossAmount: number;
  repositoryName?: string;
}

interface Usage {
  minutes: number;
  gigabyteHours: number;
  net: number;
  gross: number;
  topRepos: { name: string; minutes: number }[];
}

function summarise(items: UsageItem[]): Usage {
  const byRepo = new Map<string, number>();
  let minutes = 0;
  let gigabyteHours = 0;
  let net = 0;
  let gross = 0;

  for (const item of items) {
    net += item.netAmount || 0;
    gross += item.grossAmount || 0;

    if (item.unitType === 'Minutes') {
      minutes += item.quantity || 0;
      const repo = item.repositoryName;
      if (repo) byRepo.set(repo, (byRepo.get(repo) || 0) + (item.quantity || 0));
    } else if (item.unitType === 'GigabyteHours') {
      gigabyteHours += item.quantity || 0;
    }
  }

  // Array.from, а не спред: tsconfig-ът е с по-нисък target и не итерира Map.
  const topRepos = Array.from(byRepo.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, mins]) => ({ name, minutes: mins }));

  return { minutes, gigabyteHours, net, gross, topRepos };
}

export default function BillingWidget() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const token = localStorage.getItem('gh_token');
    if (!token) return;

    const now = new Date();
    const url =
      `https://api.github.com/organizations/${ORG}/settings/billing/usage` +
      `?year=${now.getFullYear()}&month=${now.getMonth() + 1}`;

    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
      // Достъпът до сметките иска права, които не всеки преподавател има.
      // Тогава просто няма widget — не е грешка, която да се показва.
      if (!res.ok) return;

      const data = await res.json();
      setUsage(summarise(data.usageItems || []));
    } catch {
      // Мрежов проблем — същото: мълчим.
    }
  }

  if (!usage) return null;

  const monthName = new Date().toLocaleDateString('bg-BG', { month: 'long' });
  const covered = usage.net < 0.005;

  return (
    <div className="relative">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 rounded-box border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink-soft transition-colors hover:border-line-strong"
        title={`Разход на Actions през ${monthName}`}
      >
        <span className="tabular-nums">{Math.round(usage.minutes).toLocaleString('bg-BG')}</span>
        <span className="font-medium text-muted">мин</span>
        <svg
          className={`h-4 w-4 text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsExpanded(false)} />

          <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-card border border-line bg-surface shadow-lift">
            <div className="border-b border-line px-4 py-3">
              <h3 className="text-sm font-bold text-ink">Actions през {monthName}</h3>
              <p className="mt-0.5 text-xs text-muted">Разход на организацията</p>
            </div>

            <div className="space-y-3 px-4 py-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-ink-soft">Минути</span>
                <span className="text-sm font-bold tabular-nums text-ink">
                  {Math.round(usage.minutes).toLocaleString('bg-BG')}
                </span>
              </div>

              <div className="flex items-baseline justify-between">
                <span className="text-sm text-ink-soft">Хранилище</span>
                <span className="text-sm font-bold tabular-nums text-ink">
                  {usage.gigabyteHours.toFixed(2)} GB-ч
                </span>
              </div>

              <div className="flex items-baseline justify-between border-t border-line pt-3">
                <span className="text-sm text-ink-soft">За плащане</span>
                {covered ? (
                  <span className="rounded-pill bg-ok-soft px-2.5 py-1 text-xs font-bold text-ok">
                    покрито от плана
                  </span>
                ) : (
                  <span className="text-sm font-bold tabular-nums text-warn">
                    ${usage.net.toFixed(2)}
                  </span>
                )}
              </div>

              {usage.topRepos.length > 0 && (
                <div className="border-t border-line pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                    Най-много минути
                  </p>
                  <ul className="space-y-1.5">
                    {usage.topRepos.map((repo) => (
                      <li key={repo.name} className="flex items-baseline justify-between gap-3">
                        <span className="truncate font-mono text-xs text-ink-soft">{repo.name}</span>
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-ink">
                          {Math.round(repo.minutes)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="border-t border-line px-4 py-3">
              <a
                href={`https://github.com/organizations/${ORG}/settings/billing`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-primary hover:underline"
              >
                Пълните сметки в GitHub →
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
