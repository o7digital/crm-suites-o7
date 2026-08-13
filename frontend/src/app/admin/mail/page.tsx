'use client';

import { useEffect, useMemo, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { AppShell } from '../../../components/AppShell';
import { Guard } from '../../../components/Guard';
import { useApi, useAuth } from '../../../contexts/AuthContext';
import seed from '../../../lib/newsletterCampaigns.json';
import annualEventsSeed from '../../../lib/events2026.json';
import { BufferStudioModal, EventCatalogModal, type AnnualEvent, type BufferConfig } from './CampaignTools';

type NewsletterEvent = AnnualEvent;
type NewsletterCampaign = Omit<(typeof seed.campaigns)[number], 'events'> & { bodyHtml?: string; events: NewsletterEvent[] };
type MailchimpSetup = typeof seed.mailchimp & { newsletterCampaigns?: NewsletterCampaign[]; buffer: BufferConfig };
type EditorPanel = 'contenu' | 'evenements' | 'design' | 'mailchimp';
type PreviewMode = 'desktop' | 'mobile';

type TenantSettingsResponse = {
  settings: {
    marketingSetup?: Partial<MailchimpSetup> | null;
  };
};

type MailchimpDraftResponse = {
  campaignId: string;
  editUrl?: string | null;
  status: string;
};

const draftStorageKey = 'suites-mine-newsletter-drafts-v2';
const emptyMailchimp = { ...clone(seed.mailchimp), buffer: { apiKey: '', organizationId: '' } } as MailchimpSetup;
const annualEvents = clone(annualEventsSeed) as AnnualEvent[];

export default function AdminMailPage() {
  const { token } = useAuth();
  const api = useApi(token);
  const [campaigns, setCampaigns] = useState<NewsletterCampaign[]>(() => mergeCampaignsWithSeed(seed.campaigns));
  const [campaignId, setCampaignId] = useState(seed.campaigns[0].id);
  const [setup, setSetup] = useState<MailchimpSetup>(emptyMailchimp);
  const [panel, setPanel] = useState<EditorPanel>('contenu');
  const [previewMode, setPreviewMode] = useState<PreviewMode>('desktop');
  const [documentOpen, setDocumentOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [bufferOpen, setBufferOpen] = useState(false);
  const [socialEvent, setSocialEvent] = useState<AnnualEvent | null>(null);
  const [catalogTargetId, setCatalogTargetId] = useState(seed.campaigns[0].id);
  const [draftsLoaded, setDraftsLoaded] = useState(false);
  const [busy, setBusy] = useState<'save' | 'test' | 'publish' | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);

  const selected = useMemo(
    () => campaigns.find((campaign) => campaign.id === campaignId) ?? campaigns[0],
    [campaignId, campaigns],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      let localCampaigns: NewsletterCampaign[] | null = null;
      try {
        const stored = window.localStorage.getItem(draftStorageKey);
        if (stored) {
          const parsed = JSON.parse(stored) as NewsletterCampaign[];
          if (Array.isArray(parsed)) localCampaigns = mergeCampaignsWithSeed(parsed);
        }
      } catch {
        // A malformed local draft should never block the editor.
      }

      if (!cancelled && localCampaigns) setCampaigns(localCampaigns);

      try {
        const response = await api<TenantSettingsResponse>('/tenant/settings');
        const saved = response.settings.marketingSetup;
        if (cancelled || saved?.provider !== 'MAILCHIMP') return;
        setSetup({
          ...emptyMailchimp,
          ...saved,
          gallery: saved.gallery?.length ? saved.gallery : emptyMailchimp.gallery,
          mailchimp: { ...emptyMailchimp.mailchimp, ...(saved.mailchimp ?? {}) },
          buffer: { ...emptyMailchimp.buffer, ...(saved.buffer ?? {}) },
        } as MailchimpSetup);
        if (Array.isArray(saved.newsletterCampaigns)) {
          setCampaigns(mergeCampaignsWithSeed(saved.newsletterCampaigns));
        }
      } catch (err) {
        if (!cancelled) {
          setNotice({
            tone: 'info',
            text: `Brouillons locaux disponibles. ${messageFromError(err, 'La configuration distante est indisponible.')}`,
          });
        }
      } finally {
        if (!cancelled) setDraftsLoaded(true);
      }
    }

    void loadWorkspace();
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    if (!draftsLoaded) return;
    window.localStorage.setItem(draftStorageKey, JSON.stringify(campaigns));
  }, [campaigns, draftsLoaded]);

  useEffect(() => {
    if (window.location.hash === '#editor') setDocumentOpen(true);
  }, []);

  const html = useMemo(() => buildMailchimpHtml(selected, setup), [selected, setup]);

  const patchCampaign = (patch: Partial<NewsletterCampaign>) => {
    setCampaigns((current) =>
      current.map((campaign) =>
        campaign.id === selected.id ? ({ ...campaign, ...patch, status: 'DRAFT' } as NewsletterCampaign) : campaign,
      ),
    );
  };

  const patchEvent = (index: number, patch: Partial<NewsletterEvent>) => {
    const events = selected.events.map((event, eventIndex) =>
      eventIndex === index ? ({ ...event, ...patch } as NewsletterEvent) : event,
    );
    patchCampaign({ events });
  };

  const persistWorkspace = async (nextCampaigns = campaigns) => {
    const nextSetup = { ...setup, provider: 'MAILCHIMP', newsletterCampaigns: nextCampaigns } as MailchimpSetup;
    await api('/tenant/settings', {
      method: 'PATCH',
      body: JSON.stringify({ marketingSetup: nextSetup }),
    });
    setSetup(nextSetup);
  };

  const saveDrafts = async () => {
    setBusy('save');
    setNotice(null);
    try {
      const nextCampaigns = campaigns.map((campaign) =>
        campaign.id === selected.id ? ({ ...campaign, status: 'SAVED' } as NewsletterCampaign) : campaign,
      );
      await persistWorkspace(nextCampaigns);
      setCampaigns(nextCampaigns);
      setNotice({ tone: 'ok', text: `${selected.month} a été sauvegardé dans le CRM.` });
    } catch (err) {
      setNotice({ tone: 'error', text: messageFromError(err, 'Sauvegarde impossible.') });
    } finally {
      setBusy(null);
    }
  };

  const testConnection = async () => {
    setBusy('test');
    setNotice(null);
    try {
      await persistWorkspace();
      const response = await api<{ healthStatus: string }>('/tenant/newsletter/mailchimp/test', { method: 'POST' });
      setNotice({ tone: 'ok', text: `Mailchimp connecté : ${response.healthStatus}` });
    } catch (err) {
      setNotice({ tone: 'error', text: messageFromError(err, 'Connexion Mailchimp impossible.') });
    } finally {
      setBusy(null);
    }
  };

  const createMailchimpDraft = async () => {
    setBusy('publish');
    setNotice(null);
    try {
      await persistWorkspace();
      const response = await api<MailchimpDraftResponse>('/tenant/newsletter/mailchimp/draft', {
        method: 'POST',
        body: JSON.stringify({
          campaignTitle: `Suites Mine · ${selected.month} 2026`,
          subject: selected.subject,
          preheader: selected.preheader,
          html,
          plainText: toMailchimpText(selected.body),
          utmCampaign: selected.mailchimp.utmCampaign,
        }),
      });
      setCampaigns((current) =>
        current.map((campaign) =>
          campaign.id === selected.id ? ({ ...campaign, status: 'MAILCHIMP' } as NewsletterCampaign) : campaign,
        ),
      );
      setNotice({
        tone: 'ok',
        text: response.editUrl
          ? `Brouillon créé dans Mailchimp. Ouvrez-le ici : ${response.editUrl}`
          : `Brouillon Mailchimp créé (${response.campaignId}).`,
      });
    } catch (err) {
      setNotice({ tone: 'error', text: messageFromError(err, 'Création du brouillon Mailchimp impossible.') });
    } finally {
      setBusy(null);
    }
  };

  const resetCampaign = () => {
    const original = seed.campaigns.find((campaign) => campaign.id === selected.id);
    if (!original) return;
    setCampaigns((current) => current.map((campaign) => (campaign.id === selected.id ? hydrateCampaigns([clone(original)])[0] : campaign)));
    setNotice({ tone: 'info', text: `${selected.month} a été réinitialisé avec le contenu validé du 13 août.` });
  };

  const downloadHtml = () => {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `suites-mine-${selected.id}.html`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice({ tone: 'ok', text: 'Le fichier HTML compatible Mailchimp a été téléchargé.' });
  };

  const addEvent = () => {
    const nextEvent: NewsletterEvent = {
      id: `event-${Date.now()}`,
      category: 'Événement',
      title: 'Nouvel événement',
      date: '',
      venue: '',
      description: '',
      url: '',
      sourceLabel: '',
      month: selected.month,
      sortDate: '',
    };
    patchCampaign({ events: [...selected.events, nextEvent] });
  };

  const addCatalogEvent = (event: AnnualEvent) => {
    setCampaigns((current) => current.map((campaign) => {
      if (campaign.id !== catalogTargetId || campaign.events.some((item) => item.id === event.id)) return campaign;
      return { ...campaign, events: [...campaign.events, clone(event)], status: 'DRAFT' } as NewsletterCampaign;
    }));
    const target = campaigns.find((campaign) => campaign.id === catalogTargetId);
    setNotice({ tone: 'ok', text: `${event.title} ajouté à la newsletter ${target?.month || ''}.` });
  };

  const persistBufferConfig = async (buffer: BufferConfig) => {
    const nextSetup = { ...setup, buffer };
    await api('/tenant/settings', { method: 'PATCH', body: JSON.stringify({ marketingSetup: nextSetup }) });
    setSetup(nextSetup);
  };

  const moveEvent = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= selected.events.length) return;
    const events = [...selected.events];
    [events[index], events[target]] = [events[target], events[index]];
    patchCampaign({ events });
  };

  return (
    <Guard>
      <AppShell>
        {documentOpen ? (
          <NewsletterDocumentEditor
            campaign={selected}
            setup={setup}
            patchCampaign={patchCampaign}
            patchEvent={patchEvent}
            addEvent={addEvent}
            removeEvent={(index) => patchCampaign({ events: selected.events.filter((_, i) => i !== index) })}
            onClose={() => setDocumentOpen(false)}
            onSave={saveDrafts}
            onPublish={createMailchimpDraft}
            busy={busy}
          />
        ) : null}
        {catalogOpen ? (
          <EventCatalogModal
            events={annualEvents}
            campaignNames={campaigns.map(({ id, month }) => ({ id, month }))}
            targetCampaignId={catalogTargetId}
            onTargetCampaign={setCatalogTargetId}
            selectedEventIds={new Set(campaigns.find((campaign) => campaign.id === catalogTargetId)?.events.map((event) => event.id) || [])}
            onAdd={addCatalogEvent}
            onSocial={(event) => { setSocialEvent(event); setBufferOpen(true); }}
            onClose={() => setCatalogOpen(false)}
          />
        ) : null}
        {bufferOpen ? (
          <BufferStudioModal
            api={api}
            initialConfig={setup.buffer}
            initialEvent={socialEvent}
            onPersistConfig={persistBufferConfig}
            onClose={() => { setBufferOpen(false); setSocialEvent(null); }}
          />
        ) : null}
        <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-slate-400">Marketing · Mailchimp</p>
            <h1 className="mt-1 text-3xl font-semibold">Studio newsletter Suites Mine</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Cinq campagnes 2026 — août, septembre, octobre, novembre et décembre — avec événements vérifiés, édition complète et
              aperçu fidèle au design Suites Mine. Le catalogue culturel couvre août à décembre et alimente aussi Buffer.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary text-sm" type="button" onClick={() => { setCatalogTargetId(selected.id); setCatalogOpen(true); }}>
              Catalogue événements
            </button>
            <button className="btn-secondary text-sm" type="button" onClick={() => { setSocialEvent(null); setBufferOpen(true); }}>
              Réseaux · Buffer
            </button>
            <button className="btn-secondary text-sm" type="button" onClick={downloadHtml}>
              Télécharger HTML
            </button>
            <button className="btn-secondary text-sm" type="button" onClick={saveDrafts} disabled={busy !== null}>
              {busy === 'save' ? 'Sauvegarde…' : 'Sauvegarder'}
            </button>
            <button className="btn-primary text-sm" type="button" onClick={createMailchimpDraft} disabled={busy !== null}>
              {busy === 'publish' ? 'Création…' : 'Créer dans Mailchimp'}
            </button>
          </div>
        </div>

        {notice ? <Notice notice={notice} /> : null}

        <section className="card mb-6 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Campagnes newsletter</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {campaigns.map((campaign) => (
                  <button
                    key={campaign.id}
                    type="button"
                    onClick={() => {
                      setCampaignId(campaign.id);
                      setDocumentOpen(true);
                    }}
                    className={`min-w-32 rounded-xl border px-5 py-3 text-sm font-semibold transition ${
                      campaign.id === campaignId
                        ? 'border-[#dfb85f] bg-[#dfb85f] text-[#17231e] shadow-lg shadow-[#dfb85f]/15'
                        : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
                    }`}
                  >
                    {campaign.month}
                    <span className="ml-2 text-[10px] font-medium uppercase opacity-65">{campaign.status}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex rounded-xl border border-white/10 bg-black/10 p-1">
              <ModeButton active={previewMode === 'desktop'} onClick={() => setPreviewMode('desktop')}>
                Bureau
              </ModeButton>
              <ModeButton active={previewMode === 'mobile'} onClick={() => setPreviewMode('mobile')}>
                Mobile
              </ModeButton>
            </div>
          </div>
        </section>

        <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_440px]">
          <section className="card min-w-0 p-4 sm:p-5">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Design email</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-100">{selected.headline}</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button
                  type="button"
                  className="rounded-lg bg-[#dfb85f] px-4 py-2 font-semibold text-[#17231e] shadow-lg shadow-[#dfb85f]/10"
                  onClick={() => setDocumentOpen(true)}
                >
                  Ouvrir l’éditeur document
                </button>
                <span className="rounded-lg bg-white/5 px-3 py-2 text-slate-300">{selected.sendWindow}</span>
                <span className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-emerald-200">
                  Vérifié {formatVerifiedDate(selected.lastVerified)}
                </span>
              </div>
            </div>
            <NewsletterPreview campaign={selected} setup={setup} mode={previewMode} />
          </section>

          <aside className="card overflow-hidden 2xl:sticky 2xl:top-24">
            <div className="border-b border-white/10 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Éditeur complet</p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 2xl:grid-cols-2">
                {(
                  [
                    ['contenu', 'Contenu'],
                    ['evenements', `Événements (${selected.events.length})`],
                    ['design', 'Design'],
                    ['mailchimp', 'Mailchimp'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPanel(key)}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                      panel === key ? 'bg-[color:var(--accent)] text-slate-950' : 'bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="max-h-[calc(100vh-230px)] min-h-[620px] overflow-y-auto p-5">
              {panel === 'contenu' ? (
                <ContentEditor campaign={selected} patchCampaign={patchCampaign} resetCampaign={resetCampaign} />
              ) : null}
              {panel === 'evenements' ? (
                <EventsEditor
                  events={selected.events}
                  patchEvent={patchEvent}
                  addEvent={addEvent}
                  removeEvent={(index) => patchCampaign({ events: selected.events.filter((_, i) => i !== index) })}
                  moveEvent={moveEvent}
                />
              ) : null}
              {panel === 'design' ? (
                <DesignEditor campaign={selected} setup={setup} patchCampaign={patchCampaign} setSetup={setSetup} />
              ) : null}
              {panel === 'mailchimp' ? (
                <MailchimpEditor setup={setup} setSetup={setSetup} testConnection={testConnection} busy={busy} />
              ) : null}
            </div>
          </aside>
        </div>
      </AppShell>
    </Guard>
  );
}

function NewsletterDocumentEditor({
  campaign,
  setup,
  patchCampaign,
  patchEvent,
  addEvent,
  removeEvent,
  onClose,
  onSave,
  onPublish,
  busy,
}: {
  campaign: NewsletterCampaign;
  setup: MailchimpSetup;
  patchCampaign: (patch: Partial<NewsletterCampaign>) => void;
  patchEvent: (index: number, patch: Partial<NewsletterEvent>) => void;
  addEvent: () => void;
  removeEvent: (index: number) => void;
  onClose: () => void;
  onSave: () => Promise<void>;
  onPublish: () => Promise<void>;
  busy: 'save' | 'test' | 'publish' | null;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: 'https',
          protocols: ['http', 'https', 'mailto'],
        },
      }),
    ],
    content: campaign.bodyHtml || paragraphsToRichHtml(campaign.body),
    editorProps: {
      attributes: {
        class: 'newsletter-doc-prose',
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      patchCampaign({
        bodyHtml: currentEditor.getHTML(),
        body: currentEditor.getText({ blockSeparator: '\n\n' }),
      });
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(campaign.bodyHtml || paragraphsToRichHtml(campaign.body), { emitUpdate: false });
    // The editor is deliberately reset only when a different newsletter is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.id, editor]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void onSave();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, onSave]);

  const setLink = () => {
    if (!editor) return;
    const previous = String(editor.getAttributes('link').href || '');
    const url = window.prompt('Adresse du lien', previous || 'https://');
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  const wordCount = editor?.getText().trim() ? editor.getText().trim().split(/\s+/).length : 0;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#e9ecef] text-[#202124]">
      <header className="flex min-h-16 items-center justify-between gap-4 border-b border-black/10 bg-[#152820] px-4 py-2 text-white shadow-sm sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm hover:bg-white/10">
            ← Retour
          </button>
          <div className="min-w-0 border-l border-white/15 pl-4">
            <input
              aria-label="Nom du document"
              className="w-full min-w-0 bg-transparent text-base font-semibold text-white outline-none sm:w-[360px]"
              value={`Suites Mine · ${campaign.month} 2026`}
              readOnly
            />
            <p className="mt-0.5 text-[11px] text-[#d7c6a3]">Brouillon enregistré automatiquement · Cmd/Ctrl + S pour sauvegarder</p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/10" onClick={onSave} disabled={busy !== null}>
            {busy === 'save' ? 'Sauvegarde…' : 'Sauvegarder'}
          </button>
          <button type="button" className="rounded-lg bg-[#dfb85f] px-4 py-2 text-sm font-semibold text-[#17231e]" onClick={onPublish} disabled={busy !== null}>
            {busy === 'publish' ? 'Création…' : 'Créer dans Mailchimp'}
          </button>
        </div>
      </header>

      <div className="flex min-h-14 flex-wrap items-center gap-1 border-b border-black/10 bg-white px-3 py-2 shadow-sm sm:px-6">
        <ToolbarButton label="Annuler" active={false} onClick={() => editor?.chain().focus().undo().run()} disabled={!editor?.can().undo()}>
          ↶
        </ToolbarButton>
        <ToolbarButton label="Rétablir" active={false} onClick={() => editor?.chain().focus().redo().run()} disabled={!editor?.can().redo()}>
          ↷
        </ToolbarButton>
        <span className="mx-2 h-7 w-px bg-black/10" />
        <select
          aria-label="Style du paragraphe"
          className="h-9 rounded-md border border-black/10 bg-white px-3 text-sm outline-none hover:bg-black/[0.03]"
          value={editor?.isActive('heading', { level: 2 }) ? 'h2' : editor?.isActive('heading', { level: 3 }) ? 'h3' : 'p'}
          onChange={(event) => {
            if (!editor) return;
            if (event.target.value === 'h2') editor.chain().focus().toggleHeading({ level: 2 }).run();
            else if (event.target.value === 'h3') editor.chain().focus().toggleHeading({ level: 3 }).run();
            else editor.chain().focus().setParagraph().run();
          }}
        >
          <option value="p">Texte normal</option>
          <option value="h2">Titre</option>
          <option value="h3">Sous-titre</option>
        </select>
        <span className="mx-2 h-7 w-px bg-black/10" />
        <ToolbarButton label="Gras" active={Boolean(editor?.isActive('bold'))} onClick={() => editor?.chain().focus().toggleBold().run()}>
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton label="Italique" active={Boolean(editor?.isActive('italic'))} onClick={() => editor?.chain().focus().toggleItalic().run()}>
          <em>I</em>
        </ToolbarButton>
        <ToolbarButton label="Souligné" active={Boolean(editor?.isActive('underline'))} onClick={() => editor?.chain().focus().toggleUnderline().run()}>
          <span className="underline">U</span>
        </ToolbarButton>
        <ToolbarButton label="Lien" active={Boolean(editor?.isActive('link'))} onClick={setLink}>
          🔗
        </ToolbarButton>
        <span className="mx-2 h-7 w-px bg-black/10" />
        <ToolbarButton label="Liste à puces" active={Boolean(editor?.isActive('bulletList'))} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          • Liste
        </ToolbarButton>
        <ToolbarButton label="Liste numérotée" active={Boolean(editor?.isActive('orderedList'))} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
          1. Liste
        </ToolbarButton>
        <ToolbarButton label="Citation" active={Boolean(editor?.isActive('blockquote'))} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
          “ ”
        </ToolbarButton>
        <span className="ml-auto hidden text-xs text-[#5f6368] md:block">{wordCount} mots</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-7 sm:px-8">
        <div className="mx-auto mb-4 max-w-[900px] rounded-lg border border-black/10 bg-white px-6 py-4 shadow-sm">
          <DocField label="Objet" value={campaign.subject} onChange={(subject) => patchCampaign({ subject })} />
          <DocField label="Préheader" value={campaign.preheader} onChange={(preheader) => patchCampaign({ preheader })} multiline />
        </div>

        <main className="mx-auto min-h-[1100px] max-w-[900px] bg-[#fffdf8] shadow-[0_3px_18px_rgba(0,0,0,0.16)]">
          <section className="grid min-h-[330px] md:grid-cols-2">
            <div className="flex flex-col justify-center px-12 py-12">
              <input
                className="w-full bg-transparent text-xs uppercase tracking-[0.28em] text-[#a77f39] outline-none"
                value={campaign.eyebrow}
                onChange={(event) => patchCampaign({ eyebrow: event.target.value })}
              />
              <textarea
                aria-label="Grand titre"
                className="mt-6 min-h-40 w-full resize-none bg-transparent font-serif text-5xl leading-[1.08] text-[#183129] outline-none"
                value={campaign.headline}
                onChange={(event) => patchCampaign({ headline: event.target.value })}
              />
            </div>
            <div className="relative min-h-80 bg-[#1a2c25]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={campaign.heroImage || setup.heroImage} alt="Suites Mine" className="absolute inset-0 h-full w-full object-cover" />
              <span className="absolute bottom-6 left-6 rounded-md bg-[#18251f]/95 px-4 py-2 text-xs uppercase tracking-[0.2em] text-[#e6c77d]">
                {campaign.month}
              </span>
            </div>
          </section>

          <section className="flex items-center justify-between gap-6 bg-[#152820] px-12 py-7 text-[#f4ead7]">
            <div>
              <p className="font-serif text-3xl font-semibold">Suites Mine</p>
              <p className="mt-2 text-[11px] uppercase tracking-[0.22em] text-[#d7c6a3]">Apart hotel cerca del Ángel</p>
            </div>
            <p className="text-right text-sm text-[#d7c6a3]">Cliquez directement dans le document pour écrire</p>
          </section>

          <section className="px-12 py-12">
            <div className="mb-6 flex items-center gap-3">
              <span className="rounded-full bg-[#a77f39]/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-[#8a682f]">{campaign.month}</span>
              <span className="text-xs text-[#716554]">Contenu principal — éditable</span>
            </div>
            <EditorContent editor={editor} className="newsletter-doc-editor" />
            <div className="mt-8 grid gap-3 rounded-xl border border-[#d8c8ad] bg-[#f8f0e2] p-5 sm:grid-cols-[220px_1fr]">
              <DocField label="Texte du bouton" value={campaign.cta} onChange={(cta) => patchCampaign({ cta })} />
              <DocField label="Lien du bouton" value={campaign.ctaUrl} onChange={(ctaUrl) => patchCampaign({ ctaUrl })} />
            </div>
          </section>

          <section className="border-t border-[#e3d7c3] bg-[#f7f0e4] px-12 py-12">
            <div className="mb-7 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[#a77f39]">Qué hacer en CDMX</p>
                <h2 className="mt-2 font-serif text-3xl text-[#203229]">Agenda de {campaign.month.toLowerCase()}</h2>
              </div>
              <button type="button" onClick={addEvent} className="rounded-lg bg-[#1f3a31] px-4 py-2 text-xs font-semibold text-white">
                + Ajouter
              </button>
            </div>
            <div className="space-y-4">
              {campaign.events.map((event, index) => (
                <article key={event.id} className="overflow-hidden rounded-xl border border-[#d8c8ad] bg-white">
                  {event.imageUrl ? (
                    <div className="border-b border-[#d8c8ad] bg-[#ece3d4]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={event.imageUrl} alt={`Affiche de ${event.title}`} className="h-72 w-full object-cover" />
                    </div>
                  ) : null}
                  <div className="p-5">
                    <div className="grid gap-4 sm:grid-cols-[140px_1fr_auto]">
                      <div>
                        <DocField label="Type" value={event.category} onChange={(category) => patchEvent(index, { category })} compact />
                        <DocField label="Date" value={event.date} onChange={(date) => patchEvent(index, { date })} compact />
                      </div>
                      <div>
                        <DocField label="Événement" value={event.title} onChange={(title) => patchEvent(index, { title })} compact prominent />
                        <DocField label="Lieu" value={event.venue} onChange={(venue) => patchEvent(index, { venue })} compact />
                        <DocField label="Description" value={event.description} onChange={(description) => patchEvent(index, { description })} multiline compact />
                        <DocField label="Source officielle" value={event.url} onChange={(url) => patchEvent(index, { url })} compact />
                        <DocField label="Photo / affiche (URL HTTPS)" value={event.imageUrl || ''} onChange={(imageUrl) => patchEvent(index, { imageUrl })} compact />
                      </div>
                      <button type="button" onClick={() => removeEvent(index)} className="h-8 rounded-md px-2 text-xs text-red-600 hover:bg-red-50">
                        Retirer
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <footer className="bg-[#152820] px-12 py-8 text-sm text-[#f4ead7]">
            <strong>Suites Mine</strong>
            <p className="mt-2 text-xs leading-6 text-[#d7c6a3]">{setup.address} · {setup.phone} · {setup.replyTo}</p>
          </footer>
        </main>
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  active,
  onClick,
  disabled,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      className={`h-9 min-w-9 rounded-md px-2 text-sm transition disabled:opacity-30 ${active ? 'bg-[#dce8e2] text-[#17352a]' : 'hover:bg-black/[0.05]'}`}
    >
      {children}
    </button>
  );
}

function DocField({
  label,
  value,
  onChange,
  multiline = false,
  compact = false,
  prominent = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  compact?: boolean;
  prominent?: boolean;
}) {
  const shared = `w-full border-0 border-b border-transparent bg-transparent outline-none transition hover:border-black/10 focus:border-[#a77f39] ${
    prominent ? 'font-serif text-xl text-[#203229]' : 'text-sm text-[#3d382f]'
  } ${compact ? 'py-1' : 'py-2'}`;
  return (
    <label className={`block ${compact ? 'mb-2' : 'mb-3 last:mb-0'}`}>
      <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a8175]">{label}</span>
      {multiline ? (
        <textarea className={`${shared} min-h-16 resize-y`} value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input className={shared} value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}

function ContentEditor({
  campaign,
  patchCampaign,
  resetCampaign,
}: {
  campaign: NewsletterCampaign;
  patchCampaign: (patch: Partial<NewsletterCampaign>) => void;
  resetCampaign: () => void;
}) {
  return (
    <div className="space-y-5">
      <EditorGroup title="Enveloppe email" description="Ces deux champs apparaissent dans la boîte de réception.">
        <Field label="Objet" value={campaign.subject} onChange={(subject) => patchCampaign({ subject })} maxLength={160} />
        <TextArea label="Préheader" value={campaign.preheader} onChange={(preheader) => patchCampaign({ preheader })} rows={3} />
      </EditorGroup>

      <EditorGroup title="Message" description="Tous les changements sont visibles immédiatement à gauche.">
        <Field label="Sur-titre" value={campaign.eyebrow} onChange={(eyebrow) => patchCampaign({ eyebrow })} />
        <Field label="Grand titre" value={campaign.headline} onChange={(headline) => patchCampaign({ headline })} />
        <TextArea label="Corps de la newsletter" value={campaign.body} onChange={(body) => patchCampaign({ body })} rows={12} />
        <p className="text-xs leading-5 text-slate-400">
          Variables autorisées : {'{{firstName}}'}, {'{{fullName}}'}, {'{{company}}'} et {'{{email}}'}.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Texte du bouton" value={campaign.cta} onChange={(cta) => patchCampaign({ cta })} />
          <Field label="Lien du bouton" value={campaign.ctaUrl} onChange={(ctaUrl) => patchCampaign({ ctaUrl })} />
        </div>
      </EditorGroup>

      <EditorGroup title="Brief interne" description="Invisible dans l’email, utile pour piloter la campagne.">
        <Field label="Fenêtre d’envoi" value={campaign.sendWindow} onChange={(sendWindow) => patchCampaign({ sendWindow })} />
        <TextArea label="Segment" value={campaign.segment} onChange={(segment) => patchCampaign({ segment })} rows={3} />
        <TextArea label="Objectif" value={campaign.goal} onChange={(goal) => patchCampaign({ goal })} rows={3} />
      </EditorGroup>

      <button className="w-full rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5" type="button" onClick={resetCampaign}>
        Restaurer le contenu validé
      </button>
    </div>
  );
}

function EventsEditor({
  events,
  patchEvent,
  addEvent,
  removeEvent,
  moveEvent,
}: {
  events: NewsletterEvent[];
  patchEvent: (index: number, patch: Partial<NewsletterEvent>) => void;
  addEvent: () => void;
  removeEvent: (index: number) => void;
  moveEvent: (index: number, direction: -1 | 1) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-100">Agenda culturel</h3>
        <p className="mt-1 text-xs leading-5 text-slate-400">Modifiez, réordonnez ou remplacez les événements et leur source officielle.</p>
      </div>
      {events.map((event, index) => (
        <details key={event.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4" open={index === 0}>
          <summary className="cursor-pointer list-none">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-100">{event.title || `Événement ${index + 1}`}</p>
                <p className="mt-1 truncate text-xs text-slate-400">{event.date || 'Date à compléter'}</p>
              </div>
              <span className="rounded-full bg-[#dfb85f]/10 px-2 py-1 text-[10px] uppercase text-[#e6c77d]">{event.category}</span>
            </div>
          </summary>
          <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
            {event.imageUrl ? (
              <div className="overflow-hidden rounded-lg border border-white/10 bg-slate-950/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={event.imageUrl} alt={`Affiche de ${event.title}`} className="h-48 w-full object-cover" />
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Catégorie" value={event.category} onChange={(category) => patchEvent(index, { category })} />
              <Field label="Date" value={event.date} onChange={(date) => patchEvent(index, { date })} />
            </div>
            <Field label="Titre" value={event.title} onChange={(title) => patchEvent(index, { title })} />
            <Field label="Lieu" value={event.venue} onChange={(venue) => patchEvent(index, { venue })} />
            <TextArea label="Description" value={event.description} onChange={(description) => patchEvent(index, { description })} rows={4} />
            <Field label="URL officielle" value={event.url} onChange={(url) => patchEvent(index, { url })} />
            <Field label="URL de la photo / affiche" value={event.imageUrl || ''} onChange={(imageUrl) => patchEvent(index, { imageUrl })} />
            <Field label="Nom de la source" value={event.sourceLabel} onChange={(sourceLabel) => patchEvent(index, { sourceLabel })} />
            <div className="flex gap-2">
              <button className="btn-secondary flex-1 text-xs" type="button" onClick={() => moveEvent(index, -1)} disabled={index === 0}>
                Monter
              </button>
              <button className="btn-secondary flex-1 text-xs" type="button" onClick={() => moveEvent(index, 1)} disabled={index === events.length - 1}>
                Descendre
              </button>
              <button className="rounded-lg border border-red-400/20 px-3 text-xs text-red-200 hover:bg-red-400/10" type="button" onClick={() => removeEvent(index)}>
                Retirer
              </button>
            </div>
          </div>
        </details>
      ))}
      <button className="btn-secondary w-full text-sm" type="button" onClick={addEvent}>
        + Ajouter un événement
      </button>
    </div>
  );
}

function DesignEditor({
  campaign,
  setup,
  patchCampaign,
  setSetup,
}: {
  campaign: NewsletterCampaign;
  setup: MailchimpSetup;
  patchCampaign: (patch: Partial<NewsletterCampaign>) => void;
  setSetup: React.Dispatch<React.SetStateAction<MailchimpSetup>>;
}) {
  return (
    <div className="space-y-5">
      <EditorGroup title="Image principale" description="Utilisez une image horizontale HTTPS, idéalement 1200 × 800 px.">
        <Field label="URL de l’image" value={campaign.heroImage} onChange={(heroImage) => patchCampaign({ heroImage })} />
      </EditorGroup>
      <EditorGroup title="Points forts" description="Les trois arguments affichés à côté du message.">
        {campaign.highlights.map((highlight, index) => (
          <Field
            key={`${index}-${highlight}`}
            label={`Point fort ${index + 1}`}
            value={highlight}
            onChange={(value) => {
              const highlights = [...campaign.highlights];
              highlights[index] = value;
              patchCampaign({ highlights });
            }}
          />
        ))}
      </EditorGroup>
      <EditorGroup title="Galerie" description="Photos communes aux trois campagnes.">
        {setup.gallery.map((image, index) => (
          <Field
            key={index}
            label={`Photo ${index + 1}`}
            value={image}
            onChange={(value) => {
              const gallery = [...setup.gallery];
              gallery[index] = value;
              setSetup((current) => ({ ...current, gallery }));
            }}
          />
        ))}
      </EditorGroup>
      <EditorGroup title="Coordonnées" description="Pied de page de chaque newsletter.">
        <Field label="Adresse" value={setup.address} onChange={(address) => setSetup((current) => ({ ...current, address }))} />
        <Field label="Téléphone" value={setup.phone} onChange={(phone) => setSetup((current) => ({ ...current, phone }))} />
        <Field label="Site" value={setup.websiteUrl} onChange={(websiteUrl) => setSetup((current) => ({ ...current, websiteUrl }))} />
      </EditorGroup>
    </div>
  );
}

function MailchimpEditor({
  setup,
  setSetup,
  testConnection,
  busy,
}: {
  setup: MailchimpSetup;
  setSetup: React.Dispatch<React.SetStateAction<MailchimpSetup>>;
  testConnection: () => Promise<void>;
  busy: 'save' | 'test' | 'publish' | null;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[#dfb85f]/20 bg-[#dfb85f]/5 p-4 text-xs leading-5 text-slate-300">
        Le bouton « Créer dans Mailchimp » génère une campagne brouillon avec le design complet. Aucun email n’est envoyé automatiquement.
      </div>
      <EditorGroup title="Compte Mailchimp" description="Les identifiants sont enregistrés dans les paramètres du workspace.">
        <Field label="Nom du compte" value={setup.accountLabel} onChange={(accountLabel) => setSetup((current) => ({ ...current, accountLabel }))} />
        <Field
          label="Clé API"
          type="password"
          value={setup.mailchimp.apiKey}
          onChange={(apiKey) => setSetup((current) => ({ ...current, mailchimp: { ...current.mailchimp, apiKey } }))}
          placeholder="••••••••••••••••-us21"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Préfixe serveur"
            value={setup.mailchimp.serverPrefix}
            onChange={(serverPrefix) => setSetup((current) => ({ ...current, mailchimp: { ...current.mailchimp, serverPrefix } }))}
            placeholder="us21"
          />
          <Field
            label="Audience ID"
            value={setup.mailchimp.audienceId}
            onChange={(audienceId) => setSetup((current) => ({ ...current, mailchimp: { ...current.mailchimp, audienceId } }))}
          />
        </div>
      </EditorGroup>
      <EditorGroup title="Expéditeur" description="Mailchimp doit avoir vérifié le domaine de cette adresse.">
        <Field label="Nom" value={setup.fromName} onChange={(fromName) => setSetup((current) => ({ ...current, fromName }))} />
        <Field label="Email" value={setup.fromEmail} onChange={(fromEmail) => setSetup((current) => ({ ...current, fromEmail }))} />
        <Field label="Répondre à" value={setup.replyTo} onChange={(replyTo) => setSetup((current) => ({ ...current, replyTo }))} />
      </EditorGroup>
      <button className="btn-secondary w-full text-sm" type="button" onClick={testConnection} disabled={busy !== null}>
        {busy === 'test' ? 'Test en cours…' : 'Tester et sauvegarder la connexion'}
      </button>
    </div>
  );
}

function NewsletterPreview({ campaign, setup, mode }: { campaign: NewsletterCampaign; setup: MailchimpSetup; mode: PreviewMode }) {
  const isMobile = mode === 'mobile';
  const richBody = previewMergeTags(sanitizeRichHtml(campaign.bodyHtml || paragraphsToRichHtml(campaign.body)));

  return (
    <div className="overflow-auto rounded-xl border border-[#d6c8ad] bg-[#efe7d8] p-3 sm:p-5">
      <div
        className={`mx-auto overflow-hidden rounded-lg bg-[#fbf8f1] text-[#1d1a16] shadow-2xl shadow-black/20 transition-all ${
          isMobile ? 'max-w-[390px]' : 'max-w-[820px]'
        }`}
      >
        <div className={isMobile ? '' : 'grid md:grid-cols-2'}>
          <div className="flex min-h-72 flex-col justify-center px-8 py-9">
            <p className="text-xs uppercase tracking-[0.28em] text-[#a77f39]">Suites Mine</p>
            <h2 className="mt-6 font-serif text-[42px] leading-[1.08] tracking-normal text-[#183129]">{campaign.headline}</h2>
            <p className="mt-6 text-[15px] leading-7 text-[#716554]">{campaign.preheader}</p>
          </div>
          <div className="relative min-h-72 bg-[#1a2c25]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={campaign.heroImage || setup.heroImage} alt="Suites Mine" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
            <span className="absolute bottom-5 left-5 rounded-md bg-[#18251f]/95 px-4 py-2 text-xs uppercase tracking-[0.2em] text-[#e6c77d]">
              {campaign.month}
            </span>
          </div>
        </div>

        <div className={`bg-[#152820] px-8 py-6 text-[#f4ead7] ${isMobile ? '' : 'flex items-center justify-between gap-6'}`}>
          <div>
            <p className="font-serif text-3xl font-semibold">Suites Mine</p>
            <p className="mt-2 text-[11px] uppercase tracking-[0.22em] text-[#d7c6a3]">Apart hotel cerca del Ángel</p>
          </div>
          <p className={`max-w-sm text-sm leading-6 text-[#d7c6a3] ${isMobile ? 'mt-4' : 'text-right'}`}>{campaign.eyebrow}</p>
        </div>

        <div className={isMobile ? '' : 'grid md:grid-cols-[minmax(0,1fr)_230px]'}>
          <main className="px-8 py-9">
            <p className="text-xs uppercase tracking-[0.2em] text-[#a77f39]">{campaign.month}</p>
            <h3 className="mt-3 font-serif text-3xl leading-tight text-[#203229]">{campaign.subject}</h3>
            <div
              className="newsletter-preview-rich mt-6 text-[15px] leading-7 text-[#4c453b]"
              dangerouslySetInnerHTML={{ __html: richBody }}
            />
            <a href={campaign.ctaUrl || setup.reservationUrl} className="mt-7 inline-block rounded-md bg-[#1f3a31] px-6 py-3 text-sm font-semibold text-white">
              {campaign.cta}
            </a>
          </main>
          <aside className={`bg-[#f3ead9] px-6 py-8 ${isMobile ? 'border-t border-[#e3d7c3]' : 'border-l border-[#e3d7c3]'}`}>
            <p className="text-xs uppercase tracking-[0.2em] text-[#a77f39]">Incluye</p>
            <div className="mt-4 space-y-3">
              {campaign.highlights.map((item) => (
                <div key={item} className="rounded-md border border-[#d8c8ad] bg-white/55 p-3 text-sm leading-5 text-[#3d382f]">
                  {item}
                </div>
              ))}
            </div>
          </aside>
        </div>

        <section className="border-t border-[#e3d7c3] bg-[#fffdf8] px-8 py-9">
          <p className="text-xs uppercase tracking-[0.2em] text-[#a77f39]">Qué hacer en CDMX</p>
          <h3 className="mt-2 font-serif text-3xl text-[#203229]">Agenda seleccionada para {campaign.month.toLowerCase()}</h3>
          <div className={`mt-6 grid gap-4 ${!isMobile && campaign.events.length > 1 ? 'sm:grid-cols-2' : ''}`}>
            {campaign.events.map((event) => (
              <article key={event.id} className="overflow-hidden rounded-lg border border-[#ded1bc] bg-[#f8f0e2]">
                {event.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={event.imageUrl} alt={`Affiche de ${event.title}`} className="h-40 w-full object-cover" />
                ) : null}
                <div className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#98743a]">{event.category}</span>
                  <span className="text-right text-xs text-[#716554]">{event.date}</span>
                </div>
                <h4 className="mt-3 font-serif text-xl text-[#203229]">{event.title}</h4>
                <p className="mt-1 text-xs font-semibold text-[#6b5d49]">{event.venue}</p>
                <p className="mt-3 text-sm leading-6 text-[#5b5247]">{event.description}</p>
                {event.url ? (
                  <a href={event.url} className="mt-4 inline-block text-xs font-semibold text-[#1f3a31] underline decoration-[#b5904e] underline-offset-4">
                    Vérifier sur {event.sourceLabel || 'le site officiel'}
                  </a>
                ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="border-t border-[#e3d7c3] bg-[#f7f0e4] px-8 py-8">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {setup.gallery.map((image, index) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={`${image}-${index}`} src={image} alt={`Suites Mine ${index + 1}`} className="h-28 w-full rounded-lg border border-[#d8c8ad] object-cover" />
            ))}
          </div>
        </section>

        <footer className="bg-[#152820] px-8 py-7 text-sm text-[#f4ead7]">
          <div className={isMobile ? '' : 'flex items-center justify-between gap-4'}>
            <div>
              <p className="font-semibold">Suites Mine</p>
              <p className="mt-1 text-xs text-[#d7c6a3]">{setup.address}</p>
            </div>
            <div className={`text-xs text-[#d7c6a3] ${isMobile ? 'mt-3' : 'text-right'}`}>
              <p>{setup.phone}</p>
              <p>{setup.replyTo}</p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

function buildMailchimpHtml(campaign: NewsletterCampaign, setup: MailchimpSetup) {
  const richContent = styleEmailRichHtml(
    sanitizeRichHtml(toMailchimpText(campaign.bodyHtml || paragraphsToRichHtml(campaign.body))),
  );
  const highlights = campaign.highlights
    .map((item) => `<div style="margin:0 0 10px;border:1px solid #d8c8ad;background:#fffaf0;padding:13px;border-radius:7px;color:#3d382f;font-size:14px;line-height:1.5;">${escapeHtml(item)}</div>`)
    .join('');
  const events = campaign.events
    .map(
      (event) => `<tr><td style="padding:8px 0;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #ded1bc;background:#f8f0e2;border-radius:8px;">${event.imageUrl ? `<tr><td><img src="${escapeHtml(event.imageUrl)}" alt="${escapeHtml(event.title)}" width="612" style="display:block;width:100%;height:auto;border:0;border-radius:8px 8px 0 0;" /></td></tr>` : ''}<tr><td style="padding:20px;"><div style="color:#98743a;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;">${escapeHtml(event.category)} · ${escapeHtml(event.date)}</div><h3 style="margin:10px 0 5px;font-family:Georgia,serif;font-size:22px;color:#203229;">${escapeHtml(event.title)}</h3><div style="color:#6b5d49;font-size:12px;font-weight:700;">${escapeHtml(event.venue)}</div><p style="margin:12px 0;color:#5b5247;font-size:14px;line-height:1.6;">${escapeHtml(event.description)}</p>${event.url ? `<a href="${escapeHtml(event.url)}" style="color:#1f3a31;font-size:12px;font-weight:700;">Verificar en ${escapeHtml(event.sourceLabel || 'sitio oficial')}</a>` : ''}</td></tr></table></td></tr>`,
    )
    .join('');
  const gallery = setup.gallery
    .slice(0, 4)
    .map((image) => `<td width="25%" style="padding:4px;"><img src="${escapeHtml(image)}" alt="Suites Mine" width="145" style="display:block;width:100%;height:auto;border:0;border-radius:7px;" /></td>`)
    .join('');

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(campaign.subject)}</title>
  <style>@media only screen and (max-width:620px){.email-shell{width:100%!important}.stack{display:block!important;width:100%!important}.hero-title{font-size:34px!important}.pad{padding-left:22px!important;padding-right:22px!important}}</style>
</head>
<body style="margin:0;background:#efe7d8;font-family:Arial,Helvetica,sans-serif;color:#1d1a16;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(campaign.preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#efe7d8;padding:26px 10px;"><tr><td align="center">
    <table class="email-shell" role="presentation" width="680" cellspacing="0" cellpadding="0" style="max-width:680px;width:100%;background:#fbf8f1;border:1px solid #d6c8ad;border-radius:10px;overflow:hidden;">
      <tr><td class="stack pad" width="50%" valign="middle" style="padding:36px 32px;"><div style="color:#a77f39;font-size:11px;text-transform:uppercase;letter-spacing:3px;">Suites Mine</div><h1 class="hero-title" style="margin:22px 0 18px;font-family:Georgia,serif;font-size:42px;line-height:1.08;color:#183129;">${escapeHtml(campaign.headline)}</h1><p style="margin:0;color:#716554;font-size:15px;line-height:1.7;">${escapeHtml(campaign.preheader)}</p></td><td class="stack" width="50%" valign="middle"><img src="${escapeHtml(campaign.heroImage || setup.heroImage)}" alt="Suites Mine" width="340" style="display:block;width:100%;height:auto;border:0;" /></td></tr>
      <tr><td colspan="2" style="background:#152820;color:#f4ead7;padding:24px 32px;"><div style="font-family:Georgia,serif;font-size:28px;font-weight:700;">Suites Mine</div><div style="margin-top:7px;color:#d7c6a3;font-size:11px;text-transform:uppercase;letter-spacing:2px;">Apart hotel cerca del Ángel · ${escapeHtml(campaign.eyebrow)}</div></td></tr>
      <tr><td class="stack pad" width="67%" valign="top" style="padding:34px;"><div style="color:#a77f39;font-size:11px;text-transform:uppercase;letter-spacing:2px;">${escapeHtml(campaign.month)}</div><h2 style="margin:12px 0 24px;font-family:Georgia,serif;font-size:30px;line-height:1.2;color:#203229;">${escapeHtml(campaign.subject)}</h2>${richContent}<a href="${escapeHtml(campaign.ctaUrl || setup.reservationUrl)}" style="display:inline-block;margin-top:8px;background:#1f3a31;color:#fff;text-decoration:none;padding:14px 22px;border-radius:7px;font-weight:700;font-size:14px;">${escapeHtml(campaign.cta)}</a></td><td class="stack pad" width="33%" valign="top" style="background:#f3ead9;padding:34px 22px;"><div style="margin-bottom:15px;color:#a77f39;font-size:11px;text-transform:uppercase;letter-spacing:2px;">Incluye</div>${highlights}</td></tr>
      <tr><td colspan="2" class="pad" style="border-top:1px solid #e3d7c3;background:#fffdf8;padding:34px;"><div style="color:#a77f39;font-size:11px;text-transform:uppercase;letter-spacing:2px;">Qué hacer en CDMX</div><h2 style="margin:10px 0 20px;font-family:Georgia,serif;font-size:28px;color:#203229;">Agenda seleccionada para ${escapeHtml(campaign.month.toLowerCase())}</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${events}</table></td></tr>
      <tr><td colspan="2" class="pad" style="border-top:1px solid #e3d7c3;background:#f7f0e4;padding:28px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>${gallery}</tr></table></td></tr>
      <tr><td colspan="2" class="pad" style="background:#152820;color:#f4ead7;padding:25px 32px;font-size:13px;line-height:1.7;"><strong>Suites Mine</strong><br />${escapeHtml(setup.address)}<br />${escapeHtml(setup.phone)} · <a href="${escapeHtml(setup.websiteUrl)}" style="color:#e6c77d;">${escapeHtml(setup.websiteUrl)}</a><br /><span style="color:#d7c6a3;">*|HTML:LIST_ADDRESS_HTML|* · <a href="*|UNSUB|*" style="color:#d7c6a3;">Cancelar suscripción</a></span></td></tr>
    </table>
  </td></tr></table>
</body>
</html>`;
}

function toMailchimpText(value: string) {
  return value
    .replace(/\{\{\s*firstName\s*\}\}/g, '*|FNAME|*')
    .replace(/\{\{\s*fullName\s*\}\}/g, '*|FNAME|* *|LNAME|*')
    .replace(/\{\{\s*company\s*\}\}/g, '*|COMPANY|*')
    .replace(/\{\{\s*email\s*\}\}/g, '*|EMAIL|*');
}

function paragraphsToRichHtml(value: string) {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
    .join('');
}

function sanitizeRichHtml(raw: string) {
  const allowed = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'a', 'code', 'pre']);
  const withoutDangerousBlocks = raw
    .replace(/<!--([\s\S]*?)-->/g, '')
    .replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, '');

  return withoutDangerousBlocks.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (match, rawTag: string, rawAttributes: string) => {
    const tag = rawTag.toLowerCase();
    if (!allowed.has(tag)) return '';
    if (match.startsWith('</')) return tag === 'br' ? '' : `</${tag}>`;
    if (tag === 'br') return '<br />';
    if (tag !== 'a') return `<${tag}>`;

    const hrefMatch = rawAttributes.match(/href\s*=\s*["']([^"']+)["']/i);
    const href = hrefMatch?.[1]?.trim() || '';
    if (!/^(https?:\/\/|mailto:)/i.test(href)) return '<a>';
    return `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">`;
  });
}

function styleEmailRichHtml(value: string) {
  return value
    .replaceAll('<p>', '<p style="margin:0 0 18px;color:#4c453b;font-size:15px;line-height:1.75;">')
    .replaceAll('<h2>', '<h2 style="margin:24px 0 12px;font-family:Georgia,serif;font-size:24px;color:#203229;">')
    .replaceAll('<h3>', '<h3 style="margin:20px 0 10px;font-family:Georgia,serif;font-size:19px;color:#203229;">')
    .replaceAll('<ul>', '<ul style="margin:0 0 18px;padding-left:24px;color:#4c453b;font-size:15px;line-height:1.75;">')
    .replaceAll('<ol>', '<ol style="margin:0 0 18px;padding-left:24px;color:#4c453b;font-size:15px;line-height:1.75;">')
    .replaceAll('<blockquote>', '<blockquote style="margin:20px 0;padding:12px 18px;border-left:3px solid #a77f39;background:#f8f0e2;color:#5b5247;">')
    .replace(/<a href="([^"]+)" target="_blank" rel="noreferrer">/g, '<a href="$1" style="color:#1f3a31;text-decoration:underline;">');
}

function previewMergeTags(value: string) {
  return value
    .replace(/\{\{\s*firstName\s*\}\}/g, 'María')
    .replace(/\{\{\s*fullName\s*\}\}/g, 'María García')
    .replace(/\{\{\s*company\s*\}\}/g, 'tu empresa')
    .replace(/\{\{\s*email\s*\}\}/g, 'maria@ejemplo.com');
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  type?: 'text' | 'password';
}) {
  return (
    <label className="block text-sm text-slate-300">
      <span className="flex items-center justify-between gap-3">
        {label}
        {maxLength ? <span className="text-[10px] text-slate-500">{value.length}/{maxLength}</span> : null}
      </span>
      <input
        className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-[color:var(--accent)]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        type={type}
      />
    </label>
  );
}

function TextArea({ label, value, onChange, rows }: { label: string; value: string; onChange: (value: string) => void; rows: number }) {
  return (
    <label className="block text-sm text-slate-300">
      {label}
      <textarea
        className="mt-2 w-full resize-y rounded-lg border border-white/10 bg-slate-950/50 p-3 text-sm leading-6 text-slate-100 outline-none focus:border-[color:var(--accent)]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
      />
    </label>
  );
}

function EditorGroup({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.025] p-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
      </div>
      {children}
    </section>
  );
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-xs font-semibold ${active ? 'bg-white/10 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
    >
      {children}
    </button>
  );
}

function Notice({ notice }: { notice: { tone: 'ok' | 'error' | 'info'; text: string } }) {
  const href = notice.text.match(/https:\/\/\S+/)?.[0];
  const label = href ? notice.text.replace(href, '').trim() : notice.text;
  return (
    <div
      className={`mb-5 rounded-xl border p-4 text-sm ${
        notice.tone === 'error'
          ? 'border-red-400/20 bg-red-400/10 text-red-100'
          : notice.tone === 'ok'
            ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100'
            : 'border-sky-400/20 bg-sky-400/10 text-sky-100'
      }`}
    >
      {label}{' '}
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-4">
          Ouvrir Mailchimp
        </a>
      ) : null}
    </div>
  );
}

function formatVerifiedDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || 'à confirmer';
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`));
}

function messageFromError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function hydrateCampaigns(value: unknown): NewsletterCampaign[] {
  if (!Array.isArray(value)) return [];
  return value.map((rawCampaign) => {
    const campaign = rawCampaign as NewsletterCampaign;
    return {
      ...campaign,
      events: Array.isArray(campaign.events)
        ? campaign.events.map((event) => {
            const catalogEvent = annualEvents.find((item) => item.id === event.id);
            return {
              ...(catalogEvent || {}),
              ...event,
              month: event.month || catalogEvent?.month || campaign.month,
              sortDate: event.sortDate || catalogEvent?.sortDate || '',
              imageUrl: event.imageUrl || catalogEvent?.imageUrl,
              posterUrl: event.posterUrl || catalogEvent?.posterUrl || event.url,
            } as NewsletterEvent;
          })
        : [],
    };
  });
}

function mergeCampaignsWithSeed(value: unknown): NewsletterCampaign[] {
  const defaults = hydrateCampaigns(clone(seed.campaigns));
  const saved = hydrateCampaigns(value);
  return defaults.map((template) => {
    const draft = saved.find((campaign) => campaign.id === template.id);
    if (!draft) return template;
    return {
      ...template,
      ...draft,
      events: draft.events?.length ? draft.events : template.events,
      mailchimp: { ...template.mailchimp, ...draft.mailchimp },
    } as NewsletterCampaign;
  });
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
