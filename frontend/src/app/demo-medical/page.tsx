'use client';

import { useMemo, useState } from 'react';

const patients = [
  { name: 'Sofia Martin', need: 'Implantologie', stage: 'Plan accepte', value: 4200, score: 92, next: 'Devis a signer' },
  { name: 'Marc Delorme', need: 'Bilan cardio', stage: 'Rappel 24h', value: 780, score: 78, next: 'SMS automatique' },
  { name: 'Lea Conti', need: 'Orthodontie', stage: 'Consultation', value: 3100, score: 84, next: 'Photos intra-orales' },
  { name: 'Nora Bensaid', need: 'Suivi diabetologie', stage: 'Fidelisation', value: 460, score: 67, next: 'Controle trimestriel' },
];

const stages = [
  { label: 'Demandes patients', count: 18, amount: '42k', color: '#38bdf8' },
  { label: 'Consultations', count: 11, amount: '31k', color: '#34d399' },
  { label: 'Plans proposes', count: 7, amount: '26k', color: '#f59e0b' },
  { label: 'Traitements', count: 9, amount: '58k', color: '#fb7185' },
];

const agenda = [
  ['09:00', 'Bilan initial', 'Sofia Martin', 'Salle 2'],
  ['10:30', 'Teleconsultation', 'Marc Delorme', 'Visio'],
  ['14:00', 'Plan de traitement', 'Lea Conti', 'Salle 1'],
  ['16:15', 'Controle post-soin', 'Nora Bensaid', 'Salle 3'],
];

const views = {
  'Tableau clinique': {
    title: 'Cabinet medical, pipeline patient et revenus en un seul ecran.',
    summary: 'Vue dirigeant pour suivre activite, soins, relances et risque de no-show.',
    cards: ['146 patients actifs', '8 540 EUR de soins potentiels', '6% no-show risque'],
  },
  Patients: {
    title: 'Dossiers patients, priorites et suivis de soin.',
    summary: 'Chaque patient garde son besoin, son score, sa prochaine action et son parcours clinique.',
    cards: ['42 nouveaux dossiers', '18 consentements a signer', '11 relances post-consultation'],
  },
  Agenda: {
    title: 'Agenda cabinet avec rappels automatiques.',
    summary: 'Consultations, visio, salles et rappels SMS sont regroupes pour eviter les trous dans la journee.',
    cards: ['4 rendez-vous aujourd hui', '2 salles optimisees', '1 visio planifiee'],
  },
  'Pipeline soins': {
    title: 'Pipeline de soins, du premier contact au traitement.',
    summary: 'Le cabinet voit ou chaque patient bloque: consultation, plan propose, devis, traitement.',
    cards: ['18 demandes patients', '7 plans proposes', '9 traitements en cours'],
  },
  Facturation: {
    title: 'Facturation medicale et plans de paiement.',
    summary: 'Suivi simple des devis, acomptes, paiements restants et revenus attendus.',
    cards: ['4 200 EUR devis prioritaire', '3 paiements attendus', '780 EUR relance assurance'],
  },
  'IA medicale': {
    title: 'IA de relance patient et priorisation cabinet.',
    summary: 'Suggestions de relance, risque d absence, dossier incomplet et prochain meilleur message.',
    cards: ['Sofia: devis a signer', 'Marc: SMS J-1', 'Nora: controle trimestriel'],
  },
  Pilotage: {
    title: 'Pilotage cabinet pour gerant et equipe medicale.',
    summary: 'Occupation, conversion, revenus par parcours et charge operationnelle en temps reel.',
    cards: ['84% occupation agenda', '31k EUR en consultation', '92/100 meilleur score patient'],
  },
};

function money(value: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
}

