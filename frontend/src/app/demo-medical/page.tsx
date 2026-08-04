'use client';

import { useMemo, useState } from 'react';

type View = 'Tableau clinique' | 'Patients' | 'Agenda' | 'Pipeline soins' | 'Facturation' | 'IA medicale' | 'Pilotage';

const views: View[] = ['Tableau clinique', 'Patients', 'Agenda', 'Pipeline soins', 'Facturation', 'IA medicale', 'Pilotage'];

const patients = [
  { name: 'Sofia Martin', age: 42, need: 'Implantologie', stage: 'Plan accepte', value: 4200, score: 92, next: 'Devis a signer', doctor: 'Dr Ramos', status: 'Prioritaire' },
  { name: 'Marc Delorme', age: 58, need: 'Bilan cardio', stage: 'Rappel 24h', value: 780, score: 78, next: 'SMS automatique', doctor: 'Dr Chen', status: 'Risque absence' },
  { name: 'Lea Conti', age: 16, need: 'Orthodontie', stage: 'Consultation', value: 3100, score: 84, next: 'Photos intra-orales', doctor: 'Dr Ramos', status: 'Dossier incomplet' },
  { name: 'Nora Bensaid', age: 63, need: 'Suivi diabetologie', stage: 'Fidelisation', value: 460, score: 67, next: 'Controle trimestriel', doctor: 'Dr Alvarez', status: 'Suivi long' },
];

const agenda = [
  ['09:00', 'Bilan initial', 'Sofia Martin', 'Salle 2', 'Confirme'],
  ['10:30', 'Teleconsultation', 'Marc Delorme', 'Visio', 'SMS envoye'],
  ['14:00', 'Plan de traitement', 'Lea Conti', 'Salle 1', 'A preparer'],
  ['16:15', 'Controle post-soin', 'Nora Bensaid', 'Salle 3', 'Confirme'],
];

const pipeline = [
  { title: 'Demandes', color: '#38bdf8', items: ['Sofia Martin - implant', 'Daniel Ruiz - scanner', 'Ana Lopes - blanchiment'] },
  { title: 'Consultation', color: '#34d399', items: ['Lea Conti - ortho', 'Marc Delorme - cardio'] },
  { title: 'Plan propose', color: '#f59e0b', items: ['Sofia Martin - 4 200 EUR', 'Paul Renard - 1 850 EUR'] },
  { title: 'Traitement', color: '#fb7185', items: ['Nora Bensaid - suivi', 'Mina Torres - post-soin'] },
];

