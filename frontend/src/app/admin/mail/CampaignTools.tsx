'use client';

import { useMemo, useState } from 'react';

export type CampaignEvent = {
  id: string;
  category: string;
  title: string;
  date: string;
  venue: string;
  description: string;
  url: string;
  sourceLabel: string;
  imageUrl?: string;
  posterUrl?: string;
};

export type AnnualEvent = CampaignEvent & {
  month: string;
  sortDate: string;
};

export type BufferConfig = { apiKey: string; apiKeyConfigured?: boolean; organizationId: string };
export type BufferChannel = {
  id: string;
  name: string;
  displayName?: string | null;
  service: string;
  avatar?: string | null;
  isQueuePaused?: boolean;
};
type ApiClient = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;



export function EventCatalogModal({
  events,
  campaignNames,
  targetCampaignId,
  onTargetCampaign,
  selectedEventIds,
  onAdd,
  onSocial,
  onClose,
}: {
  events: AnnualEvent[];
  campaignNames: Array<{ id: string; month: string }>;
  targetCampaignId: string;
  onTargetCampaign: (id: string) => void;
  selectedEventIds: Set<string>;
  onAdd: (event: AnnualEvent) => void;
  onSocial: (event: AnnualEvent) => void;
  onClose: () => void;
}) {
  const months = ['Todos', ...new Set(events.map(event => event.month))];
  const [month, setMonth] = useState('Todos');
  const [category, setCategory] = useState('Todos');
  const [query, setQuery] = useState('');
  const categories = useMemo(
    () => ['Todos', ...Array.from(new Set(events.map((event) => event.category))).sort()],
    [events],
  );
  const visibleEvents = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es-MX');
    return events.filter((event) => {
      if (month !== 'Todos' && event.month !== month) return false;
      if (category !== 'Todos' && event.category !== category) return false;
      if (!normalized) return true;
      return `${event.title} ${event.venue} ${event.category}`.toLocaleLowerCase('es-MX').includes(normalized);
    }).sort(featuredEventSort);
  }, [category, events, month, query]);

  return (
    <div className="fixed inset-0 z-[110] overflow-y-auto bg-[#0c1713]/95 text-slate-100 backdrop-blur-sm">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-[#12211c]/95 px-5 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#dfb85f]">Catalogue de contenus</p>
            <h2 className="mt-1 text-2xl font-semibold">Catalogue événements · août à décembre 2026</h2>
            <p className="mt-1 text-sm text-slate-400">{events.length} idées avec date, lieu, visuel disponible et source officielle.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-slate-400">
              Ajouter à
              <select
                className="ml-2 rounded-lg border border-white/10 bg-[#1d332b] px-3 py-2 text-sm text-white"
                value={targetCampaignId}
                onChange={(event) => onTargetCampaign(event.target.value)}
              >
                {campaignNames.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.month}</option>)}
              </select>
            </label>
            <button type="button" className="btn-secondary text-sm" onClick={onClose}>Fermer</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-7">
        <section className="mb-6 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
          <div className="flex flex-wrap gap-2">
            {months.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setMonth(item)}
                className={`rounded-full px-4 py-2 text-xs font-semibold ${month === item ? 'bg-[#dfb85f] text-[#17231e]' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_260px]">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un artiste, un musée ou un lieu…"
              className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none focus:border-[#dfb85f]"
            />
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="rounded-xl border border-white/10 bg-[#1d332b] px-4 py-3 text-sm outline-none focus:border-[#dfb85f]"
            >
              {categories.map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
        </section>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {visibleEvents.map((event) => {
            const selected = selectedEventIds.has(event.id);
            return (
              <article key={`${event.month}-${event.id}`} className="overflow-hidden rounded-2xl border border-white/10 bg-[#162821] shadow-xl shadow-black/10">
                <div className="relative h-48 overflow-hidden bg-gradient-to-br from-[#29483c] to-[#0f1b17]">
                  {event.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={event.imageUrl} alt={`Affiche de ${event.title}`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center px-8 text-center">
                      <div>
                        <p className="text-xs uppercase tracking-[0.22em] text-[#dfb85f]">{event.category}</p>
                        <p className="mt-3 font-serif text-2xl text-[#f4ead7]">{event.title}</p>
                      </div>
                    </div>
                  )}
                  <span className="absolute left-4 top-4 rounded-full bg-[#0d1915]/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#efd083]">{event.month}</span>
                </div>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-[#dfb85f]">{event.date}</p>
                      <h3 className="mt-2 text-lg font-semibold leading-6">{event.title}</h3>
                      <p className="mt-1 text-xs text-slate-400">{event.venue}</p>
                    </div>
                    <span className="rounded-full bg-white/5 px-2 py-1 text-[10px] text-slate-300">{event.category}</span>
                  </div>
                  <p className="mt-4 min-h-16 text-sm leading-6 text-slate-300">{event.description}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <a href={event.posterUrl || event.url} target="_blank" rel="noreferrer" className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/5">
                      Voir affiche / source ↗
                    </a>
                    <button type="button" onClick={() => onSocial(event)} className="rounded-lg border border-sky-400/20 px-3 py-2 text-xs font-semibold text-sky-200 hover:bg-sky-400/10">
                      Post Buffer
                    </button>
                    <button
                      type="button"
                      disabled={selected}
                      onClick={() => onAdd(event)}
                      className="rounded-lg bg-[#dfb85f] px-3 py-2 text-xs font-semibold text-[#17231e] disabled:cursor-default disabled:opacity-45"
                    >
                      {selected ? 'Déjà ajouté' : '+ Newsletter'}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        {!visibleEvents.length ? <p className="py-16 text-center text-slate-400">Aucun événement ne correspond aux filtres.</p> : null}
      </main>
    </div>
  );
}

export function BufferStudioModal({
  api,
  initialConfig,
  initialEvent,
  websiteUrl,
  brandName,
  events,
  onPersistConfig,
  onClose,
}: {
  api: ApiClient;
  initialConfig: BufferConfig;
  initialEvent?: AnnualEvent | null;
  websiteUrl: string;
  brandName: string;
  events: AnnualEvent[];
  onPersistConfig: (config: BufferConfig) => Promise<void>;
  onClose: () => void;
}) {
  const months = ['Todos', ...new Set(events.map(event => event.month))];
  const [config, setConfig] = useState(initialConfig);
  const [channels, setChannels] = useState<BufferChannel[]>([]);
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [selectedEventId, setSelectedEventId] = useState(initialEvent?.id || '');
  const [previewMonth, setPreviewMonth] = useState(initialEvent?.month || 'Todos');
  const [text, setText] = useState(() => initialEvent ? socialTextForEvent(initialEvent, websiteUrl, brandName) : '');
  const [imageUrl, setImageUrl] = useState(initialEvent?.imageUrl || '');
  const [mode, setMode] = useState<'queue' | 'custom'>('custom');
  const [dueAt, setDueAt] = useState('');
  const [busy, setBusy] = useState<'connect' | 'post' | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const connect = async () => {
    setBusy('connect');
    setNotice(null);
    try {
      await onPersistConfig(config);
      const result = await api<{
        organization: { id: string; name: string };
        channels: BufferChannel[];
      }>('/tenant/social/buffer/channels');
      setConfig((current) => ({ ...current, organizationId: result.organization.id }));
      setChannels(result.channels);
      setSelectedChannelIds(result.channels.filter((channel) => !channel.isQueuePaused).map((channel) => channel.id));
      setNotice({ tone: 'ok', text: `${result.organization.name} connecté · ${result.channels.length} réseau(x).` });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Connexion Buffer impossible.' });
    } finally {
      setBusy(null);
    }
  };

  const schedule = async () => {
    setBusy('post');
    setNotice(null);
    try {
      const result = await api<{ created: Array<{ channelId: string }>; failed: Array<{ channelId: string; message: string }> }>('/tenant/social/buffer/post', {
        method: 'POST',
        body: JSON.stringify({
          text,
          imageUrl: imageUrl.trim() || undefined,
          channelIds: selectedChannelIds,
          mode,
          saveToDraft: true,
          dueAt: mode === 'custom' && dueAt ? new Date(`${dueAt}:00-06:00`).toISOString() : undefined,
        }),
      });
      setSelectedChannelIds(result.failed.map(item => item.channelId));
      setNotice({
        tone: result.failed.length ? 'error' : 'ok',
        text: `${result.created.length} brouillon(s) créé(s) dans Buffer${result.failed.length ? ` · ${result.failed.length} échec(s)` : ''}.`,
      });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Programmation Buffer impossible.' });
    } finally {
      setBusy(null);
    }
  };

  const previewEvents = useMemo(
    () => events.filter((event) => previewMonth === 'Todos' || event.month === previewMonth).sort(featuredEventSort),
    [events, previewMonth],
  );
  const selectEvent = (event: AnnualEvent) => {
    setSelectedEventId(event.id);
    setText(socialTextForEvent(event, websiteUrl, brandName));
    setImageUrl(event.imageUrl || event.posterUrl || '');
  };

  return (
    <div className="fixed inset-0 z-[120] overflow-y-auto bg-[#09110e]/95 p-4 text-slate-100 backdrop-blur-sm sm:p-7">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-[#14251f] shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-sky-300">Réseaux sociaux</p>
            <h2 className="mt-1 text-2xl font-semibold">Préparer des brouillons Buffer</h2>
          </div>
          <button type="button" className="btn-secondary text-sm" onClick={onClose}>Fermer</button>
        </header>

        <div className="grid lg:grid-cols-[330px_1fr]">
          <aside className="space-y-4 border-b border-white/10 p-6 lg:border-b-0 lg:border-r">
            <div>
              <label className="text-sm text-slate-300">Clé API Buffer</label>
              <input
                type="password"
                value={config.apiKey}
                onChange={(event) => setConfig((current) => ({ ...current, apiKey: event.target.value }))}
                placeholder="Clé personnelle Buffer"
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm outline-none focus:border-sky-400"
              />
              <p className="mt-2 text-xs leading-5 text-slate-500">La clé est enregistrée dans la configuration du tenant ; les publications sont envoyées à Buffer par l’API du CRM.</p>
            </div>
            <button type="button" onClick={connect} disabled={busy !== null || (!config.apiKey.trim() && !config.apiKeyConfigured)} className="btn-primary w-full text-sm">
              {busy === 'connect' ? 'Connexion…' : channels.length ? 'Actualiser les réseaux' : 'Connecter Buffer'}
            </button>
            {channels.length ? (
              <div className="space-y-2 pt-2">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Réseaux destinataires</p>
                {channels.map((channel) => (
                  <label key={channel.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <input
                      type="checkbox"
                      checked={selectedChannelIds.includes(channel.id)}
                      onChange={(event) => setSelectedChannelIds((current) => event.target.checked ? [...current, channel.id] : current.filter((id) => id !== channel.id))}
                    />
                    {channel.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={channel.avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
                    ) : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-400/10 text-xs text-sky-200">{channel.service.slice(0, 2).toUpperCase()}</span>}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{channel.displayName || channel.name}</span>
                      <span className="block text-[10px] uppercase text-slate-500">{channel.service}{channel.isQueuePaused ? ' · file en pause' : ''}</span>
                    </span>
                  </label>
                ))}
              </div>
            ) : null}
          </aside>

          <main className="space-y-5 p-6 sm:p-8">
            <p className="text-sm text-sky-200">Les posts restent en brouillon. Aucune publication automatique. Les dates sont en heure de Mexico.</p>
            {notice ? <div className={`rounded-xl border p-3 text-sm ${notice.tone === 'ok' ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100' : 'border-red-400/20 bg-red-400/10 text-red-100'}`}>{notice.text}</div> : null}
            <section>
              <p className="text-xs uppercase tracking-[0.18em] text-[#efd083]">Posts préparés dans le CRM</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {months.map((month) => (
                  <button
                    key={month}
                    type="button"
                    onClick={() => setPreviewMonth(month)}
                    className={`rounded-full px-3 py-2 text-xs font-semibold ${previewMonth === month ? 'bg-[#dfb85f] text-[#17231e]' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}
                  >
                    {month}
                  </button>
                ))}
              </div>
              <div className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1">
                {previewEvents.map((event) => (
                  <button
                    key={`${event.month}-${event.id}`}
                    type="button"
                    onClick={() => selectEvent(event)}
                    className={`grid w-full grid-cols-[72px_1fr] overflow-hidden rounded-2xl border text-left transition ${selectedEventId === event.id ? 'border-[#dfb85f] bg-[#dfb85f]/10' : 'border-white/10 bg-black/15 hover:bg-white/[0.05]'}`}
                  >
                    <span className="h-full min-h-24 bg-[#20382f]">
                      {event.imageUrl || event.posterUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={event.imageUrl || event.posterUrl} alt="" className="h-full w-full object-cover" />
                      ) : null}
                    </span>
                    <span className="min-w-0 p-3">
                      <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#efd083]">{event.month} · {event.date}</span>
                      <span className="mt-1 block truncate text-sm font-semibold text-white">{event.title}</span>
                      <span className="mt-1 block truncate text-xs text-slate-400">🔗 {event.url}</span>
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">Sélectionne un événement : le CRM récupère son texte, son affiche et son lien officiel pour construire le preview avant l’envoi vers Buffer.</p>
            </section>
            <label className="block text-sm text-slate-300">
              Texte du post
              <textarea value={text} onChange={(event) => setText(event.target.value)} rows={9} maxLength={5000} className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/20 p-4 text-base leading-7 outline-none focus:border-sky-400" />
              <span className="mt-1 block text-right text-[10px] text-slate-500">{text.length}/5000</span>
            </label>
            <label className="block text-sm text-slate-300">
              Image publique HTTPS (facultative)
              <input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://…/image.jpg" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none focus:border-sky-400" />
            </label>
            {imageUrl ? (
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-white text-slate-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="Aperçu du post" className="max-h-72 w-full object-cover" />
                <div className="p-4">
                  <p className="whitespace-pre-line text-sm leading-6">{text}</p>
                  <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Aperçu avant envoi à Buffer</p>
                </div>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => setMode('queue')} className={`rounded-xl border p-4 text-left ${mode === 'queue' ? 'border-[#dfb85f] bg-[#dfb85f]/10' : 'border-white/10 bg-white/[0.03]'}`}>
                <strong className="text-sm">Sans date</strong>
                <span className="mt-1 block text-xs text-slate-400">Conserver le brouillon sans date.</span>
              </button>
              <button type="button" onClick={() => setMode('custom')} className={`rounded-xl border p-4 text-left ${mode === 'custom' ? 'border-[#dfb85f] bg-[#dfb85f]/10' : 'border-white/10 bg-white/[0.03]'}`}>
                <strong className="text-sm">Date précise</strong>
                <span className="mt-1 block text-xs text-slate-400">Choisissez la date et l’heure à Mexico.</span>
              </button>
            </div>
            {mode === 'custom' ? (
              <label className="block text-sm text-slate-300">Date et heure<input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="mt-2 block w-full rounded-xl border border-white/10 bg-[#1d332b] px-4 py-3 outline-none focus:border-sky-400" /></label>
            ) : null}
            <button type="button" onClick={schedule} disabled={busy !== null || !channels.length || !selectedChannelIds.length || !text.trim() || (mode === 'custom' && !dueAt)} className="btn-primary w-full text-sm">
              {busy === 'post' ? 'Programmation…' : mode === 'queue' ? 'Créer les brouillons' : 'Créer les brouillons datés'}
            </button>

          </main>
        </div>
      </div>
    </div>
  );
}

function socialTextForEvent(event: AnnualEvent, websiteUrl: string, brandName: string) {
  return `${event.title} ✨\n\n📅 ${event.date}\n📍 ${event.venue}\n\n${event.description}\n\nInformación oficial: ${event.url}${websiteUrl ? `\n${brandName}: ${websiteUrl}` : ''}`;
}

function featuredEventSort(left: AnnualEvent, right: AnnualEvent) {
  return left.sortDate.localeCompare(right.sortDate);
}