export default function MedicalDemoPage() {
  const [selected, setSelected] = useState(patients[0]);
  const [activeView, setActiveView] = useState<keyof typeof views>('Tableau clinique');
  const total = useMemo(() => patients.reduce((sum, patient) => sum + patient.value, 0), []);
  const nav = Object.keys(views) as Array<keyof typeof views>;
  const view = views[activeView];

  return (
    <main className="min-h-screen bg-[#f7faf9] text-[#10231f]">
      <header className="sticky top-0 z-20 border-b border-[#d8e5e0] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-5 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-lg bg-[#10231f] text-sm font-black text-[#34d399]">
              o7
            </div>
            <div>
              <div className="font-semibold leading-tight">Clinique o7 Medical</div>
              <div className="text-xs text-[#58706a]">CRM patients - demo</div>
            </div>
          </div>
          <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex">
            {nav.map((item) => (
              <button
                key={item}
                onClick={() => setActiveView(item)}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                  activeView === item ? 'bg-[#e7f7f2] text-[#14745f]' : 'text-[#58706a] hover:bg-[#f0f7f4]'
                }`}
                type="button"
              >
                {item}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button
              className="rounded-lg border border-[#d8e5e0] bg-white px-3 py-2 text-sm font-semibold text-[#14745f]"
              onClick={() => setActiveView('Patients')}
              type="button"
            >
              + Patient
            </button>
            <button
              className="rounded-lg bg-[#34d399] px-3 py-2 text-sm font-semibold text-[#10231f]"
              onClick={() => setActiveView('Agenda')}
              type="button"
            >
              Nouvelle consultation
            </button>
          </div>
        </div>
      </header>

      <section className="border-b border-[#d8e5e0] bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1f8a70]">o7 PulseCRM Medical Demo</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal text-[#10231f] md:text-5xl">
              {view.title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-[#58706a]">{view.summary}</p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              ['Patients actifs', '146'],
              ['CA potentiel', money(total)],
              ['No-show risque', '6%'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-[#d8e5e0] bg-[#f7faf9] px-4 py-3">
                <div className="text-lg font-semibold">{value}</div>
                <div className="text-xs text-[#58706a]">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-5 py-5 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            {view.cards.map((card) => (
              <div key={card} className="rounded-lg border border-[#d8e5e0] bg-[#10231f] px-4 py-3 text-sm font-semibold text-white shadow-sm">
                {card}
              </div>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            {stages.map((stage) => (
              <div key={stage.label} className="rounded-lg border border-[#d8e5e0] bg-white p-4 shadow-sm">
                <div className="mb-4 h-1.5 rounded-full" style={{ backgroundColor: stage.color }} />
                <div className="text-2xl font-semibold">{stage.count}</div>
                <div className="text-sm font-medium">{stage.label}</div>
                <div className="mt-2 text-xs text-[#58706a]">{stage.amount} EUR parcours de soin</div>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-[#d8e5e0] bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-[#edf3f1] px-4 py-3">
              <h2 className="text-lg font-semibold">Pipeline parcours patients</h2>
              <span className="rounded-full bg-[#e7f7f2] px-3 py-1 text-xs font-semibold text-[#14745f]">Cabinet live</span>
            </div>
            <div className="divide-y divide-[#edf3f1]">
              {patients.map((patient) => (
                <button
                  key={patient.name}
                  onClick={() => setSelected(patient)}
                  className={`grid w-full gap-3 px-4 py-4 text-left transition md:grid-cols-[1.2fr_1fr_0.8fr_0.7fr] ${
                    selected.name === patient.name ? 'bg-[#f0fbf7]' : 'hover:bg-[#fafdfc]'
                  }`}
                >
                  <div>
                    <div className="font-semibold">{patient.name}</div>
                    <div className="text-sm text-[#58706a]">{patient.need}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium">{patient.stage}</div>
                    <div className="text-xs text-[#58706a]">{patient.next}</div>
                  </div>
                  <div className="text-sm font-semibold">{money(patient.value)}</div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-[#dce9e5]">
                      <div className="h-2 rounded-full bg-[#1f8a70]" style={{ width: `${patient.score}%` }} />
                    </div>
                    <span className="text-xs font-semibold">{patient.score}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg border border-[#d8e5e0] bg-[#10231f] p-5 text-white shadow-sm">
            <div className="text-sm text-[#a9c8bf]">Dossier prioritaire</div>
            <h2 className="mt-1 text-2xl font-semibold">{selected.name}</h2>
            <p className="mt-2 text-sm text-[#c6ddd6]">{selected.need} - {selected.stage}</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-white/10 p-3">
                <div className="text-xs text-[#a9c8bf]">Valeur</div>
                <div className="text-lg font-semibold">{money(selected.value)}</div>
              </div>
              <div className="rounded-lg bg-white/10 p-3">
                <div className="text-xs text-[#a9c8bf]">Score IA</div>
                <div className="text-lg font-semibold">{selected.score}/100</div>
              </div>
            </div>
            <button className="mt-5 w-full rounded-lg bg-[#34d399] px-4 py-3 text-sm font-semibold text-[#10231f]">
              Preparer relance patient
            </button>
          </div>

          <div className="rounded-lg border border-[#d8e5e0] bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Agenda du jour</h2>
            <div className="mt-3 space-y-3">
              {agenda.map(([time, type, name, room]) => (
                <div key={`${time}-${name}`} className="grid grid-cols-[54px_1fr_auto] gap-3 rounded-lg bg-[#f7faf9] p-3">
                  <div className="text-sm font-semibold text-[#14745f]">{time}</div>
                  <div>
                    <div className="text-sm font-medium">{type}</div>
                    <div className="text-xs text-[#58706a]">{name}</div>
                  </div>
                  <div className="text-xs font-semibold text-[#58706a]">{room}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-[#d8e5e0] bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Automations patients</h2>
            <div className="mt-3 grid gap-2 text-sm">
              {['Rappel SMS J-1', 'Email devis non signe', 'Relance soin post-operatoire', 'Alerte dossier incomplet'].map((item) => (
                <div key={item} className="flex items-center justify-between rounded-lg bg-[#f7faf9] px-3 py-2">
                  <span>{item}</span>
                  <span className="text-xs font-semibold text-[#14745f]">Actif</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