function money(value: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#d8e5e0] bg-white p-4 shadow-sm">
      <div className="text-2xl font-semibold text-[#10231f]">{value}</div>
      <div className="mt-1 text-xs font-medium text-[#58706a]">{label}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-[#d8e5e0] bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function MedicalDemoPage() {
  const [activeView, setActiveView] = useState<View>('Tableau clinique');
  const [selected, setSelected] = useState(patients[0]);
  const total = useMemo(() => patients.reduce((sum, patient) => sum + patient.value, 0), []);

  return (
    <main className="min-h-screen bg-[#f7faf9] text-[#10231f]">
      <header className="sticky top-0 z-20 border-b border-[#d8e5e0] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-5 px-5 py-4">
          <button className="flex items-center gap-3 text-left" onClick={() => setActiveView('Tableau clinique')} type="button">
            <div className="grid h-12 w-12 place-items-center rounded-lg bg-[#10231f] text-sm font-black text-[#34d399]">o7</div>
            <div>
              <div className="font-semibold leading-tight">Clinique o7 Medical</div>
              <div className="text-xs text-[#58706a]">CRM patients - demo</div>
            </div>
          </button>
          <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex">
            {views.map((item) => (
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
            <button className="rounded-lg border border-[#d8e5e0] bg-white px-3 py-2 text-sm font-semibold text-[#14745f]" onClick={() => setActiveView('Patients')} type="button">
              + Patient
            </button>
            <button className="rounded-lg bg-[#34d399] px-3 py-2 text-sm font-semibold text-[#10231f]" onClick={() => setActiveView('Agenda')} type="button">
              Nouvelle consultation
            </button>
          </div>
        </div>
      </header>

      <section className="border-b border-[#d8e5e0] bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1f8a70]">o7 PulseCRM Medical Demo</p>
            <h1 className="mt-2 text-3xl font-semibold md:text-5xl">{activeView}</h1>
            <p className="mt-2 max-w-2xl text-sm text-[#58706a]">
              Mini CRM medical presentable: patients, rendez-vous, parcours de soins, facturation et priorites IA.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat label="Patients actifs" value="146" />
            <Stat label="CA potentiel" value={money(total)} />
            <Stat label="No-show risque" value="6%" />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-5 py-5">
        {activeView === 'Tableau clinique' ? <Dashboard selected={selected} setSelected={setSelected} total={total} /> : null}
        {activeView === 'Patients' ? <Patients selected={selected} setSelected={setSelected} /> : null}
        {activeView === 'Agenda' ? <Agenda /> : null}
        {activeView === 'Pipeline soins' ? <Pipeline selected={selected} setSelected={setSelected} /> : null}
        {activeView === 'Facturation' ? <Billing total={total} /> : null}
        {activeView === 'IA medicale' ? <AI selected={selected} /> : null}
        {activeView === 'Pilotage' ? <Steering /> : null}
      </div>
    </main>
  );
}

function Dashboard({ selected, setSelected, total }: { selected: typeof patients[number]; setSelected: (patient: typeof patients[number]) => void; total: number }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          {[
            ['Demandes patients', '18', '#38bdf8'],
            ['Consultations', '11', '#34d399'],
            ['Plans proposes', '7', '#f59e0b'],
            ['Traitements', '9', '#fb7185'],
          ].map(([label, value, color]) => (
            <div key={label} className="rounded-lg border border-[#d8e5e0] bg-white p-4 shadow-sm">
              <div className="mb-4 h-1.5 rounded-full" style={{ backgroundColor: color }} />
              <div className="text-2xl font-semibold">{value}</div>
              <div className="text-sm font-medium">{label}</div>
              <div className="mt-2 text-xs text-[#58706a]">Parcours de soin actif</div>
            </div>
          ))}
        </div>
        <PatientPipeline selected={selected} setSelected={setSelected} />
      </div>
      <RightRail selected={selected} total={total} />
    </div>
  );
}

function PatientPipeline({ selected, setSelected }: { selected: typeof patients[number]; setSelected: (patient: typeof patients[number]) => void }) {
  return (
    <Panel title="Pipeline parcours patients">
      <div className="divide-y divide-[#edf3f1]">
        {patients.map((patient) => (
          <button
            key={patient.name}
            onClick={() => setSelected(patient)}
            className={`grid w-full gap-3 px-1 py-4 text-left transition md:grid-cols-[1.1fr_0.9fr_0.7fr_0.8fr] ${
              selected.name === patient.name ? 'bg-[#f0fbf7]' : 'hover:bg-[#fafdfc]'
            }`}
            type="button"
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
    </Panel>
  );
}

function RightRail({ selected, total }: { selected: typeof patients[number]; total: number }) {
  return (
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
        <button className="mt-5 w-full rounded-lg bg-[#34d399] px-4 py-3 text-sm font-semibold text-[#10231f]" type="button">
          Preparer relance patient
        </button>
      </div>
      <Panel title="Agenda du jour">
        <div className="space-y-3">
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
      </Panel>
      <Panel title="Automations patients">
        <div className="grid gap-2 text-sm">
          {['Rappel SMS J-1', 'Devis non signe', 'Relance post-operatoire', 'Alerte dossier incomplet'].map((item) => (
            <div key={item} className="flex items-center justify-between rounded-lg bg-[#f7faf9] px-3 py-2">
              <span>{item}</span>
              <span className="text-xs font-semibold text-[#14745f]">Actif</span>
            </div>
          ))}
        </div>
      </Panel>
    </aside>
  );
}

function Patients({ selected, setSelected }: { selected: typeof patients[number]; setSelected: (patient: typeof patients[number]) => void }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Panel title="Registre patients">
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_180px_180px]">
          <input className="rounded-lg border border-[#d8e5e0] bg-[#f7faf9] px-3 py-2 text-sm" placeholder="Recherche patient, soin, medecin..." />
          <button className="rounded-lg border border-[#d8e5e0] px-3 py-2 text-sm font-semibold text-[#14745f]" type="button">Importer patients</button>
          <button className="rounded-lg bg-[#34d399] px-3 py-2 text-sm font-semibold" type="button">Nouveau patient</button>
        </div>
        <div className="overflow-hidden rounded-lg border border-[#edf3f1]">
          {patients.map((patient) => (
            <button key={patient.name} onClick={() => setSelected(patient)} className="grid w-full gap-3 border-b border-[#edf3f1] px-4 py-3 text-left md:grid-cols-[1fr_1fr_130px_140px]" type="button">
              <div><b>{patient.name}</b><div className="text-xs text-[#58706a]">{patient.age} ans - {patient.doctor}</div></div>
              <div><b className="text-sm">{patient.need}</b><div className="text-xs text-[#58706a]">{patient.next}</div></div>
              <div className="text-sm font-semibold">{money(patient.value)}</div>
              <div className="rounded-full bg-[#e7f7f2] px-3 py-1 text-center text-xs font-semibold text-[#14745f]">{patient.status}</div>
            </button>
          ))}
        </div>
      </Panel>
      <Panel title="Fiche patient">
        <div className="space-y-3 text-sm">
          <h3 className="text-2xl font-semibold">{selected.name}</h3>
          <p className="text-[#58706a]">{selected.need}, suivi par {selected.doctor}</p>
          {['Consentement numerique', 'Questionnaire sante', 'Devis traitement', 'Rappel automatique'].map((item, index) => (
            <div key={item} className="flex items-center justify-between rounded-lg bg-[#f7faf9] px-3 py-2">
              <span>{item}</span>
              <span className={index < 2 ? 'text-[#14745f]' : 'text-[#f59e0b]'}>{index < 2 ? 'OK' : 'A faire'}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Agenda() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Panel title="Planning cabinet">
        <div className="grid gap-3">
          {agenda.map(([time, type, name, room, status]) => (
            <div key={`${time}-${name}`} className="grid grid-cols-[70px_1fr_130px_130px] items-center gap-3 rounded-lg border border-[#edf3f1] bg-[#fdfefe] p-4">
              <div className="text-lg font-semibold text-[#14745f]">{time}</div>
              <div><b>{type}</b><div className="text-sm text-[#58706a]">{name}</div></div>
              <div className="text-sm font-medium">{room}</div>
              <div className="rounded-full bg-[#e7f7f2] px-3 py-1 text-center text-xs font-semibold text-[#14745f]">{status}</div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Occupation salles">
        <div className="space-y-4">
          {['Salle 1', 'Salle 2', 'Salle 3', 'Visio'].map((room, index) => (
            <div key={room}>
              <div className="mb-1 flex justify-between text-sm"><span>{room}</span><b>{[72, 88, 54, 40][index]}%</b></div>
              <div className="h-3 rounded-full bg-[#dce9e5]"><div className="h-3 rounded-full bg-[#1f8a70]" style={{ width: `${[72, 88, 54, 40][index]}%` }} /></div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Pipeline({ selected, setSelected }: { selected: typeof patients[number]; setSelected: (patient: typeof patients[number]) => void }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Panel title="Kanban soins">
        <div className="grid gap-3 md:grid-cols-4">
          {pipeline.map((column) => (
            <div key={column.title} className="rounded-lg border border-[#d8e5e0] bg-[#f7faf9] p-3">
              <div className="mb-3 h-1.5 rounded-full" style={{ backgroundColor: column.color }} />
              <h3 className="font-semibold">{column.title}</h3>
              <div className="mt-3 space-y-2">
                {column.items.map((item) => (
                  <button key={item} onClick={() => setSelected(patients.find((patient) => item.includes(patient.name.split(' ')[0])) || selected)} className="w-full rounded-lg bg-white p-3 text-left text-sm shadow-sm" type="button">
                    {item}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <RightRail selected={selected} total={0} />
    </div>
  );
}

function Billing({ total }: { total: number }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Panel title="Devis et facturation">
        <div className="grid gap-3">
          {patients.map((patient, index) => (
            <div key={patient.name} className="grid grid-cols-[1fr_140px_130px_130px] items-center gap-3 rounded-lg border border-[#edf3f1] p-3">
              <div><b>{patient.name}</b><div className="text-xs text-[#58706a]">{patient.need}</div></div>
              <div className="font-semibold">{money(patient.value)}</div>
              <div>{index === 0 ? 'A signer' : index === 1 ? 'Assurance' : 'Planifie'}</div>
              <button className="rounded-lg bg-[#e7f7f2] px-3 py-2 text-xs font-semibold text-[#14745f]" type="button">Relancer</button>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Revenus cabinet">
        <div className="text-4xl font-semibold">{money(total)}</div>
        <p className="mt-2 text-sm text-[#58706a]">Potentiel court terme sur les parcours ouverts.</p>
        <div className="mt-5 space-y-3">
          {['Acomptes recus', 'Paiements restants', 'Assurances'].map((label, index) => (
            <div key={label} className="flex justify-between rounded-lg bg-[#f7faf9] px-3 py-2"><span>{label}</span><b>{money([2800, 4200, 1540][index])}</b></div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function AI({ selected }: { selected: typeof patients[number] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_390px]">
      <Panel title="Priorites IA medicale">
        <div className="grid gap-3 md:grid-cols-3">
          {patients.slice(0, 3).map((patient) => (
            <div key={patient.name} className="rounded-lg border border-[#d8e5e0] bg-[#f7faf9] p-4">
              <div className="text-sm text-[#58706a]">Score {patient.score}/100</div>
              <h3 className="mt-1 font-semibold">{patient.name}</h3>
              <p className="mt-2 text-sm">{patient.next}</p>
              <button className="mt-4 rounded-lg bg-[#10231f] px-3 py-2 text-xs font-semibold text-white" type="button">Generer message</button>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Message suggere">
        <div className="rounded-lg bg-[#f7faf9] p-4 text-sm leading-6">
          Bonjour {selected.name.split(' ')[0]}, votre plan de soin {selected.need.toLowerCase()} est pret. Le cabinet peut vous recevoir cette semaine pour finaliser les prochaines etapes.
        </div>
        <div className="mt-3 flex gap-2">
          <button className="rounded-lg bg-[#34d399] px-3 py-2 text-sm font-semibold" type="button">Envoyer SMS</button>
          <button className="rounded-lg border border-[#d8e5e0] px-3 py-2 text-sm font-semibold text-[#14745f]" type="button">Modifier</button>
        </div>
      </Panel>
    </div>
  );
}

function Steering() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Panel title="Pilotage operationnel">
        <div className="grid gap-3 md:grid-cols-3">
          <Stat label="Taux occupation agenda" value="84%" />
          <Stat label="Conversion plan de soin" value="41%" />
          <Stat label="Delai moyen rappel" value="18 min" />
        </div>
        <div className="mt-5 space-y-3">
          {['Implantologie', 'Orthodontie', 'Cardiologie', 'Suivi chronique'].map((label, index) => (
            <div key={label}>
              <div className="mb-1 flex justify-between text-sm"><span>{label}</span><b>{[58, 31, 22, 18][index]}k EUR</b></div>
              <div className="h-3 rounded-full bg-[#dce9e5]"><div className="h-3 rounded-full bg-[#1f8a70]" style={{ width: `${[92, 64, 48, 36][index]}%` }} /></div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Equipe cabinet">
        {['Dr Ramos', 'Dr Chen', 'Dr Alvarez', 'Accueil'].map((name, index) => (
          <div key={name} className="mb-3 flex items-center justify-between rounded-lg bg-[#f7faf9] px-3 py-3">
            <span>{name}</span>
            <b>{[9, 6, 7, 18][index]} actions</b>
          </div>
        ))}
      </Panel>
    </div>
  );
}
